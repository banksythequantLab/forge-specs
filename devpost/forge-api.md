# Forge backend — API contract for the Lens

Base URL: `https://forge.banksyai.com` (HTTPS; reachable from the Lens Studio preview with **Device Type Override = Spectacles**). All request/response bodies are JSON. The service runs on the B-AI Box (`/opt/banksy/forge`, systemd `forge.service`, port 8400 behind a Cloudflare tunnel); source in `service/`.

| Call | Body | Returns |
|---|---|---|
| `GET /health` | — | `{ok, openscad, ollama, models, llm_ready, llm_timeout_s}` — `llm_ready` true means the next `/design` is a live model design |
| `GET /warm` | — | starts loading the local model in the background and returns at once: `{ok, model, loaded, started, warming}` (call once when the Lens starts) |
| `POST /design` | `{prompt}` | `{job_id, part{type,name,params,rationale,source}, dims_mm[3], metrics{overhang_pct, needs_support, height_mm, volume_cm3}, suggested{lens_quat[x,y,z,w], metrics}, glb_url, stl_url, llm_seconds}` |
| `POST /adjust` | `{job_id, params{...}}` | same shape as `/design` (re-rendered, `version` +1, `glb_url` changes) |
| `POST /auto_orient` | `{job_id, scale}` | `{lens_quat, metrics}` |
| `POST /orient` | `{job_id, quat[x,y,z,w]` or `euler_deg[x,y,z], scale}` | `{filename, stl_url, outbox, metrics, message}` — the print-ready STL |
| `GET /jobs/{id}/model.glb` | — | the part as glTF binary |

## Time budget and `part.source`

`/design` always answers within about 10 s. The local model (Ollama `qwen3:4b` on the box) gets at most 8 s (`FORGE_LLM_TIMEOUT`); the OpenSCAD render takes 0.02–1.3 s. If the model is not resident in Ollama (something else evicted it from the shared GPU) the service does not wait for a load — it answers with the keyword designer at once and warms the model in the background for the next request. `part.source` says what happened: `ollama:qwen3:4b` (live design, `llm_seconds` set), `cloud:<model>` (cloud fallback, if configured) or `keywords` (catalog part picked by keyword match, first dimension in the request applied to the part's primary parameter). Measured with the GPU idle: 2.6–4.6 s total for the three demo chips, all live.

## Mesh conventions

- The GLB is **Y-up, metres**, sitting on `y = 0`, footprint centred on the origin.
- `dims_mm` is `[x, y, z]` in the server's Z-up frame, so in the Lens the part's **height is `dims_mm[2]`** and its footprint is `dims_mm[0] × dims_mm[1]`.
- After loading, measure the loaded mesh's bounds and scale so the Y extent equals `dims_mm[2]` mm (Lens units are cm: 94.4 mm = 9.44). That makes the part 1:1 whatever the importer's unit handling.
- Rotation to send back: the part's rotation **relative to its loaded orientation**, as a quaternion `[x, y, z, w]` in Lens Studio world axes. The server converts frames.
- `suggested.lens_quat` is already in Lens frame; set it as the part's local rotation (relative to the loaded orientation) to animate to the suggestion.

## Overhang shading

In Lens (Y-up): a face needs support when `dot(worldNormal, (0,-1,0)) > 0.707` and the face is not the bottom (its world y is more than 0.5 mm above the part's lowest point). Tint those faces red `#ff4b4b`; everything else light grey `#cfd6e2`. Never black (additive display).

## Demo chips and offline fallback

Three chips: "Headphone hook for my 30 mm desk edge", "Cable clip for a 6 mm USB-C cable", "Keychain tag that says SPECS". Their cached `/design` responses and GLBs live in `Assets/ForgeCache/` (`hook.json`/`hook.glb`, `clip.*`, `tag.*`). Each cached JSON is the `/jobs/{id}` record, so it also carries `exports[0]` (filename + metrics of the first `/orient` export) — that is what the export step falls back to. If `/design` fails or times out (15 s in the Lens — the service's own worst case is ~10 s), load the cached pair for that chip and continue; show a small "offline copy" label on the readout.

## LEAF

One scenario per done criterion in the design brief. Stub the network with the cached job so scenarios are deterministic.
