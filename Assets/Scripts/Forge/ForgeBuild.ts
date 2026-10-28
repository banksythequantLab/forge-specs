import { Interactable } from "InteractionKit.lspkg/Components/Interaction/Interactable/Interactable"

/**
 * Small builders for the flat-on-desk furniture Forge puts in the world:
 * panels, labels, SIK-interactive targets, segmented rings and the arrow.
 *
 * Everything is built from a shared unit-cube mesh scaled to centimetres, so
 * the numbers in ForgeConfig read as real-world sizes.
 *
 * A panel is two objects on purpose: an unscaled `root` that carries the
 * position, the collider and any labels, and a `slab` child that carries the
 * non-uniform scale of the visible box. Parenting text to the scaled slab
 * would stretch the glyphs by the slab's aspect ratio.
 */

/** Rotation that lays a panel flat on the desk, face up, reading away from the user. */
export const FLAT_ON_DESK = quat.fromEulerAngles(-Math.PI / 2, 0, 0)

/** Text point size every label is authored at, before the object is scaled. */
const TEXT_BASE_SIZE = 32
/**
 * Height in cm of one line of TEXT_BASE_SIZE text on an unscaled object.
 *
 * Calibrated against the preview, not guessed: an earlier build used 22.5,
 * which made every label in the Lens thirty times too small to read.
 *
 * Do not try to measure this from `localAabb` at runtime — for a Text the
 * AABB is the layout box, not the glyph extent, so fitting to it shrinks the
 * text back to nothing.
 */
const TEXT_BASE_HEIGHT_CM = 0.75

/**
 * Width of an average glyph as a fraction of the line height, for Inter.
 * Measured off the preview and rounded up, so a fitted line never spills off
 * its panel. Erring high only costs a slightly smaller or earlier-wrapped
 * label; erring low puts text over the edge of the plate.
 */
const TEXT_ASPECT = 0.9

/**
 * Greedily wraps `value` so no line exceeds `maxChars`, keeping any line
 * breaks the caller already put in. A single word longer than `maxChars` is
 * left alone — fitLabel shrinks the whole block for that case instead.
 */
function wrapToChars(value: string, maxChars: number): string {
  if (maxChars < 1) return value
  const out: string[] = []
  for (const paragraph of value.split("\n")) {
    let line = ""
    for (const word of paragraph.split(" ")) {
      if (line.length === 0) {
        line = word
      } else if (line.length + 1 + word.length <= maxChars) {
        line += " " + word
      } else {
        out.push(line)
        line = word
      }
    }
    out.push(line)
  }
  return out.join("\n")
}

export interface BuildKit {
  boxMesh: RenderMesh
  cylinderMesh: RenderMesh
  coneMesh: RenderMesh
  /** Unlit material, cloned per object so colours can be set independently. */
  unlit: Material
  font: Font
}

export interface Panel {
  /** Unscaled. Position labels and colliders against this. */
  root: SceneObject
  /** The visible box; carries the non-uniform scale. */
  slab: SceneObject
  visual: RenderMeshVisual
  material: Material
}

export function makeObject(parent: SceneObject, name: string): SceneObject {
  const obj = global.scene.createSceneObject(name)
  obj.setParent(parent)
  return obj
}

/**
 * A coloured box with an unscaled root. `size` is the real size in centimetres.
 */
export function makePanel(
  kit: BuildKit,
  parent: SceneObject,
  name: string,
  size: vec3,
  position: vec3,
  color: vec4,
  rotation?: quat
): Panel {
  const root = makeObject(parent, name)
  const rt = root.getTransform()
  rt.setLocalPosition(position)
  rt.setLocalRotation(rotation ?? quat.quatIdentity())
  rt.setLocalScale(new vec3(1, 1, 1))

  const slab = makeObject(root, name + " Slab")
  slab.getTransform().setLocalPosition(new vec3(0, 0, 0))
  slab.getTransform().setLocalRotation(quat.quatIdentity())
  slab.getTransform().setLocalScale(size)

  const visual = slab.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
  visual.mesh = kit.boxMesh
  const material = kit.unlit.clone()
  material.mainPass.baseColor = color
  visual.clearMaterials()
  visual.addMaterial(material)

  return { root, slab, visual, material }
}

/** A plain coloured box with no root wrapper, for geometry that carries no labels. */
export function makeSlab(
  kit: BuildKit,
  parent: SceneObject,
  name: string,
  size: vec3,
  position: vec3,
  color: vec4,
  rotation?: quat,
  mesh?: RenderMesh
): { object: SceneObject; visual: RenderMeshVisual; material: Material } {
  const obj = makeObject(parent, name)
  const t = obj.getTransform()
  t.setLocalPosition(position)
  t.setLocalRotation(rotation ?? quat.quatIdentity())
  t.setLocalScale(size)

  const visual = obj.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
  visual.mesh = mesh ?? kit.boxMesh
  const material = kit.unlit.clone()
  material.mainPass.baseColor = color
  visual.clearMaterials()
  visual.addMaterial(material)
  return { object: obj, visual, material }
}

/**
 * A text label. `heightCm` is the height of one line in centimetres, and
 * `maxWidthCm` (when given) caps the block so it never spills off its panel.
 *
 * The height constant is calibrated against the preview; a long string is
 * shrunk so it stays inside `maxWidthCm` instead of spilling off its panel.
 *
 * Parent this to an unscaled object (a Panel's `root`), never to a scaled slab.
 */
export function makeLabel(
  kit: BuildKit,
  parent: SceneObject,
  name: string,
  value: string,
  position: vec3,
  heightCm: number,
  color: vec4,
  rotation?: quat,
  maxWidthCm?: number
): Text {
  const obj = makeObject(parent, name)
  const t = obj.getTransform()
  t.setLocalPosition(position)
  t.setLocalRotation(rotation ?? quat.quatIdentity())

  const text = obj.createComponent("Component.Text") as Text
  text.text = value
  if (kit.font) text.font = kit.font
  text.size = TEXT_BASE_SIZE
  text.textFill.color = color
  text.horizontalAlignment = HorizontalAlignment.Center
  text.verticalAlignment = VerticalAlignment.Center

  fitLabel(text, value, heightCm, maxWidthCm)
  return text
}

/**
 * Scales a label so one line is `heightCm` tall, shrinking further if the
 * block would be wider than `maxWidthCm`.
 */
export function fitLabel(text: Text, value: string, heightCm: number, maxWidthCm?: number): void {
  const t = text.getSceneObject().getTransform()

  let shown = value
  let height = heightCm

  if (maxWidthCm && maxWidthCm > 0) {
    // Wrap first — a shorter line at full size reads far better than the whole
    // string shrunk down to fit on one line.
    const maxChars = Math.floor(maxWidthCm / (TEXT_ASPECT * heightCm))
    shown = wrapToChars(value, maxChars)

    // Only shrink if something still does not fit, e.g. a long filename with
    // no spaces to break on.
    let longest = 0
    for (const line of shown.split("\n")) longest = Math.max(longest, line.length)
    const widthAtHeight = longest * TEXT_ASPECT * heightCm
    if (widthAtHeight > maxWidthCm) height = heightCm * (maxWidthCm / widthAtHeight)
  }

  if (shown !== text.text) text.text = shown

  const scale = height / TEXT_BASE_HEIGHT_CM
  t.setLocalScale(new vec3(scale, scale, scale))
}

/**
 * Makes a SceneObject respond to SIK interactors (hand pinch on device, mouse
 * click in Interactive Preview, and the LEAF interactor under test).
 * `size` is in centimetres and the object must be unscaled.
 */
export function makeInteractive(obj: SceneObject, size: vec3): Interactable {
  const collider = obj.createComponent("Physics.ColliderComponent") as ColliderComponent
  const shape = Shape.createBoxShape()
  // Flat targets get some depth so they are comfortable to hit.
  shape.size = new vec3(size.x, Math.max(size.y, 3), size.z)
  collider.shape = shape
  collider.debugDrawEnabled = false
  return obj.createComponent(Interactable.getTypeName()) as Interactable
}

/**
 * A ring built from box segments in its local XY plane, facing local +Z.
 * `setProgress(0..1)` fills it clockwise from the top.
 */
export class SegmentRing {
  public readonly object: SceneObject
  private readonly segments: { object: SceneObject; material: Material }[] = []
  private trackColor: vec4
  private fillColor: vec4

  constructor(
    kit: BuildKit,
    parent: SceneObject,
    name: string,
    diameter: number,
    segmentCount: number,
    trackColor: vec4,
    fillColor: vec4
  ) {
    this.object = makeObject(parent, name)
    this.trackColor = trackColor
    this.fillColor = fillColor

    const radius = diameter / 2
    const thickness = Math.max(0.5, diameter * 0.075)
    const arc = (2 * Math.PI * radius) / segmentCount

    for (let i = 0; i < segmentCount; i++) {
      // Start at the top (12 o'clock) and run clockwise.
      const angle = (i / segmentCount) * Math.PI * 2
      const x = Math.sin(angle) * radius
      const y = Math.cos(angle) * radius
      const seg = makeSlab(
        kit,
        this.object,
        name + " Seg " + i,
        new vec3(arc * 0.82, thickness, thickness),
        new vec3(x, y, 0),
        trackColor,
        quat.fromEulerAngles(0, 0, -angle)
      )
      this.segments.push({ object: seg.object, material: seg.material })
    }
  }

  public setProgress(t: number): void {
    const clamped = Math.max(0, Math.min(1, t))
    const filled = Math.round(clamped * this.segments.length)
    for (let i = 0; i < this.segments.length; i++) {
      this.segments[i].material.mainPass.baseColor = i < filled ? this.fillColor : this.trackColor
    }
  }

  /** Repaints the whole ring, e.g. green on a completed export. */
  public setColors(track: vec4, fill: vec4): void {
    this.trackColor = track
    this.fillColor = fill
    for (let i = 0; i < this.segments.length; i++) {
      this.segments[i].material.mainPass.baseColor = fill
    }
  }

  public setEnabled(on: boolean): void {
    this.object.enabled = on
  }
}

/** A flat arrow - shaft plus a cone head - pointing along its local +X. */
export function makeArrow(
  kit: BuildKit,
  parent: SceneObject,
  name: string,
  length: number,
  color: vec4
): SceneObject {
  const root = makeObject(parent, name)

  makeSlab(
    kit,
    root,
    name + " Shaft",
    new vec3(length * 0.7, length * 0.14, length * 0.14),
    new vec3(-length * 0.15, 0, 0),
    color
  )

  // The cone mesh points along +Y, so turn it to point along +X.
  makeSlab(
    kit,
    root,
    name + " Head",
    new vec3(length * 0.34, length * 0.34, length * 0.34),
    new vec3(length * 0.35, 0, 0),
    color,
    quat.fromEulerAngles(0, 0, -Math.PI / 2),
    kit.coneMesh
  )

  return root
}

/** Smoothing for the short Flip / Turn animations. */
export function easeInOut(t: number): number {
  const c = Math.max(0, Math.min(1, t))
  return c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2
}

