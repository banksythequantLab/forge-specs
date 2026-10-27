"""Smoke tests: every catalog part renders watertight; orientation round-trip; API end to end (keyword path)."""
from __future__ import annotations

import math
import os
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.environ.setdefault("FORGE_DATA_DIR", str(ROOT / "data" / "test"))
os.environ.setdefault("FORGE_OLLAMA_URL", "http://127.0.0.1:9")  # nothing listening -> keyword fallback, fast

from forge import geometry  # noqa: E402
from forge.catalog import PARTS  # noqa: E402
from forge import llm  # noqa: E402


@pytest.mark.parametrize("ptype", list(PARTS.keys()))
def test_catalog_part_renders_watertight(tmp_path, ptype):
    part = PARTS[ptype]
    stl = tmp_path / f"{ptype}.stl"
    geometry.render_stl(ptype, part.defaults(), stl)
    mesh = geometry.load_scad_mesh(stl)
    assert mesh.is_watertight, f"{ptype} is not watertight"
    assert len(mesh.split()) == 1, f"{ptype} has more than one body"
    ext = mesh.bounding_box.extents
    assert all(1.0 < e < 300.0 for e in ext), f"{ptype} extents look wrong: {ext}"


def test_clamp_bounds_and_unknown_keys():
    hook = PARTS["hook"]
    p = hook.clamp({"edge_thickness": 999, "wall": -3, "bogus": 1, "hook_width": "33"})
    assert p["edge_thickness"] == 60 and p["wall"] == 2.5 and p["hook_width"] == 33 and "bogus" not in p


def test_keyword_fallback_picks_part_and_dimension():
    spec = llm.design("I need a hook for my headphones on a 1 inch desk edge")
    assert spec["type"] == "hook" and spec["source"] == "keywords"
    assert math.isclose(spec["params"]["edge_thickness"], 25.4, abs_tol=0.01)
    spec = llm.design("a keychain tag that says BANKSY")
    assert spec["type"] == "tag" and spec["params"]["text_str"] == "BANKSY"


def test_lens_rotation_round_trip_lays_hook_flat(tmp_path):
    """A 90° turn about the Lens X axis must put the hook's width on the Z axis (profile flat on the bed)."""
    stl = tmp_path / "hook.stl"
    geometry.render_stl("hook", PARTS["hook"].defaults(), stl)
    mesh = geometry.load_scad_mesh(stl)
    as_designed = geometry.print_metrics(geometry.drop_to_bed(mesh.copy()))
    q = [math.sin(math.radians(45)), 0, 0, math.cos(math.radians(45))]  # 90° about X, [x,y,z,w]
    R_scad = geometry.lens_rotation_to_scad(geometry.quat_lens_to_matrix(q))
    flat = geometry.orient(mesh, R_scad)
    m = geometry.print_metrics(flat)
    assert math.isclose(m["dims_mm"][2], 28.0, abs_tol=0.05), m  # hook_width now vertical
    assert m["overhang_pct"] < 1.0 and as_designed["overhang_pct"] > 10.0, (m, as_designed)
    assert math.isclose(flat.bounds[0][2], 0.0, abs_tol=1e-6)


def test_auto_orient_prefers_flat_hook(tmp_path):
    stl = tmp_path / "hook.stl"
    geometry.render_stl("hook", PARTS["hook"].defaults(), stl)
    mesh = geometry.load_scad_mesh(stl)
    best = geometry.auto_orient(mesh)
    assert best["metrics"]["overhang_area_mm2"] < 1.0
    # the suggested Lens quaternion must reproduce the same metrics when sent back through /orient's math
    R_scad = geometry.lens_rotation_to_scad(geometry.quat_lens_to_matrix(best["lens_quat"]))
    again = geometry.print_metrics(geometry.orient(mesh, R_scad))
    assert np.allclose(sorted(again["dims_mm"]), sorted(best["metrics"]["dims_mm"]), atol=0.05)
    assert again["overhang_area_mm2"] < 1.0


def test_glb_is_y_up_metres(tmp_path):
    stl = tmp_path / "tray.stl"
    geometry.render_stl("tray", PARTS["tray"].defaults(), stl)
    mesh = geometry.load_scad_mesh(stl)
    geometry.drop_to_bed(mesh)
    glb = tmp_path / "tray.glb"
    geometry.export_glb(mesh, glb)
    import trimesh

    scene = trimesh.load(str(glb))
    g = trimesh.util.concatenate(tuple(scene.geometry.values())) if isinstance(scene, trimesh.Scene) else scene
    ext = g.bounding_box.extents
    assert math.isclose(ext[1], 0.027, abs_tol=1e-4), ext  # tray height 27 mm is on Y in metres
    assert math.isclose(ext[0], 0.084, abs_tol=1e-4) and math.isclose(ext[2], 0.054, abs_tol=1e-4), ext


def test_api_design_orient_flow(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient
    import app as forge_app

    monkeypatch.setattr(forge_app, "JOBS_DIR", tmp_path / "jobs")
    forge_app.JOBS_DIR.mkdir()
    client = TestClient(forge_app.app)
    assert client.get("/health").json()["ok"]
    r = client.post("/design", json={"prompt": "a hook for my headphones that clamps on a 25 mm desk edge"})
    assert r.status_code == 200, r.text
    job = r.json()
    assert job["part"]["type"] == "hook" and job["glb_url"].endswith("model.glb?v=1")
    assert job["suggested"]["metrics"]["overhang_area_mm2"] < 1.0
    assert client.get(f"/jobs/{job['job_id']}/model.glb").status_code == 200
    r = client.post("/adjust", json={"job_id": job["job_id"], "params": {"hook_width": 40}})
    assert r.status_code == 200 and r.json()["part"]["params"]["hook_width"] == 40 and r.json()["version"] == 2
    r = client.post("/orient", json={"job_id": job["job_id"], "quat": job["suggested"]["lens_quat"]})
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["filename"].endswith("_v1.stl") and not out["metrics"]["needs_support"]
    assert client.get(f"/jobs/{job['job_id']}/export_1.stl").status_code == 200
