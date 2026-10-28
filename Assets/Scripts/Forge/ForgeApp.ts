import { Interactable } from "InteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import { DragInteractorEvent, InteractorEvent } from "InteractionKit.lspkg/Core/Interactor/InteractorEvent"

import { CHIPS, Footprint, Layout, Palette, ReadoutLine, Timing } from "./ForgeConfig"
import { BuildKit, FLAT_ON_DESK, FootprintMesh, SegmentRing, fitLabel, makeArrow, makeInteractive, makeLabel, makeObject, makePanel } from "./ForgeBuild"
import { ForgeBackend } from "./ForgeBackend"
import { ForgePart } from "./ForgePart"
import { ForgeDesign, ForgeJob, ForgeOrientation } from "./ForgeTypes"

type Phase = "idle" | "designing" | "ready" | "exporting"

/**
 * Forge - ask for a printable part, see it at 1:1 print size on the desk edge,
 * catch the overhangs before you waste the filament, then write the STL.
 *
 * This component builds the whole interactive layer at start so the layout
 * lives in ForgeConfig where it can be tuned in one place.
 */
@component
export class ForgeApp extends BaseScriptComponent {
  @input boxMesh: RenderMesh
  @input coneMesh: RenderMesh
  @input cylinderMesh: RenderMesh
  @input unlitMaterial: Material
  @input partMaterial: Material
  @input font: Font

  @input hookPrefab: ObjectPrefab
  @input clipPrefab: ObjectPrefab
  @input tagPrefab: ObjectPrefab

  @input hookJson: JsonAsset
  @input clipJson: JsonAsset
  @input tagJson: JsonAsset

  @input internetModule: InternetModule
  @input cameraObject: SceneObject
  @input deskEdgeHighlight: SceneObject
  @input printerRingAnchor: SceneObject

  @input
  @hint("Skip the live service and answer every request from Assets/ForgeCache.")
  simulateOffline: boolean = false

  @input
  @allowUndefined
  chimeAudio: AudioTrackAsset

  // --- runtime state -------------------------------------------------------
  private kit: BuildKit
  private backend: ForgeBackend
  private part: ForgePart
  private phase: Phase = "idle"

  private uiRoot: SceneObject
  private chipsRoot: SceneObject
  private partUiRoot: SceneObject

  private designRing: SegmentRing
  private printerRing: SegmentRing
  private arrow: SceneObject
  private edgeTarget: SceneObject

  private plateMaterials: Material[] = []
  private titleText: Text
  private dimsText: Text
  private overhangText: Text
  private statusText: Text
  /** Footer cell saying which path produced the part. See sourceLabel(). */
  private sourceText: Text
  private printerFileText: Text

  /** The red "where supports would go" patch on the desk under the part. */
  private footprint: FootprintMesh

  private designRingElapsed = 0
  /** Time since the design arrived, for the ring's fill-on-arrival. */
  private designFillElapsed = 0
  private exportRingElapsed = 0
  private exportRingTarget = 0
  private overhangVisible = true
  private overhangClearAt = -1
  private arrowActive = false
  private audio: AudioComponent | null = null
  /** False on a SPECS device, where the room is real. See hidePreviewStandIns. */
  private inEditor = true

  /** Named SIK targets, so LEAF scenarios can pinch exactly what a user would. */
  private targets: Map<string, Interactable> = new Map()

  /** The grab box over the part, used to slide it along the edge. */
  private partGrab: Interactable | null = null
  private dragging = false

  private pendingJob: ForgeJob | null = null
  private pendingInstance: SceneObject | null = null
  private lastFilename = ""

  /** Unwrapped text of each readout line, before fitLabel wraps it to the plate. */
  private lineValues: Map<string, string> = new Map()

  /** What the orientation readout was last rebuilt for. See syncOrientationReadout. */
  private lastOrientationKey = ""
  private lastFootprintScale = 0
  private lastFootprintX = 0

  // ------------------------------------------------------------------------

  onAwake() {
    this.createEvent("OnStartEvent").bind(() => this.onStart())
    this.createEvent("UpdateEvent").bind((e) => this.onUpdate(e.getDeltaTime()))
  }

  private onStart(): void {
    this.kit = {
      boxMesh: this.boxMesh,
      cylinderMesh: this.cylinderMesh,
      coneMesh: this.coneMesh,
      unlit: this.unlitMaterial,
      font: this.font
    }

    const cache = this.readCache()
    this.backend = new ForgeBackend(this.internetModule, cache)
    this.backend.forceOffline = this.simulateOffline

    this.uiRoot = makeObject(this.getSceneObject(), "ForgeRuntimeUI")
    this.part = new ForgePart(this.uiRoot, this.partMaterial)

    this.buildEdgeTarget()
    this.buildPartGrab()
    this.buildChips()
    this.buildPartUi()
    this.buildRings()
    this.buildArrow()
    this.buildAudio()

    this.hidePreviewStandIns()
    this.setPhase("idle")
    this.backend.warm()

    // Expose a handle so LEAF scenarios can drive and inspect the Lens.
    ;(global as any).forge = this
    print("[Forge] ready - pinch a chip to design a part")
  }

  /**
   * The desk, its legs, the printer, the printer's table and the pinch strip
   * along the desk edge are **stand-ins for the preview only**.
   *
   * On a SPECS device the user's real desk is already there, and painting a
   * grey slab over it is worse than painting nothing: it would float at the
   * wrong height, hide the real edge, and tell the user the Lens does not know
   * where their desk is. So everything that models the room is switched off
   * anywhere but the editor, and what is left is the part, the readout, the
   * buttons and the chips.
   *
   * What stays on device: `PrinterRingAnchor` and the chime parented to it,
   * because the progress ring and the sound should still come from the
   * direction of the real printer, and `DeskEdgeHighlight`, which marks where
   * the part is clamped on a real edge just as usefully as on a virtual one.
   *
   * LEAF runs in the preview, so no scenario is affected by any of this.
   *
   * **Unverified.** Nothing in this build has run on hardware; on device the
   * part lands at the x and z of the pinch that asked for it, but the desk
   * plane's height is still the authored `Layout.deskTopY` rather than a
   * WorldQuery hit on the real surface. That is the next thing to fix on a
   * device, and it cannot be fixed without one.
   */
  private hidePreviewStandIns(): void {
    this.inEditor = global.deviceInfoSystem.isEditor()
    if (this.inEditor) return

    // The runtime-built pinch strip along the virtual edge goes with the desk.
    if (this.edgeTarget) this.edgeTarget.enabled = false

    const keep = ["DeskEdgeHighlight", "PrinterRingAnchor"]
    let hidden = 0
    for (const rigName of ["DeskRig", "PrinterRig"]) {
      const rig = this.findSibling(rigName)
      if (!rig) continue
      const count = rig.getChildrenCount()
      for (let i = 0; i < count; i++) {
        const child = rig.getChild(i)
        if (keep.indexOf(child.name) >= 0) continue
        child.enabled = false
        hidden++
      }
    }
    print("[Forge] not in the editor - hid " + hidden + " preview stand-ins")
  }

  /** A SceneObject by name among ForgeApp's own siblings (children of `Forge`). */
  private findSibling(name: string): SceneObject | null {
    const parent = this.getSceneObject().getParent()
    if (!parent) return null
    const count = parent.getChildrenCount()
    for (let i = 0; i < count; i++) {
      const child = parent.getChild(i)
      if (child.name === name) return child
    }
    return null
  }

  // --- construction --------------------------------------------------------

  private readCache(): Map<string, ForgeDesign> {
    const map = new Map<string, ForgeDesign>()
    const pairs: { key: string; asset: JsonAsset }[] = [
      { key: "hook", asset: this.hookJson },
      { key: "clip", asset: this.clipJson },
      { key: "tag", asset: this.tagJson }
    ]
    for (const p of pairs) {
      if (!p.asset) {
        print("[Forge] cache missing for " + p.key)
        continue
      }
      try {
        map.set(p.key, JSON.parse(p.asset.getString()) as ForgeDesign)
      } catch (e) {
        print("[Forge] could not parse cached " + p.key + ": " + e)
      }
    }
    return map
  }

  /** A strip along the front edge the user can pinch to say "the edge is here". */
  private buildEdgeTarget(): void {
    const strip = makePanel(
      this.kit,
      this.uiRoot,
      "DeskEdgePinchTarget",
      new vec3(Layout.deskWidth, 2.5, 5),
      new vec3(0, Layout.deskTopY + 0.5, Layout.deskFrontZ + 1),
      new vec4(1, 1, 1, 0.05)
    )
    this.edgeTarget = strip.root
    const interactable = makeInteractive(strip.root, new vec3(Layout.deskWidth, 2.5, 5))
    interactable.onTriggerEnd.add((e: InteractorEvent) => {
      const hit = e.interactor.targetHitPosition
      if (!hit) return
      this.setEdgeAt(hit.x)
    })
    this.targets.set("edge", interactable)
    interactable.onHoverEnter.add(() => (strip.material.mainPass.baseColor = new vec4(1, 1, 1, 0.16)))
    interactable.onHoverExit.add(() => (strip.material.mainPass.baseColor = new vec4(1, 1, 1, 0.04)))
  }

  /**
   * Grab the part to slide it along the desk edge.
   *
   * Only the sideways component of the drag is used, so the part can never
   * leave the edge — letting go simply stops it where it is, which is the
   * "snaps back to the edge on release" the brief asks for.
   */
  private buildPartGrab(): void {
    const grab = makeInteractive(this.part.grabObject, new vec3(8, 8, 8))
    this.targets.set("part", grab)
    this.partGrab = grab

    grab.onDragStart.add(() => {
      this.dragging = true
      if (this.deskEdgeHighlight) this.deskEdgeHighlight.enabled = true
    })
    grab.onDragUpdate.add((e: DragInteractorEvent) => {
      if (!this.part.hasPart) return
      const delta = e.dragVector
      if (!delta) return
      this.setEdgeAt(this.part.edgeX + delta.x)
    })
    grab.onDragEnd.add(() => {
      this.dragging = false
    })
  }

  private buildChips(): void {
    this.chipsRoot = makeObject(this.uiRoot, "PromptChips")
    for (let i = 0; i < CHIPS.length; i++) {
      const chip = CHIPS[i]
      const x = (i - 1) * Layout.chipSpacingX
      const slab = makePanel(
        this.kit,
        this.chipsRoot,
        "Chip " + chip.key,
        new vec3(Layout.chipSize.w, 0.6, Layout.chipSize.d),
        new vec3(x, Layout.deskTopY + Layout.surfaceLift, Layout.chipZ),
        Palette.chipFill
      )
      makeLabel(
        this.kit,
        slab.root,
        "Chip Label " + chip.key,
        chip.label,
        new vec3(0, 0.6, 0),
        1.2,
        Palette.text,
        FLAT_ON_DESK,
        Layout.chipSize.w - 1.5
      )
      const interactable = makeInteractive(slab.root, new vec3(Layout.chipSize.w, 0.6, Layout.chipSize.d))
      this.targets.set("chip:" + chip.key, interactable)
      interactable.onHoverEnter.add(() => (slab.material.mainPass.baseColor = Palette.uiFillHover))
      interactable.onHoverExit.add(() => (slab.material.mainPass.baseColor = Palette.chipFill))
      interactable.onTriggerEnd.add((e: InteractorEvent) =>
        this.requestPart(chip.key, chip.prompt, e.interactor.targetHitPosition)
      )
    }
  }

  /**
   * The rotation that aims the readout plate's face (its local +Y) at the
   * seated eye, computed once from the authored pose rather than billboarded —
   * a plate that chases the head swims around in peripheral vision.
   *
   * Pitch about X raises the face from flat towards the user; yaw about Y
   * swings it across to account for the plate sitting off to the left.
   */
  private plateFacingRotation(): quat {
    const target = Layout.plateFaceTarget
    const dx = target.x - Layout.plateX
    const dy = target.y - (Layout.deskTopY + Layout.plateAboveDesk)
    const dz = target.z - Layout.plateZ
    const horizontal = Math.sqrt(dx * dx + dz * dz)
    const pitch = Math.atan2(horizontal, dy)
    const yaw = Math.atan2(dx, dz)
    return quat
      .angleAxis(yaw, vec3.up())
      .multiply(quat.angleAxis(pitch, vec3.right()))
  }

  private buildPartUi(): void {
    this.partUiRoot = makeObject(this.uiRoot, "PartControls")

    // --- readout plate: a floating upright tag above and left of the part --
    //
    // It is off the desk entirely (build 2 had it lying on the surface), which
    // is what lets each of the three main lines be 1.6 cm — about 1.3 degrees
    // of visual angle from the seated eye. See Layout.plateSize for why.
    //
    // The tag is a panel whose thin axis (local +Y) is aimed at the seated eye,
    // so FLAT_ON_DESK still orients the labels correctly against its face: the
    // text faces local +Y and reads from local -Z (top) down to +Z (bottom).
    const plate = makePanel(
      this.kit,
      this.partUiRoot,
      "ReadoutPlate",
      new vec3(Layout.plateSize.w, 0.6, Layout.plateSize.h),
      new vec3(Layout.plateX, Layout.deskTopY + Layout.plateAboveDesk, Layout.plateZ),
      Palette.plateFill,
      this.plateFacingRotation()
    )
    this.plateMaterials.push(plate.material)

    // Labels sit just proud of the plate face. More negative local z is higher
    // up the face, because FLAT_ON_DESK points text away from the user.
    const lineY = 0.6
    const pw = ReadoutLine.maxWidth
    const minH = ReadoutLine.minHeight
    this.titleText = makeLabel(this.kit, plate.root, "Readout Title", "", new vec3(0, lineY, ReadoutLine.titleZ), ReadoutLine.title, Palette.textOnPlate, FLAT_ON_DESK, pw, ReadoutLine.titleMaxLines, minH)
    this.dimsText = makeLabel(this.kit, plate.root, "Readout Dims", "", new vec3(0, lineY, ReadoutLine.dimsZ), ReadoutLine.dims, Palette.accent, FLAT_ON_DESK, pw, 1, minH)
    this.overhangText = makeLabel(this.kit, plate.root, "Readout Overhang", "", new vec3(0, lineY, ReadoutLine.overhangZ), ReadoutLine.overhang, Palette.textOnPlate, FLAT_ON_DESK, pw, 1, minH)

    // Footer: one row, two cells. What the export is doing on the left, which
    // path produced the part on the right.
    this.statusText = makeLabel(this.kit, plate.root, "Readout Status", "", new vec3(ReadoutLine.statusX, lineY, ReadoutLine.footerZ), ReadoutLine.footerHeight, Palette.textOnPlate, FLAT_ON_DESK, ReadoutLine.statusMaxWidth, 1, ReadoutLine.footerMinHeight)
    this.sourceText = makeLabel(this.kit, plate.root, "Readout Source", "", new vec3(ReadoutLine.sourceX, lineY, ReadoutLine.footerZ), ReadoutLine.footerHeight, Palette.accent, FLAT_ON_DESK, ReadoutLine.sourceMaxWidth, 1, ReadoutLine.footerMinHeight)

    // --- button block, two rows of three ----------------------------------
    // `label` names the target for LEAF; `caption` is what the button reads.
    // The two long captions wrap so they fit an 8 cm button at a size that can
    // actually be made out from where the user sits.
    const defs = [
      { row: 0, col: 0, label: "Bigger", caption: "Bigger", action: () => this.onBigger() },
      { row: 0, col: 1, label: "Smaller", caption: "Smaller", action: () => this.onSmaller() },
      { row: 0, col: 2, label: "Flip", caption: "Flip", action: () => this.onFlip() },
      { row: 1, col: 0, label: "Turn", caption: "Turn", action: () => this.onTurn() },
      { row: 1, col: 1, label: "Auto-orient", caption: "Auto\norient", action: () => this.onAutoOrient() },
      { row: 1, col: 2, label: "Export STL", caption: "Export\nSTL", action: () => this.onExport() }
    ]

    for (const def of defs) {
      // Front row centres sit 2 cm behind the block's front boundary.
      const z = Layout.buttonBlockStartZ - Layout.buttonSize.d / 2 - def.row * (Layout.buttonSize.d + Layout.buttonGap)
      const x = Layout.buttonColumnX[def.col]
      const slab = makePanel(
        this.kit,
        this.partUiRoot,
        "Button " + def.label,
        new vec3(Layout.buttonSize.w, 0.6, Layout.buttonSize.d),
        new vec3(x, Layout.deskTopY + Layout.surfaceLift, z),
        Palette.uiFill
      )
      makeLabel(this.kit, slab.root, "Label " + def.label, def.caption, new vec3(0, 0.6, 0), 1.4, Palette.text, FLAT_ON_DESK, Layout.buttonSize.w - 1.5)

      const interactable = makeInteractive(slab.root, new vec3(Layout.buttonSize.w, 0.6, Layout.buttonSize.d))
      this.targets.set("button:" + def.label, interactable)
      interactable.onHoverEnter.add(() => (slab.material.mainPass.baseColor = Palette.uiFillHover))
      interactable.onHoverExit.add(() => (slab.material.mainPass.baseColor = Palette.uiFill))
      interactable.onTriggerStart.add(() => (slab.material.mainPass.baseColor = Palette.uiFillPressed))
      interactable.onTriggerEnd.add(() => {
        slab.material.mainPass.baseColor = Palette.uiFillHover
        def.action()
      })
    }
  }

  private buildRings(): void {
    this.designRing = new SegmentRing(
      this.kit,
      this.uiRoot,
      "DesigningRing",
      Layout.designRingDiameter,
      24,
      Palette.ringTrack,
      Palette.ringFill
    )
    this.designRing.object.getTransform().setLocalRotation(FLAT_ON_DESK)
    this.designRing.setEnabled(false)

    // The red support patch lives on the desk, not on the part, so it stays
    // flat and visible however the part is turned.
    this.footprint = new FootprintMesh(this.kit, this.uiRoot, "SupportFootprint", Footprint.color)

    const anchor = this.printerRingAnchor ?? this.uiRoot
    this.printerRing = new SegmentRing(
      this.kit,
      anchor,
      "PrinterProgressRing",
      Layout.printerRingDiameter,
      24,
      Palette.ringTrack,
      Palette.ringFill
    )
    // Turn the ring to face the user rather than down the world axes.
    const toUser = new vec3(-Layout.printerX, 0, -Layout.printerZ)
    const yaw = Math.atan2(toUser.x, toUser.z)
    this.printerRing.object.getTransform().setLocalRotation(quat.fromEulerAngles(0, yaw, 0))
    this.printerRing.setEnabled(false)

    this.printerFileText = makeLabel(
      this.kit,
      this.printerRing.object,
      "PrinterFilename",
      "",
      new vec3(0, -Layout.printerRingDiameter * 0.75, 0),
      1.6,
      Palette.accent
    )
  }

  private buildArrow(): void {
    this.arrow = makeArrow(this.kit, this.uiRoot, "AttentionArrow", Layout.arrowLength, Palette.accent)
    this.arrow.getTransform().setLocalPosition(new vec3(0, Layout.arrowY, Layout.arrowZ))
    this.arrow.enabled = false
  }

  private buildAudio(): void {
    if (!this.chimeAudio) {
      print("[Forge] no chime asset assigned - export will be silent")
      return
    }
    // Parent the chime to the printer so it plays from the user's right.
    const host = this.printerRingAnchor ?? this.uiRoot
    const obj = makeObject(host, "PrinterChime")
    this.audio = obj.createComponent("Component.AudioComponent") as AudioComponent
    this.audio.audioTrack = this.chimeAudio

    // Spatialise it, so "a chime plays from the right" is literally true:
    // the sound arrives from the printer's direction, not from the user's head.
    const spatial = this.audio.spatialAudio
    if (spatial) {
      spatial.enabled = true
      if (spatial.distanceEffect) spatial.distanceEffect.enabled = true
    }
  }

  // --- flow ----------------------------------------------------------------

  private setPhase(phase: Phase): void {
    this.phase = phase
    const showChips = phase === "idle"
    this.chipsRoot.enabled = showChips
    // The part, plate and buttons arrive together when the part lands.
    const showPartUi = phase === "ready" || phase === "exporting"
    this.partUiRoot.enabled = showPartUi
    this.part.anchor.enabled = showPartUi
    if (this.footprint) this.footprint.setEnabled(showPartUi && this.overhangVisible)
    this.designRing.setEnabled(phase === "designing")
  }

  /**
   * Pinch on a prompt chip. `hit` is where the pinch landed, which off the
   * editor is where the part is placed — there is no virtual desk edge to
   * stand it on. In the preview the authored edge wins and `hit` is ignored.
   */
  public requestPart(chipKey: string, prompt: string, hit?: vec3): void {
    if (this.phase === "designing") return
    print("[Forge] requesting: " + prompt)

    if (!this.inEditor && hit) this.part.setLandingPoint(hit.x, hit.z)

    this.part.clear()
    this.pendingJob = null
    this.pendingInstance = null
    this.designRingElapsed = 0
    this.designFillElapsed = 0
    this.lastOrientationKey = ""
    this.footprint.clear()
    this.designRing.object.getTransform().setLocalPosition(
      new vec3(this.part.edgeX, Layout.deskTopY + Layout.surfaceLift, Layout.deskFrontZ)
    )
    this.designRing.setProgress(0)
    this.setPhase("designing")

    this.backend.design(chipKey, prompt).then((job) => {
      const prefab = this.prefabFor(job.chipKey)
      if (!prefab) {
        print("[Forge] no prefab for chip " + job.chipKey)
        this.setPhase("idle")
        return
      }
      // Instantiate now, but only reveal once the designing ring has filled.
      const instance = prefab.instantiate(null)
      instance.name = "PartModel " + job.chipKey
      instance.enabled = false
      this.pendingJob = job
      this.pendingInstance = instance
    })
  }

  private prefabFor(key: string): ObjectPrefab | null {
    if (key === "hook") return this.hookPrefab
    if (key === "clip") return this.clipPrefab
    if (key === "tag") return this.tagPrefab
    return null
  }

  private landPart(): void {
    const job = this.pendingJob
    const instance = this.pendingInstance
    if (!job || !instance) return
    this.pendingJob = null
    this.pendingInstance = null

    instance.enabled = true
    if (!this.part.adopt(job, instance)) {
      this.setPhase("idle")
      return
    }

    this.overhangVisible = true
    this.overhangClearAt = -1
    this.lastFilename = ""
    this.printerRing.setEnabled(false)
    this.printerFileText.text = ""
    this.setArrowActive(false)
    this.setPhase("ready")
    this.setStatus("")
    this.refreshReadout("")
    this.lastOrientationKey = this.part.rotationKey
    this.lastFootprintScale = this.part.scaleFactor
    this.lastFootprintX = this.part.edgeX
    this.refreshFootprint()
    print(
      "[Forge] part landed: " +
        job.design.part.name +
        " " +
        job.design.dims_mm.join(" x ") +
        " mm, rendered height " +
        this.part.renderedHeightCm.toFixed(2) +
        " cm, overhang " +
        this.currentOverhangPct().toFixed(1) +
        "% (" +
        this.footprint.count +
        " support triangles), " +
        this.sourceLabel(job)
    )
  }

  /** Marks where along the edge the part clamps, and runs the highlight there. */
  public setEdgeAt(worldX: number): void {
    this.part.setEdgeX(worldX)
    if (this.deskEdgeHighlight) {
      this.deskEdgeHighlight.enabled = true
      const t = this.deskEdgeHighlight.getTransform()
      const p = t.getLocalPosition()
      t.setLocalPosition(new vec3(this.part.edgeX, p.y, p.z))
    }
    if (this.phase === "designing") {
      this.designRing.object.getTransform().setLocalPosition(
        new vec3(this.part.edgeX, Layout.deskTopY + Layout.surfaceLift, Layout.deskFrontZ)
      )
    }
  }

  // --- button actions ------------------------------------------------------

  public onBigger(): void {
    if (!this.part.hasPart) return
    this.part.step(1)
    this.refreshReadout("")
  }

  public onSmaller(): void {
    if (!this.part.hasPart) return
    this.part.step(-1)
    this.refreshReadout("")
  }

  public onFlip(): void {
    if (!this.part.hasPart) return
    this.part.flip()
    this.showOverhangAgain()
  }

  public onTurn(): void {
    if (!this.part.hasPart) return
    this.part.turn()
    this.showOverhangAgain()
  }

  public onAutoOrient(): void {
    const job = this.part.currentJob
    if (!job) return
    this.setStatus("orienting...")
    this.backend.autoOrient(job, this.part.scaleFactor).then((suggestion) => {
      // The suggestion has landed, so the progress word goes away again.
      this.setStatus("")
      // The plate and the red patch both follow from the rotation itself now:
      // once the animation settles, the part's key picks out the row and the
      // readout reads that row's figure. `suggested.key` is just this row.
      this.part.rotateToArray(suggestion.lens_quat)
      this.showOverhangAgain()
      this.refreshReadout("")
    })
  }

  public onExport(): void {
    const job = this.part.currentJob
    if (!job || this.phase === "exporting") return

    this.setPhase("exporting")
    this.setStatus("writing...")
    this.exportRingElapsed = 0
    this.exportRingTarget = 0
    this.printerRing.setProgress(0)
    this.printerRing.setEnabled(true)
    this.printerFileText.text = ""

    this.backend.orient(job, this.part.quatForExport, this.part.scaleFactor).then((result) => {
      this.lastFilename = result.filename
      this.exportRingTarget = 1
      print("[Forge] export complete: " + result.filename)
    })
  }

  private onExportFinished(): void {
    this.setPhase("ready")
    // The plate footer says what happened; the filename itself is shown large
    // under the printer ring, where it is actually readable.
    this.setStatus("saved")
    this.printerFileText.text = this.lastFilename
    this.printerRing.setColors(Palette.ok, Palette.ok)
    // The decision is made, so the red clears shortly after.
    this.overhangClearAt = getTime() + Timing.overhangClearDelay
    // Empty status, so the "saved" set above survives the refresh.
    this.refreshReadout("")

    if (!this.isLookingAtPrinter()) {
      this.setArrowActive(true)
      if (this.audio) {
        this.audio.play(1)
        print("[Forge] chime from the printer, arrow pointing that way")
      } else {
        print("[Forge] arrow pointing to the printer (no chime asset)")
      }
    } else {
      print("[Forge] printer already in view - no chime, no arrow")
    }
  }

  // --- overhang ------------------------------------------------------------

  private showOverhangAgain(): void {
    this.overhangVisible = true
    this.overhangClearAt = -1
  }

  /**
   * The row of `orientations[]` the part is currently sitting in.
   *
   * Flip and Turn only ever reach the 24 axis-aligned orientations, and
   * `/design` hands all of them over up front, so the readout stays honest
   * after a manual Flip with no network call at all — which is the whole point
   * of the table. Build 2 only updated the figure on Auto-orient, which was
   * wrong the moment anyone pressed Flip.
   *
   * Returns null if the payload predates the table, or the part has been
   * rotated somewhere that is not axis-aligned (mid-animation).
   */
  private currentOrientation(): ForgeOrientation | null {
    const job = this.part.currentJob
    if (!job || !job.design.orientations) return null
    const key = this.part.rotationKey
    for (const row of job.design.orientations) {
      if (row.key === key) return row
    }
    return null
  }

  /**
   * The backend's overhang figure for the orientation the part is in now.
   *
   * The red on the model is computed in the Lens from face angles; this comes
   * from the server's own mesh analysis. The two are a deliberate cross-check.
   */
  private currentOverhangPct(): number {
    const job = this.part.currentJob
    if (!job) return 0
    const row = this.currentOrientation()
    if (row) return row.metrics.overhang_pct
    // No table, or mid-rotation: fall back to the figure for the part as loaded.
    return job.design.metrics.overhang_pct
  }

  /**
   * Redraws the red support patch on the desk from the current orientation row.
   *
   * The overhanging faces point down, so from the chair they are invisible
   * however red they are. This is the same information laid flat where it can
   * be seen: the faces projected onto the bed, under the part, at the part's
   * current size. An orientation that needs no support draws nothing.
   */
  private refreshFootprint(): void {
    if (!this.footprint) return
    const row = this.currentOrientation()
    const bounds = this.part.worldBounds()
    if (!row || !bounds || !this.part.hasPart) {
      this.footprint.clear()
      return
    }

    this.footprint.setTriangles(row.footprint ? row.footprint.tris : [], this.part.scaleFactor)

    // Centred on the part's current footprint centre, flat on the desk.
    this.footprint.object
      .getTransform()
      .setLocalPosition(
        new vec3(
          (bounds.min.x + bounds.max.x) / 2,
          Layout.deskTopY + Footprint.liftCm,
          (bounds.min.z + bounds.max.z) / 2
        )
      )
    this.footprint.setEnabled(this.overhangVisible)
  }

  // --- readout -------------------------------------------------------------

  /** Sets a readout line and re-fits it, so long values wrap instead of spilling. */
  private setLine(
    text: Text,
    value: string,
    heightCm: number,
    maxWidthCm: number = ReadoutLine.maxWidth,
    maxLines: number = 1,
    minHeightCm: number = ReadoutLine.minHeight
  ): void {
    this.lineValues.set(text.getSceneObject().name, value)
    text.text = value
    fitLabel(text, value, heightCm, maxWidthCm, maxLines, minHeightCm)
  }

  /** The footer's left cell: what the export is doing. */
  private setStatus(value: string): void {
    this.setLine(
      this.statusText,
      value,
      ReadoutLine.footerHeight,
      ReadoutLine.statusMaxWidth,
      1,
      ReadoutLine.footerMinHeight
    )
  }

  /** The footer's right cell. */
  private setSource(value: string): void {
    this.setLine(
      this.sourceText,
      value,
      ReadoutLine.footerHeight,
      ReadoutLine.sourceMaxWidth,
      1,
      ReadoutLine.footerMinHeight
    )
  }

  /**
   * The footer's right cell: which path actually produced this part.
   *
   * This is the honesty marker. A demo that always says "live design" is
   * worthless the one time the service is down, so the plate says what really
   * happened — the live model, the keyword designer the service falls back to
   * when the model is not resident, or the copy shipped in the Lens.
   */
  private sourceLabel(job: ForgeJob): string {
    if (job.offline) return "offline copy"
    const source = job.design.part ? job.design.part.source : ""
    if (!source) return ""
    if (source.indexOf("ollama") === 0 || source.indexOf("cloud") === 0) return "live design"
    if (source === "keywords") return "quick design"
    return source
  }

  /** What a readout line says, ignoring any wrapping done to fit the plate. */
  private lineValue(text: Text): string {
    if (!text) return ""
    return this.lineValues.get(text.getSceneObject().name) ?? text.text
  }

  private refreshReadout(status: string): void {
    const job = this.part.currentJob
    if (!job) {
      this.setLine(this.titleText, "", ReadoutLine.title, ReadoutLine.maxWidth, ReadoutLine.titleMaxLines)
      this.setLine(this.dimsText, "", ReadoutLine.dims)
      this.setLine(this.overhangText, "", ReadoutLine.overhang)
      this.setStatus("")
      this.setSource("")
      return
    }
    const d = this.part.dimsMm
    this.setLine(this.titleText, job.design.part.name, ReadoutLine.title, ReadoutLine.maxWidth, ReadoutLine.titleMaxLines)
    this.setLine(this.dimsText, d[0].toFixed(0) + " x " + d[1].toFixed(0) + " x " + d[2].toFixed(0) + " mm", ReadoutLine.dims)
    this.setLine(this.overhangText, "Overhang " + this.currentOverhangPct().toFixed(1) + "%", ReadoutLine.overhang)
    if (status) this.setStatus(status)
    this.setSource(this.sourceLabel(job))
  }

  // --- per-frame -----------------------------------------------------------

  private onUpdate(dt: number): void {
    this.part.update(dt)

    if (this.phase === "designing") {
      this.designRingElapsed += dt
      if (!this.pendingInstance) {
        // Nothing has arrived yet, and /design takes 2-5 s — so the ring
        // sweeps rather than pretending to know how far along it is. Build 2
        // filled it over a fixed 2.4 s, which was a guess dressed up as
        // progress.
        this.designRing.setSweep(
          this.designRingElapsed / Timing.designRingSweepSeconds,
          Timing.designRingSweepArc
        )
      } else {
        // The design is in hand and the GLB is instantiated: fill the ring and
        // let the part appear as it completes.
        this.designFillElapsed += dt
        const t = Math.min(1, this.designFillElapsed / Timing.designRingFillSeconds)
        this.designRing.setProgress(t)
        if (t >= 1) this.landPart()
      }
    }

    if (this.phase === "exporting") {
      // Creep toward 90% while the backend writes, then run to full once the
      // filename lands, so the ring never finishes before the file does.
      const creepTarget = this.exportRingTarget >= 1 ? 1 : 0.9
      const speed = this.exportRingTarget >= 1 ? 2.5 : 0.45
      this.exportRingElapsed = Math.min(creepTarget, this.exportRingElapsed + dt * speed)
      this.printerRing.setProgress(this.exportRingElapsed)
      if (this.exportRingTarget >= 1 && this.exportRingElapsed >= 1) this.onExportFinished()
    }

    // Red overhang clears a couple of seconds after a successful export.
    if (this.overhangClearAt > 0 && getTime() >= this.overhangClearAt) {
      this.overhangVisible = false
      this.overhangClearAt = -1
      this.footprint.setEnabled(false)
    }
    if (this.part.hasPart) this.part.updateOverhangUniforms(this.overhangVisible)

    this.syncOrientationReadout()

    // The arrow goes as soon as the printer comes into view.
    if (this.arrowActive) {
      if (this.isLookingAtPrinter()) {
        this.setArrowActive(false)
      } else {
        this.aimArrowAtPrinter()
      }
    }

    this.updateReadoutFade()
  }

  /**
   * Keeps the overhang line and the red patch matched to the orientation the
   * part is actually in.
   *
   * Driven from the rotation rather than from the button that caused it, so
   * Flip, Turn, Auto-orient and a Bigger/Smaller step all land correctly for
   * the same reason. Only rebuilt when something has actually changed, and
   * never mid-animation — the key would not match a row anyway.
   */
  private syncOrientationReadout(): void {
    if (!this.part.hasPart) {
      this.lastOrientationKey = ""
      return
    }
    if (this.part.isAnimating) return

    const key = this.part.rotationKey
    const scale = this.part.scaleFactor
    const edgeX = this.part.edgeX
    if (
      key === this.lastOrientationKey &&
      Math.abs(scale - this.lastFootprintScale) < 0.0001 &&
      Math.abs(edgeX - this.lastFootprintX) < 0.01
    ) {
      return
    }

    const sizeChanged = key === this.lastOrientationKey
    this.lastOrientationKey = key
    this.lastFootprintScale = scale
    this.lastFootprintX = edgeX

    this.refreshFootprint()
    // A Bigger/Smaller step has already refreshed the readout, and the
    // percentage is scale-invariant, so only a new orientation needs the line.
    if (!sizeChanged) this.refreshReadout("")
  }

  private updateReadoutFade(): void {
    if (!this.part.hasPart || !this.cameraObject) return
    const head = this.cameraObject.getTransform().getWorldPosition()
    const partPos = this.part.anchor.getTransform().getWorldPosition()
    const distance = head.distance(partPos)
    const visible = distance <= Layout.readoutFadeDistance
    for (const m of this.plateMaterials) {
      const c = m.mainPass.baseColor
      m.mainPass.baseColor = new vec4(c.r, c.g, c.b, visible ? Palette.plateFill.a : 0)
    }
    this.titleText.enabled = visible
    this.dimsText.enabled = visible
    this.overhangText.enabled = visible
    this.statusText.enabled = visible
    this.sourceText.enabled = visible
  }

  private isLookingAtPrinter(): boolean {
    if (!this.cameraObject) return true
    const t = this.cameraObject.getTransform()
    // A camera with identity rotation looks down world -Z.
    const forward = t.forward.uniformScale(-1)
    const head = t.getWorldPosition()
    const toPrinter = new vec3(
      Layout.printerX - head.x,
      Layout.printerRingY - head.y,
      Layout.printerZ - head.z
    ).normalize()
    const dot = forward.normalize().dot(toPrinter)
    // Roughly a 50 degree cone - the printer counts as "in view" inside it.
    return dot > 0.64
  }

  private aimArrowAtPrinter(): void {
    if (!this.cameraObject) return
    const head = this.cameraObject.getTransform().getWorldPosition()
    const dx = Layout.printerX - head.x
    const dz = Layout.printerZ - head.z
    const yaw = Math.atan2(dx, dz)
    // The arrow points along its local +X, so offset the yaw by 90 degrees.
    this.arrow.getTransform().setLocalRotation(quat.fromEulerAngles(0, yaw + Math.PI / 2, 0))
  }

  private setArrowActive(on: boolean): void {
    this.arrowActive = on
    if (this.arrow) this.arrow.enabled = on
    if (on) this.aimArrowAtPrinter()
  }

  // --- test surface for LEAF ----------------------------------------------

  public getState(): any {
    const job = this.part.currentJob
    const bounds = this.part.worldBounds()
    return {
      phase: this.phase,
      hasPart: this.part.hasPart,
      offline: job ? job.offline : false,
      partName: job ? job.design.part.name : "",
      dimsMm: this.part.dimsMm,
      renderedHeightCm: this.part.renderedHeightCm,
      renderedHeightMm: this.part.renderedHeightCm * 10,
      overhangPct: this.currentOverhangPct(),
      scaleFactor: this.part.scaleFactor,
      quat: this.part.quatForExport,
      isAnimating: this.part.isAnimating,
      overhangVisible: this.overhangVisible,
      filename: this.lastFilename,
      statusText: this.lineValue(this.statusText),
      dimsText: this.lineValue(this.dimsText),
      offlineText: this.lineValue(this.sourceText),
      footerText: this.lineValue(this.sourceText),
      printerFileText: this.printerFileText ? this.printerFileText.text : "",
      orientationKey: this.part.hasPart ? this.part.rotationKey : "",
      footprintTriangles: this.footprint ? this.footprint.count : 0,
      footprintVisible: this.footprint ? this.footprint.object.enabled : false,
      chipsVisible: this.chipsRoot ? this.chipsRoot.enabled : false,
      designRingVisible: this.designRing ? this.designRing.object.enabled : false,
      printerRingVisible: this.printerRing ? this.printerRing.object.enabled : false,
      arrowVisible: this.arrow ? this.arrow.enabled : false,
      edgeX: this.part.edgeX,
      dragging: this.dragging,
      partBottomY: bounds ? bounds.min.y : null,
      deskTopY: Layout.deskTopY
    }
  }

  /**
   * A named SIK target. Scenario ids: "edge", "chip:hook" / "chip:clip" / "chip:tag",
   * and "button:Bigger" / "Smaller" / "Flip" / "Turn" / "Auto-orient" / "Export STL".
   */
  public getTarget(name: string): Interactable | null {
    return this.targets.get(name) ?? null
  }

  public listTargets(): string[] {
    const out: string[] = []
    this.targets.forEach((_v, k) => out.push(k))
    return out
  }

  /** Returns the Lens to the opening state: chips out, no part. */
  public reset(): void {
    this.part.clear()
    this.pendingJob = null
    this.pendingInstance = null
    this.lastFilename = ""
    this.lastOrientationKey = ""
    this.lastFootprintScale = 0
    this.footprint.clear()
    this.overhangVisible = true
    this.overhangClearAt = -1
    this.designRingElapsed = 0
    this.designFillElapsed = 0
    this.exportRingElapsed = 0
    this.exportRingTarget = 0
    this.printerRing.setEnabled(false)
    this.printerRing.setColors(Palette.ringTrack, Palette.ringFill)
    this.printerFileText.text = ""
    this.setArrowActive(false)
    if (this.deskEdgeHighlight) this.deskEdgeHighlight.enabled = false
    this.part.setEdgeX(0)
    this.refreshReadout("")
    this.setPhase("idle")
  }

  /** Lets a scenario run the offline path without unplugging the network. */
  public setOffline(on: boolean): void {
    this.simulateOffline = on
    if (this.backend) this.backend.forceOffline = on
  }
}



