import {
  ScenarioIndexEntry,
  scenariosIndex
} from "Leaf.lspkg/Scenarios/decorator/ScenarioIndexDecorator"

import { C1ChipLandsHook } from "./C1ChipLandsHook"
import { C2OverhangShown } from "./C2OverhangShown"
import { C3FlipAndAutoOrient } from "./C3FlipAndAutoOrient"
import { C4BiggerGrows } from "./C4BiggerGrows"
import { C5ExportStl } from "./C5ExportStl"
import { C6OfflineCopy } from "./C6OfflineCopy"

/**
 * The LEAF scenario index for Forge - one scenario per done criterion in
 * devpost/design-brief.md.
 *
 * Put this component on a SceneObject in the scene (it registers the scenarios
 * when it initialises); the scenarios themselves are instantiated by the LEAF
 * scenario manager when a run starts, so they never appear in the hierarchy.
 */
@component
export class LeafIndex extends BaseScriptComponent {
  @scenariosIndex
  static scenarios: ScenarioIndexEntry[] = [
    { id: "c1_chip_lands_hook", typename: C1ChipLandsHook.getTypeName() },
    { id: "c2_overhang_shown", typename: C2OverhangShown.getTypeName() },
    { id: "c3_flip_and_auto_orient", typename: C3FlipAndAutoOrient.getTypeName() },
    { id: "c4_bigger_grows", typename: C4BiggerGrows.getTypeName() },
    { id: "c5_export_stl", typename: C5ExportStl.getTypeName() },
    { id: "c6_offline_copy", typename: C6OfflineCopy.getTypeName() }
  ]
}
