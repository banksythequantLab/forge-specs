# Devpost submission draft — Forge

**Tagline:** Say it, see it at real size on your desk, print it.

## What it is

Forge is a SPECS Lens for people who 3D-print small useful parts. You pinch a request — "Headphone hook for my 30 mm desk edge" — and a few seconds later the part is clamped on your desk edge at exactly the size it will print, with the faces that would need supports marked in red on the desk. Flip it, turn it, make it bigger, slide it to where the headphones actually hang, and export: the STL is written on a local box in the orientation you chose, ready for the slicer.

The part isn't a picture of a size. It's the size, next to the thing it has to fit.

## Design (why it belongs on glasses)

- **One spatial moment.** Standing at the desk, headphones in hand, the hook sits on the real edge at 1:1. You see the band is wider than the hook before you print it, pinch Bigger, and the numbers follow.
- **Uses two of the three SPECS strengths:** it *draws in the world* (the part lives on the desk edge, the support footprint is painted on the desk under it) and *leaves your body free* (hands hold the headphones, eyes stay on the desk, no laptop).
- **Everything lives in one downward glance** at arm's length: chips on the desk, the part on the edge, a floating readout tag beside it, a 28 cm button block behind it. Nothing is stuck to your face; the only thing out of view — the printer — announces itself with a spatial chime and an arrow when the export finishes.
- **Comfort rules followed:** real-world centimetres everywhere, no black (additive display), text sized to ≥1° at the seated eye, targets 8 × 4 cm, no two-hand gestures, mouse = pinch in Interactive Preview.
- **Honest about what's proven.** The preview brings its own stand-in desk and printer; the real-edge pinch and long-session comfort are labelled "feel unproven" in the brief.

## Technical implementation

- **Planned with the Devpost Learn skill pack** (`plan-lens`, 10-exchange interview → `devpost/design-brief.md`, which pushed back on a 60 cm button row and made it 28 cm).
- **Built with CLAD in Lens Studio 5.24.1** through the Lens Studio MCP: `lens-studio-router`, `specs-project-init`, `editor-api`, `specs-preview-interaction`, `build-sfx`, `font-selector`; scene edits through `scene-graphql` / `asset-graphql`; verification through `RecompileTypeScriptTool`, `RunAndCollectLogsTool`, `CapturePanelScreenshotTool`.
- **Spectacles Interaction Kit + UI Kit** for every target (chips, buttons, grab-to-slide along the edge).
- **Custom overhang shader** (`ForgeOverhang.graphShader`, GLSL code node): a face is red when its *geometric* normal (from `dFdx/dFdy`, because the GLB arrives smoothed) points more than 45° downward and sits above the part's lowest point; updates live on Flip/Turn, fades after export.
- **Support footprint on the desk:** the backend projects the overhanging faces straight down and returns the union polygon, triangulated, for all 24 axis-aligned orientations in one response, so Flip/Turn update the red footprint and the overhang figure with no network call — and offline.
- **Backend on a local AI box** (`service/`, FastAPI): a small local model (Ollama `qwen3:4b`, JSON-schema output) picks one of seven parametric OpenSCAD parts and fills its parameters in millimetres; trimesh computes print metrics and the auto-orient suggestion; `/orient` writes the print-ready STL in the orientation chosen in AR. Live design in 2–5 s; keyword fallback and a cached copy per chip keep the demo honest when the network or the GPU is busy (the footer says which path ran).
- **LEAF:** one scenario per done criterion (6) plus clip/tag and a scripted `demo_run`; all pass in the preview (`Assets/Scripts/Leaf/`).
- **Build log** with every environment problem and fix (`devpost/build-log.md`): package naming, cache rebuilds, vendored-package patches, 30×-too-small text, the Ollama eviction storm.

## Innovation

CAD previews on a laptop lie about scale; Forge removes the scale question entirely by putting the part where it will live, at the size it will print, and turning "will this need supports?" into something you see on the desk and fix with one pinch. The AI designs the part, but the person makes the two decisions that actually ruin prints — size and orientation — with their eyes, in the world.

## Presentation

- Video: screen recording of the Lens Studio preview, under 3 minutes, driven by the LEAF `demo_run` scenario (script in `devpost/demo-script.md`).
- Repo: Lens Studio project at the root, backend in `service/`, planning docs in `devpost/` (design brief, API contract, build log, demo script).

## Links

- Repo: https://github.com/banksythequantLab/forge-specs (public at submission)
- Video: (YouTube, public — add link)
- Backend: https://forge.banksyai.com/health

## YouTube listing (paste when uploading; visibility must be Public)

**Title:** Forge — say it, see it at real size, print it (Snap SPECS Lens built with CLAD)

**Description:**

Forge is a Snap SPECS Lens for people who 3D-print small useful parts. Pinch a request and a parametric part lands on your desk edge at exactly the size it will print, with the faces that would need supports painted red on the desk. Flip it, let it auto-orient, make it bigger, slide it to where it has to fit, export — the STL is written on a local AI box in the orientation you chose, ready for the slicer.

Built for the Devpost "Learn AR with SPECS" hackathon: planned with the plan-lens skill, built with CLAD in Lens Studio 5.24.1 through the Lens Studio MCP, Spectacles Interaction Kit targets, a custom overhang shader, LEAF scenarios for every done criterion. Screen recording of the Lens Studio Interactive Preview in a simulated room. Narration generated from the maker's own cloned voice.

Project + planning docs: https://github.com/banksythequantLab/forge-specs

**Tags:** Snap Spectacles, SPECS, Lens Studio, CLAD, AR, 3D printing, OpenSCAD, Devpost
