import { Interactable } from "InteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import { DragInteractorEvent, InteractorEvent } from "InteractionKit.lspkg/Core/Interactor/InteractorEvent"

import { Backend, CHIPS, Layout, Palette, ReadoutLine, Timing } from "./ForgeConfig"
import { BuildKit, FLAT_ON_DESK, SegmentRing, fitLabel, makeArrow, makeInteractive, makeLabel, makeObject, makePanel } from "./ForgeBuild"
import { ForgeBackend } from "./ForgeBackend"
import { ForgePart } from "./ForgePart"
import { ForgeDesign, ForgeJob } from "./ForgeTypes"

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
  private offlineText: Text
  private printerFileText: Text

  private designRingElapsed = 0
  private exportRingElapsed = 0
  private exportRingTarget = 0
  private overhangVisible = true
  private overhangClearAt = -1
  private arrowActive = false
  private audio: AudioComponent | null = null

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

    this.setPhase("idle")
    this.backend.warm()

    // Expose a handle so LEAF scenarios can drive and inspect the Lens.
    ;(global as any).forge = this
    print("[Forge] ready - pinch a chip to design a part")
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
      interactable.onTriggerEnd.add(() => this.requestPart(chip.key, chip.prompt))
    }
  }

  private buildPartUi(): void {
    this.partUiRoot = makeObject(this.uiRoot, "PartControls")

    // --- readout plate, propped up on the desk to the left of the part ----
    //
    // Three big lines carry the readout — name, dimensions, overhang — with a
    // small footer for the export status and the offline marker. The plate
    // leans back towards the user so the text is read nearly face-on instead
    // of at the grazing angle a flat plate gives from a seated eye.
    const tilt = (Layout.plateTiltDeg * Math.PI) / 180
    // Leaning the plate drops its near edge; lift it so that edge still rests
    // on the desk rather than sinking through it.
    const plateLift = (Layout.plateSize.d / 2) * Math.sin(tilt) + Layout.surfaceLift
    const plate = makePanel(
      this.kit,
      this.partUiRoot,
      "ReadoutPlate",
      new vec3(Layout.plateSize.w, 0.6, Layout.plateSize.d),
      new vec3(Layout.plateX, Layout.deskTopY + plateLift, Layout.plateZ),
      Palette.plateFill,
      quat.fromEulerAngles(tilt, 0, 0)
    )
    this.plateMaterials.push(plate.material)

    // Labels sit just proud of the plate face and lean with it. More negative
    // local z is higher up the face, because FLAT_ON_DESK points text away.
    const lineY = 0.6
    const pw = ReadoutLine.maxWidth
    this.titleText = makeLabel(this.kit, plate.root, "Readout Title", "", new vec3(0, lineY, -3.8), ReadoutLine.title, Palette.textOnPlate, FLAT_ON_DESK, pw)
    this.dimsText = makeLabel(this.kit, plate.root, "Readout Dims", "", new vec3(0, lineY, -0.9), ReadoutLine.dims, Palette.accent, FLAT_ON_DESK, pw)
    this.overhangText = makeLabel(this.kit, plate.root, "Readout Overhang", "", new vec3(0, lineY, 1.6), ReadoutLine.overhang, Palette.textOnPlate, FLAT_ON_DESK, pw)
    this.statusText = makeLabel(this.kit, plate.root, "Readout Status", "", new vec3(0, lineY, 3.6), ReadoutLine.status, Palette.textOnPlate, FLAT_ON_DESK, pw)
    this.offlineText = makeLabel(this.kit, plate.root, "Readout Offline", "", new vec3(0, lineY, 4.9), ReadoutLine.offline, Palette.accent, FLAT_ON_DESK, pw)

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
    this.designRing.setEnabled(phase === "designing")
  }

  /** Pinch on a prompt chip. */
  public requestPart(chipKey: string, prompt: string): void {
    if (this.phase === "designing") return
    print("[Forge] requesting: " + prompt)

    this.part.clear()
    this.pendingJob = null
    this.pendingInstance = null
    this.designRingElapsed = 0
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
    this.setLine(this.statusText, "", ReadoutLine.status)
    this.refreshReadout("")
    print(
      "[Forge] part landed: " +
        job.design.part.name +
        " " +
        job.design.dims_mm.join(" x ") +
        " mm, rendered height " +
        this.part.renderedHeightCm.toFixed(2) +
        " cm" +
        (job.offline ? " (offline copy)" : "")
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
    this.setLine(this.statusText, "orienting...", ReadoutLine.status)
    this.backend.autoOrient(job, this.part.scaleFactor).then((suggestion) => {
      // The suggestion has landed, so the progress word goes away again.
      this.setLine(this.statusText, "", ReadoutLine.status)
      this.part.rotateToArray(suggestion.lens_quat)
      // The suggested orientation is the one with no overhang, so the plate
      // should read the backend's figure for that orientation.
      this.suggestedOverhangPct = suggestion.metrics ? suggestion.metrics.overhang_pct : 0
      this.usingSuggested = true
      this.showOverhangAgain()
      this.refreshReadout("")
    })
  }

  public onExport(): void {
    const job = this.part.currentJob
    if (!job || this.phase === "exporting") return

    this.setPhase("exporting")
    this.setLine(this.statusText, "writing...", ReadoutLine.status)
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
    this.setLine(this.statusText, this.lastFilename, ReadoutLine.status)
    this.printerFileText.text = this.lastFilename
    this.printerRing.setColors(Palette.ok, Palette.ok)
    // The decision is made, so the red clears shortly after.
    this.overhangClearAt = getTime() + Timing.overhangClearDelay
    this.refreshReadout(this.lastFilename)

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

  private usingSuggested = false
  private suggestedOverhangPct = 0

  private showOverhangAgain(): void {
    this.overhangVisible = true
    this.overhangClearAt = -1
  }

  /**
   * The plate shows the backend's overhang figure for the current orientation.
   * The red on the model is computed in the Lens from face angles, so the two
   * are a deliberate cross-check of each other.
   */
  private currentOverhangPct(): number {
    const job = this.part.currentJob
    if (!job) return 0
    if (this.usingSuggested) return this.suggestedOverhangPct
    return job.design.metrics.overhang_pct
  }

  // --- readout -------------------------------------------------------------

  /** Sets a readout line and re-fits it, so long values shrink instead of spilling. */
  private setLine(text: Text, value: string, heightCm: number): void {
    this.lineValues.set(text.getSceneObject().name, value)
    text.text = value
    fitLabel(text, value, heightCm, ReadoutLine.maxWidth)
  }

  /** What a readout line says, ignoring any wrapping done to fit the plate. */
  private lineValue(text: Text): string {
    if (!text) return ""
    return this.lineValues.get(text.getSceneObject().name) ?? text.text
  }

  private refreshReadout(status: string): void {
    const job = this.part.currentJob
    if (!job) {
      this.setLine(this.titleText, "", ReadoutLine.title)
      this.setLine(this.dimsText, "", ReadoutLine.dims)
      this.setLine(this.overhangText, "", ReadoutLine.overhang)
      this.setLine(this.statusText, "", ReadoutLine.status)
      this.setLine(this.offlineText, "", ReadoutLine.offline)
      return
    }
    const d = this.part.dimsMm
    this.setLine(this.titleText, job.design.part.name, ReadoutLine.title)
    this.setLine(this.dimsText, d[0].toFixed(0) + " x " + d[1].toFixed(0) + " x " + d[2].toFixed(0) + " mm", ReadoutLine.dims)
    this.setLine(this.overhangText, "Overhang " + this.currentOverhangPct().toFixed(1) + "%", ReadoutLine.overhang)
    if (status) this.setLine(this.statusText, status, ReadoutLine.status)
    this.setLine(this.offlineText, job.offline ? "offline copy" : "", ReadoutLine.offline)
  }

  // --- per-frame -----------------------------------------------------------

  private onUpdate(dt: number): void {
    this.part.update(dt)

    if (this.phase === "designing") {
      this.designRingElapsed += dt
      const t = Math.min(1, this.designRingElapsed / Timing.designRingSeconds)
      this.designRing.setProgress(t)
      // The part lands once the ring is full and the design has arrived.
      if (t >= 1 && this.pendingInstance) this.landPart()
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
    }
    if (this.part.hasPart) this.part.updateOverhangUniforms(this.overhangVisible)

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
    this.offlineText.enabled = visible
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
      offlineText: this.lineValue(this.offlineText),
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
    this.usingSuggested = false
    this.suggestedOverhangPct = 0
    this.overhangVisible = true
    this.overhangClearAt = -1
    this.designRingElapsed = 0
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



