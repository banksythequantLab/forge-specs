# ForgeCache

Offline copies of the three demo prompts' server responses, so the demo never waits on the network.

| chip | prompt | job |
|---|---|---|
| hook | Headphone hook for my 30 mm desk edge | 20261027-184616-43f9 |
| clip | Cable clip for a 6 mm USB-C cable | 20261027-184627-9cf6 |
| tag  | Keychain tag that says SPECS | 20261027-184637-e16d |

`<name>.json` = `GET /jobs/{id}` (same shape as `POST /design`, plus an `exports` array with the `/orient` result).
`<name>.glb` = the part, glTF binary, Y-up, metres. Generated 2026-10-27 by the live service (local qwen3.8:27b on the box).
