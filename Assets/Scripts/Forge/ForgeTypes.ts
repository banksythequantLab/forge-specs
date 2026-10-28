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

