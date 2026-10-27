"""Parametric part catalog backed by the OpenSCAD files in ../catalog.

Each part lists its parameters with defaults, bounds and a one-line meaning.
The LLM only ever picks a part type and fills parameters; everything is
clamped to the bounds here before OpenSCAD runs, so a bad guess can't produce
a 2-metre hook or a zero-thickness wall.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

CATALOG_DIR = Path(__file__).resolve().parent.parent / "catalog"


@dataclass(frozen=True)
class Param:
    name: str
    default: float | str
    lo: float | None = None
    hi: float | None = None
    doc: str = ""
    kind: str = "number"  # "number" | "int" | "text"


@dataclass(frozen=True)
class Part:
    type: str
    title: str
    doc: str
    scad: str
    params: tuple[Param, ...]
    keywords: tuple[str, ...] = field(default_factory=tuple)
    # which param the first bare "NN mm" in a request most likely refers to
    primary_dim: str | None = None

    def defaults(self) -> dict[str, Any]:
        return {p.name: p.default for p in self.params}

    def clamp(self, values: dict[str, Any]) -> dict[str, Any]:
        """Merge values over defaults and clamp to bounds. Unknown keys are dropped."""
        out = self.defaults()
        by_name = {p.name: p for p in self.params}
        for k, v in (values or {}).items():
            p = by_name.get(k)
            if p is None or v is None:
                continue
            if p.kind == "text":
                s = str(v).strip()
                if s:
                    out[k] = s[:24]
                continue
            try:
                f = float(v)
            except (TypeError, ValueError):
                continue
            if p.lo is not None:
                f = max(p.lo, f)
            if p.hi is not None:
                f = min(p.hi, f)
            out[k] = int(round(f)) if p.kind == "int" else round(f, 2)
        return out


PARTS: dict[str, Part] = {
    "hook": Part(
        type="hook",
        title="Desk-edge clamp hook",
        doc="A hook that clamps over the edge of a desk, shelf or table and hangs headphones, a bag, a cable or a coat below it.",
        scad="hook.scad",
        params=(
            Param("edge_thickness", 25, 8, 60, "thickness of the desk or shelf edge it clamps (mm)"),
            Param("clamp_depth", 40, 20, 80, "how far the clamp reaches onto the desk top and underside (mm)"),
            Param("hook_width", 28, 12, 60, "width of the part along the edge (mm); wider for headphones, narrower for cables"),
            Param("hook_drop", 55, 20, 120, "how far the hook arm hangs below the desk (mm)"),
            Param("hook_reach", 30, 12, 60, "how far the hook tip sticks out from the edge (mm)"),
            Param("wall", 4, 2.5, 8, "material thickness (mm)"),
            Param("lip", 8, 3, 20, "upturned lip at the tip that keeps things from sliding off (mm)"),
        ),
        keywords=("hook", "hang", "headphone", "headset", "bag", "coat", "purse", "cable hook", "desk edge"),
        primary_dim="edge_thickness",
    ),
    "bracket": Part(
        type="bracket",
        title="L-bracket",
        doc="A right-angle bracket with screw holes and an optional gusset, for shelves, mounting, or joining two surfaces.",
        scad="bracket.scad",
        params=(
            Param("leg_a", 60, 20, 150, "vertical leg length (mm)"),
            Param("leg_b", 60, 20, 150, "horizontal leg length (mm)"),
            Param("width", 25, 10, 80, "bracket width (mm)"),
            Param("thickness", 5, 2.5, 12, "plate thickness (mm)"),
            Param("hole_dia", 4.5, 0, 10, "screw hole diameter (mm), 0 for none"),
            Param("holes", 1, 0, 2, "holes per leg", kind="int"),
            Param("gusset", 1, 0, 1, "1 adds a triangular gusset for strength, 0 none", kind="int"),
        ),
        keywords=("bracket", "shelf", "l-bracket", "mount", "corner", "support", "angle"),
        primary_dim="leg_a",
    ),
    "clip": Part(
        type="clip",
        title="Cable clip",
        doc="A C-shaped clip on a flat base that holds a cable or cord; stick it down or screw it.",
        scad="clip.scad",
        params=(
            Param("cable_dia", 8, 2, 30, "diameter of the cable it holds (mm)"),
            Param("width", 12, 6, 40, "clip width (mm)"),
            Param("wall", 2.4, 1.6, 5, "ring wall thickness (mm)"),
            Param("base_len", 24, 10, 60, "length of the flat base (mm)"),
            Param("base_th", 2, 1.2, 5, "base thickness (mm)"),
            Param("opening", 0.75, 0.5, 0.9, "fraction of the cable diameter left open at the top"),
        ),
        keywords=("clip", "cable", "cord", "wire", "charger", "usb", "tidy", "organizer"),
        primary_dim="cable_dia",
    ),
    "stand": Part(
        type="stand",
        title="Phone / tablet stand",
        doc="A reclined stand with a front lip and a rear brace that holds a phone, tablet, book or picture at an angle.",
        scad="stand.scad",
        params=(
            Param("device_th", 10, 4, 30, "thickness of the device including its case (mm)"),
            Param("angle", 65, 40, 80, "recline angle from the table (degrees)"),
            Param("width", 70, 30, 200, "stand width (mm)"),
            Param("back_h", 90, 40, 200, "length of the back support (mm)"),
            Param("base_d", 90, 50, 200, "base depth front to back (mm)"),
            Param("wall", 5, 3, 10, "material thickness (mm)"),
            Param("lip", 12, 5, 30, "front lip height (mm)"),
            Param("front", 12, 5, 40, "distance from the front edge to the lip (mm)"),
        ),
        keywords=("stand", "phone", "tablet", "ipad", "dock", "holder", "easel", "cookbook", "recipe"),
        primary_dim="width",
    ),
    "tray": Part(
        type="tray",
        title="Tray / bin",
        doc="An open rounded-corner tray or bin for desk odds and ends, screws, keys, remotes.",
        scad="tray.scad",
        params=(
            Param("inner_l", 80, 20, 220, "inside length (mm)"),
            Param("inner_w", 50, 20, 220, "inside width (mm)"),
            Param("inner_h", 25, 8, 120, "inside height (mm)"),
            Param("wall", 2, 1.2, 5, "wall thickness (mm)"),
            Param("floor_t", 2, 1.2, 5, "floor thickness (mm)"),
            Param("radius", 6, 1, 20, "corner radius (mm)"),
        ),
        keywords=("tray", "bin", "box", "container", "organizer", "dish", "bowl", "holder", "cup"),
        primary_dim="inner_l",
    ),
    "spacer": Part(
        type="spacer",
        title="Spacer / washer / standoff",
        doc="A cylinder with an optional center hole: a washer, spacer, standoff or bushing.",
        scad="spacer.scad",
        params=(
            Param("outer_dia", 12, 4, 80, "outer diameter (mm)"),
            Param("inner_dia", 4.5, 0, 60, "hole diameter (mm), 0 for solid"),
            Param("height", 6, 1, 80, "height (mm)"),
        ),
        keywords=("spacer", "washer", "standoff", "bushing", "shim", "ring", "puck", "disc"),
        primary_dim="outer_dia",
    ),
    "tag": Part(
        type="tag",
        title="Keychain tag with text",
        doc="A rounded tag with a keyring hole and raised text: a keychain, luggage tag, name plate or label.",
        scad="tag.scad",
        params=(
            Param("text_str", "FORGE", doc="the text on the tag (letters, digits, spaces; up to 12 characters)", kind="text"),
            Param("length", 60, 25, 120, "tag length (mm)"),
            Param("width", 24, 12, 50, "tag width (mm)"),
            Param("thick", 3, 1.5, 6, "base thickness (mm)"),
            Param("text_h", 1.2, 0.6, 3, "raised text height (mm)"),
            Param("hole_dia", 5, 0, 10, "keyring hole diameter (mm), 0 for none"),
            Param("radius", 5, 1, 12, "corner radius (mm)"),
        ),
        keywords=("tag", "keychain", "key chain", "label", "name", "plate", "sign", "luggage"),
        primary_dim="length",
    ),
}


def all_param_names() -> list[str]:
    names: list[str] = []
    for part in PARTS.values():
        for p in part.params:
            if p.name not in names:
                names.append(p.name)
    return names


def catalog_text() -> str:
    """Compact description of the catalog for the LLM prompt."""
    lines = []
    for part in PARTS.values():
        lines.append(f"- {part.type}: {part.title}. {part.doc}")
        for p in part.params:
            rng = "" if p.kind == "text" else f" [{p.lo}-{p.hi}]"
            lines.append(f"    {p.name} = {p.default}{rng}: {p.doc}")
    return "\n".join(lines)


def catalog_json() -> list[dict[str, Any]]:
    return [
        {
            "type": part.type,
            "title": part.title,
            "doc": part.doc,
            "params": [
                {"name": p.name, "default": p.default, "min": p.lo, "max": p.hi, "doc": p.doc, "kind": p.kind}
                for p in part.params
            ],
        }
        for part in PARTS.values()
    ]
