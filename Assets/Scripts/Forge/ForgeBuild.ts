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
 *
 * Re-measured in build 3 against a plate of known size, head-on: the title
 * "Headphone" (9 characters) rendered 8.8 cm wide on a 14 cm plate at a 1.6 cm
 * line, which is 0.61. Build 2's 0.9 was a third too wide, which is why the
 * readout wrapped and shrank lines that would have fitted. Rounded up to 0.66
 * so a fitted line still never spills: erring high only costs a slightly
 * smaller label, erring low puts text over the edge of the plate.
 */
const TEXT_ASPECT = 0.66

/**
 * Distance between consecutive baselines, as a multiple of the line height
 * `fitLabel` is asked for. Measured the same way: two 1.6 cm title lines sat
 * 2.26 cm apart.
 *
 * Needed because `heightCm` is the height of the glyphs, not of the block —
 * laying three 1.6 cm lines out 1.6 cm apart overlaps them, which is exactly
 * what the first cut of the floating plate did.
 */
export const TEXT_LINE_PITCH = 1.41

/**
 * The line height `fitLabel` actually settled on for a label, in cm.
 *
 * fitLabel encodes it in the object's uniform scale, so this is just that
 * scaling read back — the only honest way to find out, because a Text's AABB
 * is its layout box rather than its glyph extent.
 */
export function labelHeightCm(text: Text): number {
  return text.getSceneObject().getTransform().getLocalScale().x * TEXT_BASE_HEIGHT_CM
}

/** How tall a block of `lines` lines at `heightCm` actually is, in cm. */
export function textBlockHeightCm(heightCm: number, lines: number): number {
  return heightCm * (1 + TEXT_LINE_PITCH * Math.max(0, lines - 1))
}

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
  maxWidthCm?: number,
  maxLines?: number,
  minHeightCm?: number
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

  fitLabel(text, value, heightCm, maxWidthCm, maxLines, minHeightCm)
  return text
}

/**
 * Scales a label so one line is `heightCm` tall, wrapping it to `maxWidthCm`
 * and shrinking only when wrapping alone cannot make it fit.
 *
 * `maxLines` caps how tall the wrapped block may get — the readout's part name
 * is allowed two lines and no more, so a long name shrinks rather than pushing
 * the dimensions line off the plate. `minHeightCm` is the floor: below it the
 * line stops being readable at all, so it is better to let it overflow than to
 * pretend it is still legible.
 */
export function fitLabel(
  text: Text,
  value: string,
  heightCm: number,
  maxWidthCm?: number,
  maxLines?: number,
  minHeightCm?: number
): void {
  const t = text.getSceneObject().getTransform()

  let shown = value
  let height = heightCm

  if (maxWidthCm && maxWidthCm > 0) {
    const floor = minHeightCm ?? 0
    // Wrap first — a shorter line at full size reads far better than the whole
    // string shrunk down to fit on one line — then step the height down until
    // the wrapped block fits both the width and the line budget.
    for (let attempt = 0; attempt < 48; attempt++) {
      const maxChars = Math.max(1, Math.floor(maxWidthCm / (TEXT_ASPECT * height)))
      shown = wrapToChars(value, maxChars)

      const lines = shown.split("\n")
      let longest = 0
      for (const line of lines) longest = Math.max(longest, line.length)

      const tooWide = longest * TEXT_ASPECT * height > maxWidthCm + 0.001
      const tooTall = maxLines !== undefined && lines.length > maxLines
      if (!tooWide && !tooTall) break
      if (height <= floor + 0.0001) break
      height = Math.max(floor, height * 0.92)
    }
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

  /**
   * Indeterminate progress: lights a moving window of the ring rather than a
   * fill, for the wait on a service whose answer takes 2-5 s. `phase` runs 0..1
   * around the ring and wraps; `arc` is the fraction lit at once.
   */
  public setSweep(phase: number, arc: number): void {
    const n = this.segments.length
    const head = Math.floor((((phase % 1) + 1) % 1) * n)
    const width = Math.max(1, Math.round(arc * n))
    for (let i = 0; i < n; i++) {
      // How far this segment trails behind the sweep head, wrapped.
      const behind = (head - i + n) % n
      this.segments[i].material.mainPass.baseColor =
        behind < width ? this.fillColor : this.trackColor
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


/**
 * The flat red "where supports would go" patch, drawn on the desk under the
 * part from an orientation row's `footprint.tris`.
 *
 * The server gives the overhanging faces projected straight down onto the print
 * bed as a triangle list in millimetres, in its own bed frame, relative to the
 * part's footprint centre — so `scad (x, y)` becomes Lens `(x / 10, -y / 10)`
 * in the desk plane, times the part's current scale factor.
 *
 * Each triangle is emitted with both windings: nothing in the contract says
 * which way the server wound them, and a one-sided patch would be invisible
 * from exactly the seated eye this is meant to be seen from.
 */
export class FootprintMesh {
  public readonly object: SceneObject
  private readonly visual: RenderMeshVisual
  private readonly material: Material
  /** Held so the RenderMesh it produced is not collected under us. */
  private builder: MeshBuilder | null = null
  private triangleCount = 0

  constructor(kit: BuildKit, parent: SceneObject, name: string, color: vec4) {
    this.object = makeObject(parent, name)
    this.visual = this.object.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
    this.material = kit.unlit.clone()
    this.material.mainPass.baseColor = color
    // The contract asks for the patch to be slightly transparent; ForgeUnlit
    // is authored opaque, so the clone has to turn blending on for the alpha
    // in Footprint.color to mean anything.
    this.material.mainPass.blendMode = BlendMode.Normal
    this.visual.clearMaterials()
    this.visual.addMaterial(this.material)
    this.object.enabled = false
  }

  /** Rebuilds the patch. `tris` is three [x, y] millimetre points per triangle. */
  public setTriangles(tris: number[][], scale: number): void {
    if (!tris || tris.length < 3) {
      this.triangleCount = 0
      this.object.enabled = false
      return
    }

    const builder = new MeshBuilder([
      { name: "position", components: 3 },
      { name: "normal", components: 3 },
      { name: "texture0", components: 2 }
    ])
    builder.topology = MeshTopology.Triangles
    builder.indexType = MeshIndexType.UInt16

    const verts: number[] = []
    const indices: number[] = []
    // Millimetres to centimetres, at the size the part is currently shown.
    const k = scale / 10
    let count = 0

    for (let t = 0; t + 2 < tris.length; t += 3) {
      const base = count * 3
      for (let c = 0; c < 3; c++) {
        const p = tris[t + c]
        // position, then an up normal, then an unused uv.
        verts.push(p[0] * k, 0, -p[1] * k, 0, 1, 0, 0, 0)
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 1)
      count++
    }

    builder.appendVerticesInterleaved(verts)
    builder.appendIndices(indices)
    builder.updateMesh()
    this.visual.mesh = builder.getMesh()
    this.builder = builder
    this.triangleCount = count
    this.object.enabled = true
  }

  public clear(): void {
    this.triangleCount = 0
    this.object.enabled = false
  }

  public setEnabled(on: boolean): void {
    this.object.enabled = on && this.triangleCount > 0
  }

  /** How many triangles the current row asked for. 0 means nothing overhangs. */
  public get count(): number {
    return this.triangleCount
  }
}
