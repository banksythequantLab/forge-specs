import { Backend } from "./ForgeConfig"
import { ForgeDesign, ForgeJob, ForgeMetrics, ForgeSuggestion } from "./ForgeTypes"

/**
 * Talks to the live Forge service, and falls back to the copy shipped in
 * Assets/ForgeCache whenever the network is slow, unreachable or unhappy.
 *
 * Every public method resolves. None of them reject: a demo must not be
 * breakable by the network, so a failure becomes an offline answer instead.
 */
export class ForgeBackend {
  /** Set from the app's "Simulate Offline" input, and by LEAF scenario 6. */
  public forceOffline: boolean = false

  /** Cached designs keyed by chip, parsed once from the JsonAssets. */
  private readonly cache: Map<string, ForgeDesign>

  constructor(private readonly internet: InternetModule, cache: Map<string, ForgeDesign>) {
    this.cache = cache
  }

  /** Pre-loads the model on the box. Fire and forget at Lens start. */
  public warm(): void {
    if (this.forceOffline) return
    this.withTimeout(this.internet.fetch(Backend.baseUrl + "/warm", { method: "GET" }))
      .then(() => print("[Forge] backend warm"))
      .catch(() => print("[Forge] warm skipped (service unreachable)"))
  }

  /**
   * Requests a part for a chip. Resolves with the live design when the service
   * answers inside the timeout, otherwise with the cached design for that chip.
   */
  public async design(chipKey: string, prompt: string): Promise<ForgeJob> {
    const cached = this.cache.get(chipKey)

    if (this.forceOffline) {
      print("[Forge] offline forced — using cached " + chipKey)
      return { design: cached, offline: true, chipKey }
    }

    try {
      const response = await this.withTimeout(
        this.internet.fetch(Backend.baseUrl + "/design", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt })
        })
      )
      if (!response.ok) throw new Error("HTTP " + response.status)
      const design = JSON.parse(await response.text()) as ForgeDesign
      if (!design || !design.dims_mm) throw new Error("malformed design payload")
      print("[Forge] live design " + design.job_id + " (" + design.part.name + ")")
      return { design, offline: false, chipKey }
    } catch (e) {
      print("[Forge] /design unavailable (" + e + ") — using cached " + chipKey)
      return { design: cached, offline: true, chipKey }
    }
  }

  /**
   * Asks the service for the least-overhang orientation. Falls back to the
   * `suggested` block already present on the design, which the cache carries.
   */
  public async autoOrient(job: ForgeJob, scale: number): Promise<ForgeSuggestion> {
    if (this.forceOffline || job.offline) return job.design.suggested

    try {
      const response = await this.withTimeout(
        this.internet.fetch(Backend.baseUrl + "/auto_orient", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ job_id: job.design.job_id, scale })
        })
      )
      if (!response.ok) throw new Error("HTTP " + response.status)
      const body = JSON.parse(await response.text())
      if (!body || !body.lens_quat) throw new Error("malformed auto_orient payload")
      return body as ForgeSuggestion
    } catch (e) {
      print("[Forge] /auto_orient unavailable (" + e + ") — using suggested from design")
      return job.design.suggested
    }
  }

  /**
   * Writes the print-ready STL at the part's current rotation and scale.
   * `quat` is [x, y, z, w] in Lens world axes, relative to the loaded orientation.
   */
  public async orient(
    job: ForgeJob,
    quat: number[],
    scale: number
  ): Promise<{ filename: string; metrics: ForgeMetrics | null; offline: boolean }> {
    const fallback = () => {
      const e = job.design.exports && job.design.exports.length > 0 ? job.design.exports[0] : null
      return {
        filename: e ? e.filename : "forge_" + job.design.job_id + "_v1.stl",
        metrics: e ? e.metrics : null,
        offline: true
      }
    }

    if (this.forceOffline || job.offline) return fallback()

    try {
      const response = await this.withTimeout(
        this.internet.fetch(Backend.baseUrl + "/orient", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ job_id: job.design.job_id, quat, scale })
        })
      )
      if (!response.ok) throw new Error("HTTP " + response.status)
      const body = JSON.parse(await response.text())
      if (!body || !body.filename) throw new Error("malformed orient payload")
      return { filename: body.filename, metrics: body.metrics ?? null, offline: false }
    } catch (e) {
      print("[Forge] /orient unavailable (" + e + ") — using cached export")
      return fallback()
    }
  }

  /** Rejects after Backend.timeoutMs so a stalled request can't hang the demo. */
  private withTimeout<T>(promise: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let settled = false
      setTimeout(() => {
        if (!settled) {
          settled = true
          reject(new Error("timeout after " + Backend.timeoutMs + " ms"))
        }
      }, Backend.timeoutMs)
      promise.then(
        (v) => {
          if (!settled) {
            settled = true
            resolve(v)
          }
        },
        (e) => {
          if (!settled) {
            settled = true
            reject(e)
          }
        }
      )
    })
  }
}

