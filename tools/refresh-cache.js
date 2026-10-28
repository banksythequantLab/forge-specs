/**
 * Re-fetches the three demo chips from the live Forge service and overwrites
 * Assets/ForgeCache/{hook,clip,tag}.{json,glb}.
 *
 * Each cached JSON is the /jobs/{id} record (so it carries exports[0]) with the
 * /design response's `orientations` table merged in, which is what the Lens
 * reads to keep the overhang honest after a Flip or Turn while offline.
 */
const fs = require("fs")
const path = require("path")

const BASE = "https://forge.banksyai.com"
const OUT = path.join(__dirname, "..", "Assets", "ForgeCache")

const CHIPS = [
  { key: "hook", prompt: "Headphone hook for my 30 mm desk edge" },
  { key: "clip", prompt: "Cable clip for a 6 mm USB-C cable" },
  { key: "tag", prompt: "Keychain tag that says SPECS" }
]

async function postJson(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  })
  if (!r.ok) throw new Error(url + " -> HTTP " + r.status + " " + (await r.text()).slice(0, 200))
  return r.json()
}

async function getJson(url) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(url + " -> HTTP " + r.status)
  return r.json()
}

async function main() {
  for (const chip of CHIPS) {
    const t0 = Date.now()
    const design = await postJson(BASE + "/design", { prompt: chip.prompt })
    const designMs = Date.now() - t0
    console.log(
      `${chip.key}: ${design.part.name} ${design.dims_mm.join(" x ")} mm  ` +
        `source=${design.part.source} llm=${design.llm_seconds}s overhang=${design.metrics.overhang_pct}% ` +
        `orientations=${(design.orientations || []).length} (${designMs} ms)`
    )

    const glb = Buffer.from(await (await fetch(design.glb_url)).arrayBuffer())
    fs.writeFileSync(path.join(OUT, chip.key + ".glb"), glb)
    console.log(`  glb ${glb.length} bytes`)

    // Export once at the suggested orientation so the record carries exports[0],
    // which is what the Lens falls back to when /orient is unreachable.
    const ex = await postJson(BASE + "/orient", {
      job_id: design.job_id,
      quat: design.suggested.lens_quat,
      scale: 1
    })
    console.log(`  export ${ex.filename}`)

    const record = await getJson(BASE + "/jobs/" + design.job_id)
    if (!record.orientations && design.orientations) record.orientations = design.orientations
    if (!record.suggested || !record.suggested.key) record.suggested = design.suggested
    console.log(
      `  record keys: ${Object.keys(record).join(",")} exports=${(record.exports || []).length} ` +
        `suggested.key=${record.suggested && record.suggested.key}`
    )
    fs.writeFileSync(path.join(OUT, chip.key + ".json"), JSON.stringify(record, null, 2) + "\n")
  }
}

main().catch((e) => {
  console.error("FAILED:", e.message)
  process.exit(1)
})
