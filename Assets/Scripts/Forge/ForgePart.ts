import { Layout, Palette, Timing } from "./ForgeConfig"
import { easeInOut, makeObject } from "./ForgeBuild"
import { ForgeJob } from "./ForgeTypes"

/**
 * The printed part itself: loading it, sizing it to the backend's real-world
 * dimensions, rotating it, and keeping it sitting on the desk edge.
 *
 * Hierarchy, so rotation never pushes the part through the desk:
 *   anchor  - slides along the front edge
 *     pivot - carries the rotation and the "sit on the desk" lift
 *       model - the loaded GLB, uniformly scaled to dims_mm
 */
export class ForgePart {
  public readonly anchor: SceneObject
  /**
   * An invisible box over the part that the user can grab to slide it along
   * the edge. It is a sibling of the model rather than a child, so resizing it
   * never disturbs the part's own 1:1 scale.
   */
  public readonly grabObject: SceneObject
  private readonly pivot: SceneObject
  private model: SceneObject | null = null
  private visuals: RenderMeshVisual[] = []

  private job: ForgeJob | null = null
  /** Uniform scale that makes the loaded mesh match dims_mm, before user scaling. */
  private baseScale = 1
  /** User scaling from Bigger / Smaller, 0.5 .. 2.0. */
  private userScale = 1
  /** Rotation relative to the loaded orientation. */
  private currentRotation: quat = quat.quatIdentity()

  private animFrom: quat = quat.quatIdentity()
  private animTo: quat = quat.quatIdentity()
  private animElapsed = 0
  private animating = false

  private partMaterial: Material | null = null

  constructor(parent: SceneObject, private readonly partMaterialSource: Material) {
    this.anchor = makeObject(parent, "PartAnchor")
    this.anchor.getTransform().setLocalPosition(new vec3(0, Layout.deskTopY, Layout.deskFrontZ))
    this.pivot = makeObject(this.anchor, "PartPivot")
    this.grabObject = makeObject(this.anchor, "PartGrabTarget")
  }

  /**
   * Keeps the grab box sitting over the part, so grabbing it feels like
   * grabbing the part itself however the part has been rotated or scaled.
   */
  public fitGrab(): void {
    const collider = this.grabObject.getComponent("Physics.ColliderComponent") as ColliderComponent
    if (!collider) return
    const bounds = this.worldBounds()
    if (!bounds) return

    // Never smaller than a comfortable pinch target, but kept tight: an
    // oversized box would reach out in front of the part and swallow pinches
    // meant for the buttons behind it.
    const minSize = 3
    const size = new vec3(
      Math.max(bounds.max.x - bounds.min.x, minSize),
      Math.max(bounds.max.y - bounds.min.y, minSize),
      Math.max(bounds.max.z - bounds.min.z, minSize)
    )
    const shape = Shape.createBoxShape()
    shape.size = size
    collider.shape = shape

    const centre = new vec3(
      (bounds.min.x + bounds.max.x) / 2,
      (bounds.min.y + bounds.max.y) / 2,
      (bounds.min.z + bounds.max.z) / 2
    )
    const anchorPos = this.anchor.getTransform().getWorldPosition()
    this.grabObject
      .getTransform()
      .setLocalPosition(new vec3(centre.x - anchorPos.x, centre.y - anchorPos.y, centre.z - anchorPos.z))
  }

  public get hasPart(): boolean {
    return this.model !== null
  }

  public get currentJob(): ForgeJob | null {
    return this.job
  }

  public get scaleFactor(): number {
    return this.userScale
  }

  public get isAnimating(): boolean {
    return this.animating
  }

  /** The part's rotation as the backend wants it: [x, y, z, w] in Lens axes. */
  public get quatForExport(): number[] {
    const q = this.currentRotation
    return [q.x, q.y, q.z, q.w]
  }

  /** Dimensions in mm at the current user scale, in the server's [x, y, z] order. */
  public get dimsMm(): number[] {
    if (!this.job) return [0, 0, 0]
    return this.job.design.dims_mm.map((d) => d * this.userScale)
  }

  /** The part's rendered height in centimetres, measured from the live mesh. */
  public get renderedHeightCm(): number {
    const bounds = this.worldBounds()
    return bounds ? bounds.max.y - bounds.min.y : 0
  }

  /** Where the part sits along the front edge. */
  public get edgeX(): number {
    return this.anchor.getTransform().getLocalPosition().x
  }

  public setEdgeX(x: number): void {
    const limit = Layout.edgeSlideLimit
    const clamped = Math.max(-limit, Math.min(limit, x))
    this.anchor.getTransform().setLocalPosition(new vec3(clamped, Layout.deskTopY, Layout.deskFrontZ))
  }

  /**
   * Instantiates a loaded part and sizes it so its height equals dims_mm[2].
   * Returns false if the prefab produced nothing to show.
   */
  public adopt(job: ForgeJob, instance: SceneObject): boolean {
    this.clear()
    this.job = job
    this.model = instance
    instance.setParent(this.pivot)

    this.visuals = []
    this.collectVisuals(instance, this.visuals)
    if (this.visuals.length === 0) {
      print("[Forge] loaded part has no renderable mesh")
      return false
    }

    // Give every surface the part material so the overhang pass owns the look.
    this.partMaterial = this.partMaterialSource.clone()
    for (const v of this.visuals) {
      v.clearMaterials()
      v.addMaterial(this.partMaterial)
    }

    // Measure the mesh as loaded, then scale so the Y extent is dims_mm[2] mm.
    instance.getTransform().setLocalScale(new vec3(1, 1, 1))
    instance.getTransform().setLocalPosition(new vec3(0, 0, 0))
    this.pivot.getTransform().setLocalRotation(quat.quatIdentity())
    this.pivot.getTransform().setLocalPosition(new vec3(0, 0, 0))

    const measured = this.worldBounds()
    const measuredHeight = measured ? measured.max.y - measured.min.y : 0
    const targetHeightCm = job.design.dims_mm[2] / 10

    if (measuredHeight > 0.0001) {
      this.baseScale = targetHeightCm / measuredHeight
    } else {
      print("[Forge] could not measure part height - leaving scale at 1")
      this.baseScale = 1
    }

    this.userScale = 1
    this.currentRotation = quat.quatIdentity()
    this.applyTransform()
    return true
  }

  public clear(): void {
    if (this.model) {
      this.model.destroy()
      this.model = null
    }
    this.visuals = []
    this.job = null
    this.userScale = 1
    this.baseScale = 1
    this.currentRotation = quat.quatIdentity()
    this.animating = false
  }

  /** Bigger / Smaller. Returns true when the step actually changed the size. */
  public step(direction: number): boolean {
    if (!this.model) return false
    const factor = direction > 0 ? 1 + Timing.scaleStep : 1 / (1 + Timing.scaleStep)
    const next = Math.max(Timing.scaleMin, Math.min(Timing.scaleMax, this.userScale * factor))
    if (Math.abs(next - this.userScale) < 0.0001) return false
    this.userScale = next
    this.applyTransform()
    return true
  }

  /** Flip - 90 degrees about the part's left-right axis. */
  public flip(): void {
    this.rotateTo(quat.angleAxis(Math.PI / 2, vec3.right()).multiply(this.currentRotation))
  }

  /** Turn - 90 degrees about the vertical axis. */
  public turn(): void {
    this.rotateTo(quat.angleAxis(Math.PI / 2, vec3.up()).multiply(this.currentRotation))
  }

  /** Animate to an absolute rotation, e.g. the backend's suggested orientation. */
  public rotateTo(target: quat): void {
    if (!this.model) return
    this.animFrom = this.currentRotation
    this.animTo = target
    this.animElapsed = 0
    this.animating = true
  }

  /** Apply a [x, y, z, w] rotation from the backend. */
  public rotateToArray(q: number[]): void {
    this.rotateTo(new quat(q[3], q[0], q[1], q[2]))
  }

  public update(dt: number): void {
    if (!this.animating) return
    this.animElapsed += dt
    const t = Math.min(1, this.animElapsed / Timing.rotateSeconds)
    this.currentRotation = quat.slerp(this.animFrom, this.animTo, easeInOut(t))
    this.applyTransform()
    if (t >= 1) {
      this.currentRotation = this.animTo
      this.applyTransform()
      this.animating = false
    }
  }

  /** Pushes rotation and scale onto the transforms, then re-seats on the desk. */
  private applyTransform(): void {
    if (!this.model) return
    this.model.getTransform().setLocalScale(vec3.one().uniformScale(this.baseScale * this.userScale))
    this.pivot.getTransform().setLocalRotation(this.currentRotation)
    this.pivot.getTransform().setLocalPosition(new vec3(0, 0, 0))

    // Lift so the part's lowest point rests exactly on the desk top.
    const bounds = this.worldBounds()
    if (bounds) {
      const lift = Layout.deskTopY - bounds.min.y
      this.pivot.getTransform().setLocalPosition(new vec3(0, lift, 0))
    }

    // The grab box follows the part through every rotation and scale step.
    this.fitGrab()
  }

  /** World-space AABB across every mesh in the part. */
  public worldBounds(): { min: vec3; max: vec3 } | null {
    if (this.visuals.length === 0) return null
    let min: vec3 | null = null
    let max: vec3 | null = null
    for (const v of this.visuals) {
      const vmin = v.worldAabbMin()
      const vmax = v.worldAabbMax()
      if (!min || !max) {
        min = new vec3(vmin.x, vmin.y, vmin.z)
        max = new vec3(vmax.x, vmax.y, vmax.z)
      } else {
        min = new vec3(Math.min(min.x, vmin.x), Math.min(min.y, vmin.y), Math.min(min.z, vmin.z))
        max = new vec3(Math.max(max.x, vmax.x), Math.max(max.y, vmax.y), Math.max(max.z, vmax.z))
      }
    }
    return min && max ? { min: min, max: max } : null
  }

  /**
   * Feeds the overhang shader the part's lowest world point, so it can tell a
   * downward-facing wall from the flat bottom that rests on the print bed.
   */
  public updateOverhangUniforms(enabled: boolean): void {
    if (!this.partMaterial) return
    const bounds = this.worldBounds()
    const minY = bounds ? bounds.min.y : Layout.deskTopY
    const pass = this.partMaterial.mainPass as any
    pass.forgeMinY = minY
    pass.forgeOverhangOn = enabled ? 1 : 0
    pass.forgeOverhangColor = Palette.overhang
    pass.forgeBodyColor = Palette.partBody
  }

  public get material(): Material | null {
    return this.partMaterial
  }

  private collectVisuals(obj: SceneObject, into: RenderMeshVisual[]): void {
    const v = obj.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
    if (v) into.push(v)
    const count = obj.getChildrenCount()
    for (let i = 0; i < count; i++) {
      this.collectVisuals(obj.getChild(i), into)
    }
  }
}

