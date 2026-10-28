/**
 * Shapes returned by the Forge backend. See devpost/forge-api.md for the
 * authoritative contract; these mirror it field for field.
 */

export interface ForgeMetrics {
  dims_mm: number[]
  height_mm: number
  volume_cm3: number
  watertight: boolean
  overhang_area_mm2: number
  overhang_pct: number
  bed_contact_mm2: number
  needs_support: boolean
  faces: number
}

export interface ForgeSuggestion {
  /** Already in Lens frame, as [x, y, z, w]. Apply as the part's local rotation. */
  lens_quat: number[]
  metrics: ForgeMetrics
  /** Which `orientations[]` row the suggestion is. See ForgeOrientation.key. */
  key?: string
}

/**
 * Where supports would be printed for one orientation: the overhanging faces
 * projected straight down onto the bed, as a flat triangle list.
 *
 * `tris` is three [x, y] points per triangle, in millimetres, relative to the
 * part's footprint centre, in the server's bed frame — so a Lens-space point is
 * `(x / 10, -y / 10)` in the desk plane, times the current scale factor.
 */
export interface ForgeFootprint {
  tris: number[][]
  area_mm2: number
}

/**
 * One of the 24 axis-aligned orientations Flip and Turn can reach. `/design`
 * returns all of them, so the readout stays honest after a manual Flip without
 * another network call — and it works offline.
 */
export interface ForgeOrientation {
  /**
   * The part's rotation relative to its loaded orientation, as a row-major 3x3
   * matrix with every entry rounded to an integer and joined with commas.
   * As loaded that is "1,0,0,0,1,0,0,0,1".
   */
  key: string
  lens_quat: number[]
  metrics: ForgeMetrics
  footprint: ForgeFootprint
}

export interface ForgeExport {
  n: number
  filename: string
  quat: number[] | null
  euler_deg: number[] | null
  scale: number
  metrics: ForgeMetrics
}

export interface ForgeDesign {
  job_id: string
  version: number
  part: { type: string; name: string; params: Record<string, number>; rationale: string; source: string }
  title: string
  /** [x, y, z] in the server's Z-up frame, so the Lens height is dims_mm[2]. */
  dims_mm: number[]
  metrics: ForgeMetrics
  suggested: ForgeSuggestion
  /** All 24 axis-aligned orientations. Absent on a pre-orientations payload. */
  orientations?: ForgeOrientation[]
  glb_url: string
  stl_url: string
  exports?: ForgeExport[]
}

/** A design plus where it came from, which is what the readout needs to know. */
export interface ForgeJob {
  design: ForgeDesign
  /** True when the live service could not be reached and the cache answered. */
  offline: boolean
  chipKey: string
}

