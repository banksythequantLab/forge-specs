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

## CLAD build 1

2026-10-28. Built from `devpost/design-brief.md` against the contract in `devpost/forge-api.md`.

### What got built

**Scene — the stand-in, in real-world centimetres.** World origin is the user's eyes looking down −Z; the virtual floor is 150 cm below.

- **Virtual desk** — 120 × 60 cm top, 4 cm thick, top surface at y = −75 (75 cm above the floor, per the brief), front edge at z = −40, on four legs.
- **Desk-edge highlight** — a 16 cm amber bar that appears along the edge where the user pinches; hidden until then.
- **Virtual 3D printer** — body, bed and gantry on a 60 × 60 cm table 1.5 m to the user's right (x = +150), with an anchor 10 cm above it for the progress ring.
- `SpectaclesInteractionKit` prefab at the scene root; Camera is Perspective + `DeviceTracking` in World mode.

**Scripts** (`Assets/Scripts/Forge/`, ~1,400 lines of TypeScript):

| File | What it does |
|---|---|
| `ForgeConfig.ts` | Every tunable number in one place: layout in cm, palette (overhang `#ff4b4b`, body `#cfd6e2`, nothing black), backend URL + 12 s timeout, 15% scale step clamped 50–200%, 0.33 s rotation. |
| `ForgeTypes.ts` | The backend payload shapes, field-for-field from `forge-api.md`. |
| `ForgeBackend.ts` | `/warm`, `/design`, `/auto_orient`, `/orient` over `InternetModule.fetch`. Every call races a 12 s timeout and **no method ever rejects** — a failure returns the cached answer instead, so the demo cannot be broken by the network. |
| `ForgePart.ts` | Loads the GLB, measures its bounds and scales so the Y extent equals `dims_mm[2]` mm (1:1 print size), then keeps it seated on the desk: anchor → pivot (rotation + lift) → model, re-measuring the world AABB after every rotation so the lowest point rests exactly on the desk top. Flip = 90° about X, Turn = 90° about Y, both slerped over a third of a second. Exports rotation as `[x,y,z,w]` relative to the loaded orientation. |
| `ForgeBuild.ts` | Panels, labels, SIK targets, segmented rings, arrow. Panels are a two-object pair — an unscaled root that carries the collider and text, and a scaled slab for the visible box — because parenting text to a non-uniformly scaled slab stretches the glyphs. |
| `ForgeApp.ts` | The state machine (`idle → designing → ready → exporting`) and all the UI: three 12 × 4 cm prompt chips, the 12 × 5 cm readout plate, the 28 × 10 cm two-row button block (Bigger / Smaller / Flip — Turn / Auto-orient / Export STL), the designing ring, the printer progress ring, the attention arrow, and the edge-pinch strip. |

**Interaction** is SIK throughout — every chip, button and the edge strip is a `ColliderComponent` + `Interactable`, so the same targets answer a hand pinch on device, a mouse click in Interactive Preview, and a LEAF interactor. Hover highlights and a pressed colour are wired to `onHoverEnter` / `onTriggerStart` / `onTriggerEnd`.

### Verified in the preview

`[Forge] ready - pinch a chip to design a part` with a clean compile and no runtime errors; the desk, chips, plate, buttons, rings and arrow all build at their authored positions (confirmed by reading the runtime scene graph). Text size was calibrated by measuring a label's world rect rather than guessing — one line at `size 32` is 22.5 cm at scale 1.

### CLAD agents and skills used

`/lens-studio-router` (gate + routing), `/specs-project-init` (target platform, preview device, camera, SIK prefab), `/specs-leaf-install-packages`, `/editor-api` (+ its `project-operations` reference), `/font-selector` (imported Inter). Scene and asset work went through `VirtualScene`, `scene-graphql` and `asset-graphql`; verification through `RecompileTypeScriptTool`, `RunAndCollectLogsTool`, `CapturePanelScreenshotTool` and `MovePreviewCamera`. No subagents were spawned — the orchestration ran inline.

### Environment problems found and fixed

These cost most of the session and are worth recording.

1. **SIK was installed under the wrong package name.** UIKit 4.0.0 references `InteractionKit.lspkg` **268 times across 94 files** and never `SpectaclesInteractionKit.lspkg`; LEAF references it 22 times. The Asset Library ships SIK as `InteractionKit.v4.0.0.lspkg`. The project had it as `SpectaclesInteractionKit.lspkg`, so **UIKit could not compile at all**. Reinstalled as `InteractionKit`, removed the misnamed copy, repointed imports.
2. **UIKit 4.0.0 needs `Motion.lspkg`**, an undeclared dependency ("the engine layer of the UIKit motion system") that was not installed. Without it UIKit fails with ~15 `Cannot find module 'Motion.lspkg/...'` errors. Installed.
3. **Materials created from presets lose their shader passes unless the project is saved immediately.** Materials created while the editor was mid-wedge wrote `PassesInfo: []`, so at runtime `material.mainPass` was `null` and every `baseColor` write threw `Cannot set property 'baseColor' of null`. Recreated them and saved straight away; the `.mat` files now carry a real `PassInfo`.
4. **Lens Studio wedges on a stuck asset operation.** Symptom: `save` fails with *"Cannot save project while an asset operation is in progress"*, `RecompileTypeScriptTool` times out on *"Waiting for asset manager to become idle"*, and edited `.ts` files never reach `Cache/TypeScript/Src` — so the compiler keeps compiling **stale copies**, which is how a "clean compile" can be compiling empty files. Triggered three times: once by the LEAF install timing out, twice by `CaptureRuntimeViewTool` (it imports an asset and hit *"Invalid transition from Immutable to Mutable"*). **Avoid `CaptureRuntimeViewTool` in this project.** A `VirtualScene read scope:runtime` sometimes clears it; otherwise only a restart does.
5. **A stray second Lens Studio instance** was still running from the earlier crash and was closed.
6. **Never delete part of `Cache/`.** I deleted `Cache/TypeScript/Out` and `CompileData` while chasing problem 4. That left the tree inconsistent and Lens Studio stopped configuring its TypeScript compiler altogether — every build then failed with *"TypeScript compiler is not configured (no TypeScript files in project)"*, even though all seven `.ts` assets were registered. `configureCompilerForProject` simply never fires. Restoring the template from `Es_TypeScriptCompilationManager.bundle/TypeScript` and hand-writing `Cache/TypeScript/Src/tsconfig.json` did not bring it back; only deleting **all** of `Cache/` and letting Lens Studio regenerate it does. `Cache/` is regenerable as a whole, not in pieces.
7. **Restarting Lens Studio moves the MCP port** — it takes the lowest free port and rewrites `.mcp.json`, which kills the MCP connection for an already-running coding session. `tools/port-holder.js` holds 50040 so Lens Studio binds 50041, the port this session was configured with. Leave it running while working.

`tools/rebuild-scene.md` records the whole scene (object table + pinned asset UUIDs) so it can be replayed in two calls if it is ever lost before a save.

### LEAF — written, not yet run

All six scenarios are written — one per done criterion — plus shared helpers and the scenario index, parked in `tools/leaf-scenarios/` with a README explaining the block.

**They have not been run, so no done criterion has a passing test yet.** LEAF 4.0.0, the version that pairs with SIK 4.0.0, does not type-check on Lens Studio **5.24.1**:

```
Leaf.lspkg/Scenarios/decorator/ScenarioIndexDecorator.ts(91,17): error TS2352:
Conversion of type 'string' to type 'TypeName<Scenario>' may be a mistake
because neither type sufficiently overlaps with the other.
```

That file is written for the `getTypeName()` typing introduced in **5.25** — its own comment says so. Because Lens Studio compiles every `.ts` under `Cache/TypeScript/Src/Packages`, simply having LEAF installed stops the **whole Lens** compiling, not just the tests. `Packages/Leaf.lspkg` is therefore parked in `tools/parked-packages/` so the Lens builds and runs.

Three ways forward, in order of preference:

1. Patch the one line inside the vendored package exactly as the compiler suggests (`as unknown as`). I did not do this unprompted — it edits a vendored dependency and needs re-applying after any LEAF update.
2. Upgrade Lens Studio to 5.25+, which is what LEAF 4.0.0 targets.
3. Leaf 2.0.2 (the only older build in the library) — worst option: it predates the SIK rename and would reintroduce problem 1.

### Design findings for the review pass

- **The brief's "75 cm desk top" and "arm's length (50–60 cm)" cannot both hold for a standing user.** With eyes at 150 cm and the desk top at 75 cm, the edge sits 75 cm below eye level; at a 40 cm forward reach that is ~85 cm away at **48° below the horizon** — outside the camera's vertical FOV, so nothing is visible until you look down. I built to the brief's absolute numbers. If you want true arm's length, the design note is either "raise the desk to standing-desk height (~100 cm)" or "treat the user as seated".
- **The 12 × 5 cm plate cannot hold five legible lines.** At ~85 cm the lines land at 0.6–0.8° of visual angle, below the ~1° comfort guide. Either the plate grows, or it drops to two lines (name + dimensions) with the rest on demand.
- The Preview panel is currently a very tall, narrow dock (1392 × 4096 capture), which makes framing hard to judge — worth widening before recording the video.

### State of the project at the end of this session

The Lens **was verified compiling and running** mid-session: a clean TypeScript build, `[Forge] ready - pinch a chip to design a part` in the preview with no runtime errors, and the desk, chips, plate, buttons, rings and arrow all built at their authored positions.

It does **not** compile right now, and that is my own doing, not a problem with the Lens. Chasing the asset-manager wedge (problem 4) I deleted `Cache/TypeScript/Out` and `CompileData`; Lens Studio then stopped configuring its TypeScript compiler (`configureCompilerForProject` never fires at project load) and every build returns *"TypeScript compiler is not configured (no TypeScript files in project)"*. Deleting all of `Cache/` and letting it regenerate did not bring it back either, across four restarts.

All the work is safe on disk — `Assets/` (scripts, materials, meshes, Inter, `ForgeCache`), `Packages/`, and `Assets/Scene.scene` with all 66 scene objects, which reloads intact. `forge.esproj` is valid and still targets Spectacles. Nothing needs rebuilding except Lens Studio's own cache.

**First thing to try next session**, in order:

1. Lens Studio's own **Clear Cache / rebuild** from the app UI rather than deleting directories by hand.
2. If that fails, create a fresh SPECS project and move `Assets/`, `Packages/` and `tsconfig.json` into it — the `.esproj` is 1 KB and carries nothing but settings.
3. Confirm whether *any* project compiles TypeScript on this install; if not, repair/reinstall Lens Studio.

`CaptureRuntimeViewTool` had also silently installed two packages of its own — `AiPreviewAgentInspect.lspkg` and `Icons.lspkg` — which I removed to `tools/parked-packages/` (it made no difference to the compiler, but they were never meant to be in this project). Its `AiPreviewAgentInspect.png` re-compresses for **1 minute 48 seconds** on every cache rebuild and was blocking the asset manager each time the project opened.

### Left for the next pass

0. **Restore the TypeScript toolchain** (above) and re-verify the preview.
1. **Decide the LEAF route** (patch / upgrade / defer), then run the six scenarios and report which pass.
2. **Overhang shading is not implemented.** The red is specified as a per-face rule (`dot(worldNormal, (0,−1,0)) > 0.707`, excluding faces within 0.5 mm of the lowest point), which needs a custom shader so it updates live on Flip and Turn. `ForgePart.updateOverhangUniforms()` already computes and feeds the lowest world point and an on/off flag; the `.graphShader` that consumes them is still to be written. Until then the plate's backend percentage carries criterion 2 on its own.
3. **The export chime** — `ForgeApp` creates the `AudioComponent` on the printer's SceneObject so it plays from the user's right, but no audio asset is assigned yet (`/build-sfx` can generate one).
4. **Grab-the-part-along-the-edge** is in the brief and not yet wired. `ForgePart.setEdgeX` exists and the edge-pinch strip works; the drag handler on the part itself is not attached.
5. **The live HTTPS path is untested.** The code is written and the preview is on Device Type Override = Spectacles, but every run so far answered from the cache; `/design` against `https://forge.banksyai.com` still needs a run with the service up.
6. Readout distance-fade and the return-to-chips path are written but unverified.

## CLAD build 2

2026-10-28, continuing from build 1. The Lens compiles, runs, and **all six LEAF
scenarios pass in the preview**.

### What changed

**Fixed first: three faults that made build 1 look broken.**

1. **The whole scene was duplicated.** Two `Forge` roots and two
   `SpectaclesInteractionKit` roots, each with their own desk, printer, UI and
   interactors. Symptoms: `Input unlitMaterial was not provided for the object
   ForgeApp` (the second, unwired `ForgeApp` threw at startup), six
   `CursorControllerProvider: Multiple cursors...` warnings, and **every pinch
   firing twice** — one Bigger press grew the part 32% instead of 15%, because
   two interactor stacks each delivered `onTriggerEnd`. Deleted the duplicate
   roots; one pinch is now exactly one 15% step.
2. **Dangling material references.** `unlitMaterial` and `partMaterial` on
   `ForgeApp` pointed at UUIDs that no longer existed — the materials were
   recreated in build 1 (problem 3) after the scene was wired, and the cache
   rebuild finished the job. Repointed. Later the same thing happened to all 14
   static visuals (desk, legs, printer, table) — they rendered magenta with
   `mainMaterial: null` — and were reassigned from the table in
   `tools/rebuild-scene.md`.
3. **Every label in the Lens was thirty times too small to read.**
   `ForgeBuild.TEXT_BASE_HEIGHT_CM` was 22.5; one line of size-32 text at
   scale 1 is actually **0.75 cm**. Nothing was broken, just invisible — which
   is why build 1's screenshots showed blank chips and blank buttons. This is
   the single largest visible change in this build.

**The three pieces the brief asked for and build 1 left out.**

- **Overhang shading** — `Assets/ForgeOverhang.graphShader`, a custom shader
  with a GLSL code node, plus `ForgeOverhangMat.mat` wired as `partMaterial`.
  It implements the rule from `forge-api.md` directly: a fragment is red
  `#ff4b4b` when `dot(faceNormal, (0,-1,0)) > 0.707` and it sits more than
  0.5 mm above the part's lowest point, otherwise light grey `#cfd6e2`. Four
  parameters (`forgeBodyColor`, `forgeOverhangColor`, `forgeMinY`,
  `forgeOverhangOn`) are driven per frame by the `ForgePart.updateOverhangUniforms`
  that build 1 had already written, so the red updates live on Flip and Turn
  and fades 2 s after an export.
  - **The normal has to be the geometric face normal, not the vertex normal.**
    The first version used `system.getSurfaceNormalWorldSpace()` and produced
    thin red slivers along edges instead of solid red faces, because the GLB
    arrives with smoothed normals. Computing it from the world-position
    derivatives (`cross(dFdx(p), dFdy(p))`, sign-corrected against the shading
    normal) gives flat faces that read as flat.
- **The export chime** — `Assets/GeneratedSFX/ForgeExportChime.wav`, a soft
  two-bell chime (D5 then A5, small room) generated with `/build-sfx`. Wired to
  `chimeAudio`, parented to the printer, and **spatialised**: `spatialAudio.enabled`
  with the distance effect on, which also needed an `AudioListenerComponent`
  on the Camera (the runtime warns about this 273 times if it is missing).
  It plays on export completion only when the printer is out of view.
- **Grab-to-slide along the edge** — `ForgePart.grabObject` is an invisible box
  that tracks the part's bounds through every rotation and scale step
  (`fitGrab`), carrying a collider and an `Interactable`. `onDragUpdate` adds
  only the sideways component of the drag, so the part can never leave the
  edge. Verified: dragging moved the anchor from x = 0 to x = 22.1 with y and z
  unchanged, and the edge highlight followed.

**Readout plate — rebuilt for legibility.** Three big lines (name, dimensions,
overhang %) and a small footer (export status, "offline copy"). The plate is
larger and **leans back 40 degrees towards the user**: lying flat, text at the
desk edge is foreshortened to about half its height from a seated eye, which
put every line below the ~1 degree comfort guide. `fitLabel` now wraps a long
line at word boundaries and only shrinks when a single word still will not fit,
so the part name wraps instead of spilling off the plate.

### Framing — the authored preview pose

Written into `ForgeConfig.PreviewPose` with the real numbers: desk top 75 cm off
the floor, seated eye 115 cm, so the edge is **40 cm below eye level and 60 cm
in front**. In scene space (standing eye at the origin, desk top at y = -75)
that is camera **(0, -35, +20) looking at (0, -75, -40)**, a 33.7 degree
downward pitch. Every screenshot below uses that pose.

Also worth recording: the Preview panel was a 199 x 669 dock, which renders a
1392 x 4096 frame and makes framing impossible to judge. It can be widened from
the Editor API — `IGui.workspaces.all[0].dockManager`, then `setMinimumWidth`
on the Preview panel's widget. At 620 x 669 the frame is near-square and
usable.

### Screenshots

1. **Opening frame, seated pose.** The grey desk fills the lower half; three
   prompt chips lie flat along the front edge reading "Headphone hook / for my
   30 mm / desk edge", "Cable clip / for a 6 mm / USB-C cable" and "Keychain
   tag / that says / SPECS". All three are comfortably readable.
2. **Part landed.** The hook stands on the front edge; the readout plate sits
   up and to the left reading "Desk-edge clamp hook" (wrapped), "74 x 28 x
   89 mm" in amber, "Overhang 16.6%"; the six buttons — Turn, Auto orient,
   Export STL / Bigger, Smaller, Flip — are flat behind the part and legible.
3. **Overhang shading, viewed from below the edge.** The two downward-facing
   undersides of the hook's arms are solid red; every other face is light grey.
   This is the shot that shows the shader working, and it has to be taken from
   below — from the seated pose you are looking at the top of the part and the
   red faces are, correctly, hidden.
4. **Plate head-on.** "Headphone Desk Hook / 74 x 28 x 89 mm / Overhang 16.6% /
   offline copy" filling the plate, used to calibrate the text sizes.

### LEAF — all six pass

Run in the preview via the LeafPlugin. `Leaf.lspkg` is the build-1 patch
(`as unknown as` in `ScenarioIndexDecorator.ts`) and compiles on 5.24.1. The six
scenarios moved from `tools/leaf-scenarios/` to `Assets/Scripts/Leaf/`, and
`LeafIndex` is attached to a `ForgeLeafIndex` scene object.

| Scenario | Criterion | Outcome |
| --- | --- | --- |
| `c1_chip_lands_hook` | 1 — chip to ring to hook at 1:1, plate reads name and dims | PASSED |
| `c2_overhang_shown` | 2 — red faces, plate shows 16.6% | PASSED |
| `c3_flip_and_auto_orient` | 3 — Flip 90 degrees in a third of a second, Auto-orient to 0% | PASSED |
| `c4_bigger_grows` | 4 — Bigger grows 15%, dims update | PASSED |
| `c5_export_stl` | 5 — "writing..." to `.stl` filename, ring completes, arrow appears | PASSED |
| `c6_offline_copy` | 6 — cached copy, "offline copy", criteria 2-5 still hold | PASSED |

Confirmed against the scenario manager's own `PASSED:` lines in the Lens Studio
log, not just the plugin's return value.

**One scenario had to be loosened.** `c1` asserted the part name equalled
"Headphone Desk Hook". The live service names the part itself and the wording
varies run to run ("Desk Hook", "Desk-edge clamp hook"), so `c1` now asserts the
name contains "hook". `c6` still pins the exact cached name, which is fixed.

**No done criterion is untested** — there is one scenario per criterion. What
the tests do *not* cover: the overhang **colour** (they assert the backend
percentage and the on/off flag, not that pixels are red — that was checked by
eye, screenshot 3), the chime being **audible**, grab-to-slide, and the
readout distance-fade.

### The live backend works

Build 1 never got a live answer. This session did, after a slow start:

- `/warm` first returned **502 after 16 s** and `/design` returned a
  **Cloudflare 524 after 125 s**, so the first runs all fell back to the cache —
  which is exactly the designed behaviour and is worth having seen.
- Once the model was resident, `/warm` returned 200 in ~100 ms and `/design`
  answered in **~3 s**: `[Forge] live design 20261028-155324-0009 (Desk Hook)`,
  74 x 28 x 89.4 mm, rendered height 8.94 cm — the same dimensions as the cached
  copy, so the 1:1 scaling is right on both paths.
- `devpost/forge-api.md` was revised during the session (service worst case
  ~10 s). `Backend.timeoutMs` is now **15 s** to match; it was 12 s.

### Deviations from the brief, and why

These are design calls, flagged for the review pass rather than hidden.

1. **The readout plate is 18 x 12 cm and leans 40 degrees, not 12 x 5 cm flat.**
   Flat text at the desk edge is foreshortened to roughly half its height from a
   seated eye; the brief's plate cannot hold legible lines at that angle. Even
   tilted, the plate's *width* is now the binding constraint — at 85 cm the
   display is only so wide, and the plate and the 28 cm button block have to
   share it. The three main lines ended up at **1.15-1.2 cm**, about **0.8
   degrees of visual angle** — readable in the preview but under the ~1 degree
   comfort guide. To do better, something has to give: a narrower button block,
   a shorter part name, or the plate moving off the desk to float beside the
   part.
2. **The button block starts 16 cm behind the edge, not 6 cm.** At 6 cm an
   89 mm part standing on the edge sits exactly on the sightline to the middle
   column — `Smaller` and `Auto-orient` could not be aimed at from the seated
   pose (the preview interactor reported "Blocked by PartGrabTarget"). At 16 cm
   the line of sight clears the top of the tallest cached part. The block is
   still 28 x 10 cm and still centred behind the part.
3. **Long button captions wrap** — "Auto orient", "Export STL" over two lines —
   so they fit an 8 cm button at a size that can be made out from the chair.

### Environment notes

- `QueryRuntimeSceneTool` and `PreviewInteractTool` silently install
  `AiPreviewAgentInspect.lspkg` and `AiPreviewAgentInteract.lspkg`. **Both ship
  an `Example/` folder that imports `UIKit.lspkg/...`, which this project has as
  `SpectaclesUIKit.lspkg`, so installing them breaks the whole TypeScript build**
  — the same class of failure as build 1's problem 1. Fixed by rewriting those
  two import lines inside each `.lspkg` (they are ZIP archives); originals are
  in `tools/parked-packages/*.orig`. A `tsconfig` path alias does **not** work:
  Lens Studio compiles from the sealed archive, not from the editable copy under
  `Cache/TypeScript/Src/Packages`, so patching the cache has no effect.
- `CaptureRuntimeViewTool` was avoided throughout, per build 1.
- Lens Studio was never restarted; `tools/port-holder.js` kept the MCP on 50041.
- A Lens Studio plugin (`AgentsDocs`) rewrote `AGENTS.md` and
  `.claude/settings.local.json` during the session.

### Remaining gaps

1. **Nothing has run on a SPECS device.** Hand tracking, the real pinch at a
   real desk edge, comfort over a session and whether the spatial chime actually
   reads as coming from the right are all "feel unproven".
2. **The plate's text is under the 1 degree comfort guide** (deviation 1 above).
   This wants a design decision, not more code.
3. **The `*_orient.json` cache files** named in the revised `forge-api.md` do
   not exist. The export fallback reads `exports[0]` out of the existing
   `hook.json` / `clip.json` / `tag.json`, which works (c5 and c6 pass), but it
   no longer matches the written contract.
4. **`/adjust` is not wired.** Bigger and Smaller scale the loaded mesh in the
   Lens rather than asking the service to re-render, which is right for a 15%
   nudge but means the exported STL's parameters never change.
5. **Only the hook chip has been exercised end to end.** Clip and tag load from
   cache and have prefabs, but no scenario drives them.
6. **The part reads faintly against the desk** — light grey on light grey. The
   shader's gentle top-light helps, but on an additive display the real test is
   a device.

## CLAD build 3

2026-10-28, across two sessions. The second one exists because Vesper rebooted
while the first was in its closing LEAF pass: everything on disk was committed
afterwards as `84ef358`, but two editor-side changes lived only in the running
editor and were lost with it, and the build-log section was never written. This
covers both.

### Session one — commit 84ef358

**The overhang figure is now driven by the orientations table, not by
Auto-orient.** `/design` returns all 24 axis-aligned orientations up front
(`devpost/forge-api.md`, "Orientations table and the support footprint"), so
after every Flip and Turn the Lens converts the part's rotation relative to its
loaded orientation into a rounded 3x3 row-major key, looks the row up, and sets
the plate's overhang line from `row.metrics.overhang_pct`. No network call, and
it works offline because the table travels with the cached job. Build 2 only
knew the overhang for the orientation the part arrived in and for whatever
Auto-orient came back with; every other rotation showed a stale number.

**The red support footprint.** `row.footprint.tris` — the overhanging faces
projected straight down onto the bed, as a flat triangle list in millimetres —
is rebuilt into a `MeshBuilder` patch on the desk directly under the part,
`scad (x, y)` to Lens `(x, -y)`, divided by 10 for cm, times the current scale
factor, lifted 0.3 cm so it never z-fights. This is the piece that makes the
overhang legible at all: the overhanging faces point down, so from a seated eye
the red on the part itself is almost entirely hidden, and the patch on the desk
is the same information turned into something you can see. For the hook it is
2 triangles; it disappears to 0 when a Flip or Auto-orient reaches a
zero-overhang row.

**The readout came off the desk.** Build 2's plate lay flat on the surface
leaned back 40 degrees and could not get any line above about 0.8 degrees of
visual angle, because at the edge the display is only ~50 cm wide and the plate
and the 28 cm button block had to share it. Build 3 floated it as a tag above
and left of the part. (Session two moved it again — see below.)

**An honest footer.** One row, two cells: what the export is doing on the left,
which path produced the part on the right — "live design", "quick design" or
"offline copy". Before this the Lens had no way to say that the thing on the
desk came out of the cache.

**An indeterminate designing ring.** `/design` takes 2-5 s and a determinate
fill would be a lie, so the ring sweeps a 25% arc at 1.1 s per revolution while
the service thinks, then fills in 0.4 s once the answer is actually in hand.

**Preview-only stand-ins guarded.** The desk, legs, printer and table are
scenery for the preview; on a device the real desk is the desk. They are hidden
unless running in the editor, which the Lens reports as
`[Forge] not in the editor - hid N preview stand-ins`.

**Cache refreshed with orientations.** `tools/refresh-cache.js` re-pulls
`hook.json` / `clip.json` / `tag.json` from the live service so the offline copy
carries the orientations table and `exports[0]`. The hook's cached entry is now
"Headphone Desk Hook", 84 x 35 x 89.4 mm.

**Tests.** `c7_clip_and_tag` and `demo_run` added, taking the suite to eight.

### Session two — recovery and the readout's real home

**Recovered the two lost editor-side changes.** `ForgeDeskSurface.mat`
`baseColor` back to the mid grey-blue `(0.361, 0.400, 0.459, 1.0)` — it had
reverted to a near-white `(0.765, 0.792, 0.839)`; the display is additive and
nothing in this Lens is ever black. And the Preview dock widened to a 16:9
landscape 1120 x 630 through `Editor.Dock.IDockManager`, `findPanel(
"Snap.Plugin.Gui.PreviewPanel")`, then the panel's `widget`. Note for next
time: `setMinimumWidth` will widen a panel but will not shrink it, so the 630
needed `setMaximumHeight(630)` as well. Project saved after each.

**Confirmed the live path end to end.** Pinching the "Headphone hook" chip with
Device Type Override on SPECS 27: `/design` answered in **3.0 s** (19:20:43.6 to
19:20:46.6, job `20261028-192049-7c4f`), the part landed as "Headphone Desk
Hook" 84 x 35 x 89.4 mm, overhang 16.2%, 2 support triangles, footer **"live
design"**. The live service, not the cache.

**A solid white bar across the desk edge — found and fixed.** The first
screenshot showed a 120 cm white band at the front edge, hiding the red
footprint completely. It is `DeskEdgePinchTarget`, the invisible strip you pinch
to slide the part along the edge, authored at `vec4(1, 1, 1, 0.05)` — but
`ForgeUnlit` has `blendMode` 0, so the alpha was discarded and the strip painted
opaque *and* wrote depth over the patch behind it. Fixed on the strip's own
cloned material (`blendMode = Normal`, `depthWrite = false`), and the
footprint's clone got `blendMode = Normal` too so the 60% red the contract asks
for is actually 60%. This is why no previous screenshot has ever shown the
support footprint.

**The readout moved below the desk edge.** The review of session one's
screenshots was right: the floating tag was clipped on the left ("adphone
Desk", "4 x 35 x 89 mm") and sat skewed in the far top-left corner, which was
the only spot above the buttons' projection from the seated eye. It now hangs
on the desk's front face like a drawer label — 14 x 8 cm, 8 cm below the desk
top (y = -83), 1.5 cm proud of the front face (z = -38.5) — and is billboarded
to the camera each frame rather than tilted once at build time. The billboard
is the camera's own world rotation pre-multiplied by a +90 degree turn about X,
which maps the panel's face (local +Y) onto the camera's backward axis and the
label's up (local -Z) onto the camera's up: every line ends up with exactly the
camera's world rotation, so it reads as an upright rectangle from anywhere. On
device that is the user's head.

Below the work surface it cannot collide with anything standing on it, which is
what the old position was fighting. **Hover on all six buttons — Bigger,
Smaller, Flip, Turn, Auto-orient, Export STL — completes with no "Blocked".**

**Deviation: the plate sits at x = -8, not the -13 the review asked for.**
Measured against the SPECS display rectangle rather than the panel. The display
is about +/-16.6 degrees wide: the desk is clipped to x 283..716 of a 1000 px
capture at *both* camera poses while its vertical extent changes, and a
projection model calibrated on that agrees with four independent observed edges
to within 3 px. A plate centred at -13 puts its left edge at 14.9 degrees from
the seated pose — inside, 1.7 degrees of margin — but at **19.3 degrees from
the lean-in pose, outside the display**, which cut the "84" and the "O" of
"Overhang" clean off. At -8 the left edge is 11.3 degrees seated and 14.7
degrees leaning in, inside at both, and it still reads as a drawer label in the
lower left beside the part's hanging arm, clear of every button, chip and the
part itself. The two instructions could not both be satisfied; the lean-in pose
is the one with a pass/fail test attached, so -13 lost.

**Text laid out from the top, centred, shrink-to-fit to 12 cm.** Every line is
`horizontalAlignment` Center on the plate's centre line, and the block is laid
out downwards from a 0.6 cm top margin instead of spread over the face. The
title is top-anchored at runtime (`ForgeApp.placeTitle`) because a Text is
vertically centred on its own origin, so a one-line and a two-line title need
different origins to share a top edge; everything below it keeps the z budgeted
for the two-line worst case, so nothing jumps when the part changes. The budget
for an 8 cm tag with 0.6 cm margins is 3.13 + 1.30 + 1.30 + 0.90 plus three
0.05 cm gaps = 6.78 of 6.80 cm.

Measured on the running Lens, reading each Text's fitted height back out of its
transform scale (`labelHeightCm`) — a Text's AABB is its layout box, not its
glyph extent, so world bounds cannot answer this:

| part | title | dims | overhang | widest line | inside 14 x 8 |
|---|---|---|---|---|---|
| hook | "Headphone / Desk Hook" 2 x 1.30 cm | "84 x 35 x 89 mm" 1.20 cm | "Overhang 16.2%" 1.20 cm | 11.84 cm | yes, 1.08 cm margin |
| clip | "USB-C Cable / Clip" 2 x 1.30 cm | "24 x 12 x 12 mm" 1.20 cm | "Overhang 3.5%" 1.30 cm | 11.84 cm | yes, 1.08 cm margin |
| tag | "Keychain Tag / SPECS" 2 x 1.30 cm | "60 x 24 x 4 mm" 1.20 cm | "Overhang 0.0%" 1.30 cm | 11.15 cm | yes, 1.43 cm margin |

Top margin is exactly 0.60 cm in all three, bottom margin 0.62 cm, and the
footer cells ("live design" at 0.80 cm) sit symmetric about the centre line at
x = -3.0 and +3.0 with 1.10 cm to the slab edge.

**Visual angle, measured at both poses.** The plate centre is 76.8 cm from the
seated eye and 59.2 cm from the lean-in eye, and because it is billboarded the
text is face-on at both:

| line | height | seated | lean-in |
|---|---|---|---|
| title | 1.30 cm | 0.97 deg | 1.26 deg |
| dims, overhang | 1.20 cm | 0.89 deg | 1.16 deg |
| footer | 0.80 cm | 0.60 deg | 0.77 deg |

Seated, the main lines are a hair under the ~1 degree comfort guide — slightly
worse than session one's floating tag at 1.06, which is the price of hanging it
off the desk rather than floating it closer to the eye. The lean-in pose clears
the guide comfortably, and that is the pose the video uses.

**The lean-in pose.** `ForgeConfig.PreviewPose.leanIn`, camera (0, -45, 5)
looking at (0, -75, -40): 30 cm above the desk top, 45 cm back from the front
edge. 30/45 is the same ratio as the seated 40/60, so it is a pure dolly along
the seated sightline — the 33.7 degree pitch is unchanged and only the distance
moves, 54 cm to the desk edge instead of 72. Confirmed in frame with margin at
that pose: the part, the plate, the red footprint and all six buttons (the
outermost button corner is 11.7 degrees off axis against the display's 16.6).
The seated pose stays the default; it is where a user's head actually is.

### Screenshots

All at the seated pose unless stated, 1120 x 630 dock.

1. **Before, hook loaded.** The readout in the far top-left corner, rotated
   maybe 15 degrees off upright, its left edge past the display boundary:
   "adphone Desk / Hook", "4 x 35 x 89 mm", "Overhang 16.2%". A solid white bar
   runs the full width of the desk's front edge; no red anywhere.
2. **After, hook loaded.** The white bar is gone. The readout is a clean
   upright rectangle hanging below the desk's front edge on the left, four
   lines complete and centred: "Headphone / Desk Hook", "84 x 35 x 89 mm" in
   amber, "Overhang 16.2%", and "live design" small at the bottom right. A red
   patch sits on the desk under the part's arms. Six buttons in two rows of
   three behind, all legible.
3. **After, lean-in pose.** The same scene a third closer. The desk fills more
   of the display, the button captions are comfortably readable, the red patch
   is obvious, and the readout is wholly inside the display with about 1.7
   degrees to the left edge.
4. **Keychain tag, seated.** "Keychain Tag / SPECS", "60 x 24 x 4 mm",
   "Overhang 0.0%", "live design" — and no red patch at all, because there is
   nothing to support. The flat tag lies on the desk edge.

### LEAF — eight of eight

Run in the preview on SPECS 27, after the changes above:

| scenario | result |
|---|---|
| c1_chip_lands_hook | passed |
| c2_overhang_shown | passed |
| c3_flip_and_auto_orient | passed, after the fix below |
| c4_bigger_grows | passed |
| c5_export_stl | passed |
| c6_offline_copy | passed, after the fix below |
| c7_clip_and_tag | passed |
| demo_run | passed |

**Two scenarios were failing, both the same race, and neither was a Lens bug.**
c3 asserted `isAnimating` immediately after `interactor.trigger("Flip")` and got
false; c6 asserted the footer said `"writing..."` and got `"saved"`.
`DefaultLeafInteractor.trigger` does not resolve when the button fires — it goes
on to release the pinch and un-hover, each awaiting an IK event and a frame —
and that tail outlasts both a 0.33 s rotation and an offline export that is only
a cache read. Sampling after the await tests the frame rate, not the Lens.
Checked and ruled out that the bigger preview dock caused it: c3 fails at
620 px wide too.

Fixed with `sawWhile(predicate, action)` in `ForgeTestUtils`, which samples the
predicate every 20 ms *across* the trigger and reports whether the state was
ever entered — which is what both criteria actually mean. c3 now confirms the
Flip genuinely animates rather than snapping, and still asserts the 90 degrees,
the orientations-table row and the sub-2-second duration.

### Remaining gaps

Carried over from build 2, still true:

1. **Nothing has run on a SPECS device.** Hand tracking, the real pinch at a
   real desk edge, comfort over a session, and whether the spatial chime reads
   as coming from the right are all unproven.
2. **`/adjust` is not wired.** Bigger and Smaller scale the loaded mesh rather
   than asking the service to re-render, so the exported STL's parameters never
   change.
3. **The part reads faintly against the desk** — light grey on light grey, and
   the real test is an additive display.

New or changed in build 3:

4. **The seated readout is at 0.97 degrees, just under the comfort guide.** The
   drawer-label position costs about 0.09 degrees against the floating tag.
   Buying it back means a bigger plate or moving it closer to the eye, and both
   are what the floating version already tried. The lean-in pose is the honest
   answer for the video; the seated number is the honest answer for the
   submission.
5. **`c5_export_stl` has the same latent race as c6.** It asserts `phase ===
   "exporting"` and `"writing..."` straight after the trigger and passes only
   because a live export takes seconds. It should use `sawWhile` too.
6. **The orientations table is only consulted for axis-aligned rotations.**
   `/metrics` exists for anything else and is still not called; nothing in the
   demo needs it, because Flip and Turn only ever reach the 24 rows.
7. **The SPECS display boundary is not modelled anywhere in the code.** The
   +/-16.6 degree figure used to place the plate was measured from preview
   captures in this session and lives only in a comment on `Layout.plateX`.
   Anything else placed off to one side can run off the display the same way
   the readout did, and nothing will catch it but a screenshot.
