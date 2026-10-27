# Forge — build log

Running log of how the Lens was planned and built. Planning docs live in this `devpost/` folder; the backend is in `service/`; offline demo assets in `Assets/ForgeCache/`.

## 2026-10-27 — Day 0: concept, backend, environment

- Concept chosen: **Forge** — say it, see it at real size on your desk, print it. One spatial moment: a headphone hook clamped on the desk edge at 1:1, orientation fixed by hand, STL exported in that orientation.
- Backend built and deployed on the B-AI Box: OpenSCAD parametric catalog (hook, bracket, clip, stand, tray, spacer, tag) + local LLM (Ollama `qwen3.8:27b`, JSON-schema structured output, cloud + keyword fallbacks) + trimesh for GLB/STL and overhang metrics + auto-orient over the 24 axis-aligned orientations. 13/13 tests. Public at `https://forge.banksyai.com`.
- First real request: "a hook for my headphones that clamps onto my desk edge, the desk top is about 30 mm" → `Headphone Desk Hook`, edge 30 mm; 16.5% overhang as designed → 0% after auto-orient. STL exported to the outbox.
- Vesper: Lens Studio 5.24.1 installed; CLAD plugin `ls-clad@ls-extensions` installed in Claude Code; SPECS Base Template project created (`forge.esproj`); Lens Studio MCP connected; Devpost Learn skill pack installed (`plan-lens`).
- Cached the three demo chips (hook / clip / tag) from the live service into `Assets/ForgeCache/`.

## Next

- Run `plan-lens` → `devpost/design-brief.md`.
- CLAD build from the brief + `devpost/forge-api.md`; LEAF scenarios per done criterion.
