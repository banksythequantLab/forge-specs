# Forge backend — API contract for the Lens

Base URL: `https://forge.banksyai.com` (HTTPS; reachable from the Lens Studio preview with **Device Type Override = Spectacles**). All request/response bodies are JSON. The service runs on the B-AI Box (`/opt/banksy/forge`, systemd `forge.service`, port 8400 behind a Cloudflare tunnel); source in `service/`.

| Call | Body | Returns |
|---|---|---|
| `GET /health` | — | `{ok, openscad, ollama, models}` |
| `GET /warm` | — | pre-loads the local model (call once when the Lens starts) |
| `POST /design` | `{prompt}` | `{job_id, part{type,name,params,rationale,source}, dims_mm[3], metrics{overhang_pct, needs_support, height_mm, volume_cm3}, suggested{lens_quat[x,y,z,w], metrics}, glb_url, stl_url, llm_seconds}` |
| `POST /adjust` | `{job_id, params{...}}` | same shape as `/design` (re-rendered, `version` +1, `glb_url` changes) |
| `POST /auto_orient` | `{job_id, scale}` | `{lens_quat, metrics}` |
| `POST /orient` | `{job_id, quat[x,y,z,w]` or `euler_deg[x,y,z], scale}` | `{filename, stl_url, outbox, metrics, message}` — the print-ready STL |
| `GET /jobs/{id}` | — | the job (design payload + `exports[]`) |
| `GET /jobs/{id}/model.glb` | — | the part as glTF binary |

## Mesh conventions

- The GLB is **Y-up, metres**, sitting on `y = 0`, footprint centred on the origin.
- `dims_mm` is `[x, y, z]` in the server's Z-up frame, so in the Lens the part's **height is `dims_mm[2]`** and its footprint is `dims_mm[0] × dims_mm[1]`.
- After loading, measure the loaded mesh's bounds and scale so the Y extent equals `dims_mm[2]` mm (Lens units are cm: 89.4 mm = 8.94). That makes the part 1:1 whatever the importer's unit handling.
- Rotation to send back: the part's rotation **relative to its loaded orientation**, as a quaternion `[x, y, z, w]` in Lens Studio world axes. The server converts frames.
- `suggested.lens_quat` is already in Lens frame; set it as the part's local rotation (relative to the loaded orientation) to animate to the suggestion.

## Overhang shading

In Lens (Y-up): a face needs support when `dot(worldNormal, (0,-1,0)) > 0.707` and the face is not the bottom (its world y is more than 0.5 mm above the part's lowest point). Tint those faces red `#ff4b4b`; everything else light grey `#cfd6e2`. Never black (additive display).

## Demo chips and offline fallback

Three chips: "Headphone hook for my 30 mm desk edge", "Cable clip for a 6 mm USB-C cable", "Keychain tag that says SPECS". Their cached responses and GLBs live in `Assets/ForgeCache/` (`hook.json`/`hook.glb`, `clip.*`, `tag.*`; each JSON carries an `exports[0]` entry with the `/orient` result). If `/design` fails or times out (12 s), load the cached pair for that chip and continue; show a small "offline copy" label on the readout.

## LEAF

One scenario per done criterion in the design brief. Stub the network with the cached job so scenarios are deterministic.
