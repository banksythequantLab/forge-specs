# Forge service

Backend for the **Forge** SPECS Lens ("say it, see it at real size, print it").

`POST /design {prompt}` → picks a catalog part with a local LLM (Ollama, structured JSON), renders it with
OpenSCAD, returns `model.glb` (Y-up, metres) for the Lens plus print metrics and an auto-orient suggestion.
`POST /adjust {job_id, params}` → re-render with changed parameters.
`POST /orient {job_id, quat|euler_deg, scale}` → export a print-ready STL in the orientation chosen in AR
(Z-up, sitting on the bed) and copy it to the outbox folder.
`GET /jobs/{id}/{file}` → model.glb / model.stl / export_N.stl.

Run locally: `uvicorn app:app --port 8400`; tests: `pytest -q`.
Catalog parts live in `catalog/*.scad`; bounds and docs in `forge/catalog.py`.
