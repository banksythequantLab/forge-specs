"""Forge service: request -> parametric part -> STL + GLB; orientation chosen in AR -> print-ready STL.

Run:  uvicorn app:app --host 127.0.0.1 --port 8400
Env:  FORGE_DATA_DIR (default ./data), FORGE_PUBLIC_URL (e.g. https://forge.banksyai.com),
      FORGE_OUTBOX (folder where exported STLs are also copied), FORGE_OLLAMA_* / FORGE_CLOUD_* (see forge/llm.py)
"""
from __future__ import annotations

import json
import logging
import os
import re
import secrets
import shutil
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from forge import __version__, geometry, llm
from forge.catalog import PARTS, catalog_json

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)  # one line per Ollama call is noise in the journal
log = logging.getLogger("forge")

DATA_DIR = Path(os.environ.get("FORGE_DATA_DIR", Path(__file__).resolve().parent / "data"))
JOBS_DIR = DATA_DIR / "jobs"
OUTBOX = Path(os.environ["FORGE_OUTBOX"]) if os.environ.get("FORGE_OUTBOX") else None
PUBLIC_URL = os.environ.get("FORGE_PUBLIC_URL", "").rstrip("/")
JOBS_DIR.mkdir(parents=True, exist_ok=True)
if OUTBOX:
    OUTBOX.mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def _lifespan(_: FastAPI):
    llm.warm_async()  # start loading the local model as soon as the service is up
    yield


app = FastAPI(title="Forge", version=__version__, lifespan=_lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

_SAFE = re.compile(r"^[A-Za-z0-9_.-]+$")


class DesignIn(BaseModel):
    prompt: str = Field(..., max_length=600)


class AdjustIn(BaseModel):
    job_id: str
    params: dict[str, Any] = Field(default_factory=dict)


class OrientIn(BaseModel):
    job_id: str
    quat: list[float] | None = Field(default=None, description="Lens Studio world rotation [x, y, z, w]")
    euler_deg: list[float] | None = Field(default=None, description="Lens Studio Euler angles [x, y, z] in degrees")
    scale: float = Field(default=1.0, ge=0.2, le=5.0)


class JobIn(BaseModel):
    job_id: str
    scale: float = Field(default=1.0, ge=0.2, le=5.0)


def _base_url(request: Request) -> str:
    return PUBLIC_URL or str(request.base_url).rstrip("/")


def _job_dir(job_id: str) -> Path:
    if not _SAFE.match(job_id):
        raise HTTPException(400, "bad job id")
    d = JOBS_DIR / job_id
    if not d.exists():
        raise HTTPException(404, "unknown job")
    return d


def _read_part(d: Path) -> dict[str, Any]:
    return json.loads((d / "part.json").read_text())


def _write_part(d: Path, part: dict[str, Any]) -> None:
    (d / "part.json").write_text(json.dumps(part, indent=2))


def _build(d: Path, spec: dict[str, Any]) -> dict[str, Any]:
    """Render the as-designed STL + GLB, compute metrics and the auto-orient suggestion."""
    stl = d / "model.stl"
    glb = d / "model.glb"
    seconds = geometry.render_stl(spec["type"], spec["params"], stl)
    mesh = geometry.load_scad_mesh(stl)
    geometry.drop_to_bed(mesh)
    mesh.export(str(stl))  # as-designed, sitting on the bed
    geometry.export_glb(mesh, glb)
    metrics = geometry.print_metrics(mesh)
    best = geometry.auto_orient(mesh)
    return {
        "render_seconds": round(seconds, 2),
        "metrics": metrics,
        "suggested": {"lens_quat": best["lens_quat"], "metrics": best["metrics"]},
    }


def _job_payload(request: Request, job_id: str, part: dict[str, Any]) -> dict[str, Any]:
    base = _base_url(request)
    v = part.get("version", 1)
    return {
        "job_id": job_id,
        "version": v,
        "part": {k: part[k] for k in ("type", "name", "params", "rationale", "source") if k in part},
        "title": PARTS[part["type"]].title,
        "dims_mm": part["metrics"]["dims_mm"],
        "metrics": part["metrics"],
        "suggested": part["suggested"],
        "glb_url": f"{base}/jobs/{job_id}/model.glb?v={v}",
        "stl_url": f"{base}/jobs/{job_id}/model.stl?v={v}",
        "llm_seconds": part.get("llm_seconds"),
        "render_seconds": part.get("render_seconds"),
    }


@app.get("/health")
def health() -> dict[str, Any]:
    ollama = "down"
    try:
        r = httpx.get(f"{llm.OLLAMA_URL}/api/tags", timeout=3)
        ollama = "up" if r.status_code == 200 else f"http {r.status_code}"
    except Exception:
        pass
    return {
        "ok": True,
        "service": "forge",
        "version": __version__,
        "openscad": geometry.openscad_version(),
        "ollama": ollama,
        "models": llm.OLLAMA_MODELS,
        "llm_ready": llm.ollama_loaded(llm.primary_model()),  # True = live designs; False = keyword designs until warm
        "llm_timeout_s": llm.LLM_TIMEOUT,
        "cloud_fallback": bool(llm.CLOUD_BASE_URL and llm.CLOUD_API_KEY),
        "jobs": sum(1 for _ in JOBS_DIR.iterdir()),
    }


@app.get("/catalog")
def catalog() -> list[dict[str, Any]]:
    return catalog_json()


@app.get("/warm")
def warm() -> dict[str, Any]:
    """Pre-load the local model (one token) so the first /design during a demo is fast.

    Returns at once; the load runs in the background. `loaded` tells the Lens whether the next
    /design will be a live model design (true) or a keyword design (false).
    """
    return llm.warm_async()


@app.post("/design")
def design(body: DesignIn, request: Request) -> dict[str, Any]:
    t0 = time.time()
    spec = llm.design(body.prompt)
    job_id = time.strftime("%Y%m%d-%H%M%S") + "-" + secrets.token_hex(2)
    d = JOBS_DIR / job_id
    d.mkdir(parents=True)
    try:
        built = _build(d, spec)
    except geometry.RenderError as e:
        shutil.rmtree(d, ignore_errors=True)
        log.exception("render failed")
        raise HTTPException(500, f"render failed: {e}")
    part = {**spec, **built, "prompt": body.prompt, "version": 1, "created": time.time()}
    _write_part(d, part)
    log.info("design %s %s %s in %.1fs (%s)", job_id, spec["type"], part["metrics"]["dims_mm"], time.time() - t0, spec["source"])
    return _job_payload(request, job_id, part)


@app.post("/adjust")
def adjust(body: AdjustIn, request: Request) -> dict[str, Any]:
    """Re-render the same part with changed parameters (e.g. hook_width: 40)."""
    d = _job_dir(body.job_id)
    part = _read_part(d)
    part["params"] = PARTS[part["type"]].clamp({**part["params"], **body.params})
    try:
        built = _build(d, part)
    except geometry.RenderError as e:
        raise HTTPException(500, f"render failed: {e}")
    part.update(built)
    part["version"] = int(part.get("version", 1)) + 1
    _write_part(d, part)
    return _job_payload(request, body.job_id, part)


@app.post("/auto_orient")
def auto_orient(body: JobIn) -> dict[str, Any]:
    d = _job_dir(body.job_id)
    mesh = geometry.load_scad_mesh(d / "model.stl")
    best = geometry.auto_orient(mesh, body.scale)
    return {"job_id": body.job_id, "lens_quat": best["lens_quat"], "metrics": best["metrics"]}


@app.post("/orient")
def orient(body: OrientIn, request: Request) -> dict[str, Any]:
    """Export a print-ready STL in the orientation the user chose in AR (plus optional uniform scale)."""
    d = _job_dir(body.job_id)
    part = _read_part(d)
    if body.quat and len(body.quat) == 4:
        R_lens = geometry.quat_lens_to_matrix(body.quat)
    elif body.euler_deg and len(body.euler_deg) == 3:
        R_lens = geometry.euler_lens_to_matrix(body.euler_deg)
    else:
        R_lens = geometry.tf.identity_matrix()
    R_scad = geometry.lens_rotation_to_scad(R_lens)
    mesh = geometry.load_scad_mesh(d / "model.stl")
    oriented = geometry.orient(mesh, R_scad, body.scale)
    metrics = geometry.print_metrics(oriented)
    n = sum(1 for p in d.glob("export_*.stl")) + 1
    safe_name = re.sub(r"[^A-Za-z0-9]+", "_", part.get("name") or part["type"]).strip("_").lower() or part["type"]
    filename = f"forge_{safe_name}_{body.job_id}_v{n}.stl"
    out = d / f"export_{n}.stl"
    oriented.export(str(out))
    if OUTBOX:
        shutil.copyfile(out, OUTBOX / filename)
    exports = part.setdefault("exports", [])
    exports.append({"n": n, "filename": filename, "quat": body.quat, "euler_deg": body.euler_deg, "scale": body.scale, "metrics": metrics, "time": time.time()})
    _write_part(d, part)
    base = _base_url(request)
    return {
        "job_id": body.job_id,
        "filename": filename,
        "stl_url": f"{base}/jobs/{body.job_id}/export_{n}.stl",
        "outbox": str(OUTBOX / filename) if OUTBOX else None,
        "metrics": metrics,
        "message": (
            f"{metrics['overhang_pct']}% of the surface needs support in this orientation"
            if metrics["needs_support"]
            else "No supports needed in this orientation"
        ),
    }


@app.get("/jobs/{job_id}/{name}")
def job_file(job_id: str, name: str):
    d = _job_dir(job_id)
    if not _SAFE.match(name):
        raise HTTPException(400, "bad file name")
    f = d / name
    if not f.exists():
        raise HTTPException(404, "no such file")
    media = "model/gltf-binary" if name.endswith(".glb") else "model/stl" if name.endswith(".stl") else "application/json"
    return FileResponse(str(f), media_type=media, filename=name if name.endswith(".stl") else None)


@app.get("/jobs/{job_id}")
def job_info(job_id: str, request: Request) -> dict[str, Any]:
    d = _job_dir(job_id)
    part = _read_part(d)
    payload = _job_payload(request, job_id, part)
    payload["exports"] = part.get("exports", [])
    return payload
