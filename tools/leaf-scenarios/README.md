# Forge LEAF scenarios — parked

These are the six LEAF scenarios, one per done criterion in
`devpost/design-brief.md`, plus the shared helpers and the scenario index.

They are **parked here rather than under `Assets/`** because of a version
mismatch, not because they are unfinished.

## Why they are not in the project

LEAF 4.0.0 (the version that pairs with SpectaclesInteractionKit 4.0.0) does not
type-check under Lens Studio **5.24.1**:

```
Packages/Leaf.lspkg/Scenarios/decorator/ScenarioIndexDecorator.ts(91,17):
error TS2352: Conversion of type 'string' to type 'TypeName<Scenario>' may be a
mistake because neither type sufficiently overlaps with the other.
If this was intentional, convert the expression to 'unknown' first.
```

That file's own comment explains the cause — it is written for the
`getTypeName()` typing introduced in **Lens Studio 5.25**. On 5.24.1 the cast
from `string` fails.

The error is fatal to the whole project: Lens Studio compiles every `.ts` under
`Cache/TypeScript/Src/Packages`, so merely having `Leaf.lspkg` installed stops
the Lens from compiling at all — the preview reports *"TypeScript is not
compiled"* and nothing runs. It is not limited to the test code.

`Packages/Leaf.lspkg` is therefore parked in `tools/parked-packages/`.

## The three ways forward

1. **Patch the one line in `Leaf.lspkg`** — change
   `getTypeName() as ScenarioMetadata["typename"]` to
   `getTypeName() as unknown as ScenarioMetadata["typename"]`, exactly what the
   compiler suggests. One line, inside a vendored package, so it wants a
   deliberate decision (and re-applying after any LEAF update).
2. **Upgrade Lens Studio to 5.25+**, which is the version LEAF 4.0.0 targets.
3. **Leaf 2.0.2** is the only older build in the Asset Library. It predates the
   SIK rename and imports `SpectaclesInteractionKit.lspkg/...`, while UIKit 4.0.0
   and LEAF 4.0.0 both import `InteractionKit.lspkg/...`. Installing it would
   reintroduce the package-name conflict, so this is the worst option.

## To put them back

```
mv tools/parked-packages/Leaf.lspkg*  Packages/
mkdir -p Assets/Scripts/Leaf
cp tools/leaf-scenarios/*.ts Assets/Scripts/Leaf/
```

Then add a SceneObject with the `LeafIndex` script component (it registers the
scenarios on init), recompile, and run them from the LEAF panel.

## What they assert

| Scenario id | Done criterion |
|---|---|
| `c1_chip_lands_hook` | 1 — chip → designing ring → hook on the edge, name + 74 × 28 × 89 mm, rendered height within 2 mm |
| `c2_overhang_shown` | 2 — overhang shading on, plate reads 16.6% |
| `c3_flip_and_auto_orient` | 3 — Flip rotates 90° animated; Auto-orient reaches the suggested quaternion and 0% |
| `c4_bigger_grows` | 4 — Bigger grows 15%, dims and rendered height follow, plate text updates |
| `c5_export_stl` | 5 — "writing..." → `.stl` filename, printer ring shown, arrow points to the printer |
| `c6_offline_copy` | 6 — offline path loads the cache, plate says "offline copy", and 2–5 still hold |

They drive the Lens through SIK `Interactable`s by the same pinch a user makes
(`DefaultLeafInteractor.trigger`), and read state through `global.forge`
(`ForgeApp.getState()`), which reports the readout text, the measured mesh
height, the rotation quaternion and the visibility of each element.
