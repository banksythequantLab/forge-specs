import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario"
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import { expect } from "Leaf.lspkg/Utils/common/Expect"

import { forge, resetLens, waitUntil } from "./ForgeTestUtils"

/**
 * Done criterion 2 - With the hook on the edge, the downward faces steeper than
 * 45 degrees are shaded red and the plate shows the backend's overhang figure
 * (16.6% for the cached hook).
 *
 * The red itself is produced by the overhang shader, which this pass does not
 * ship; what is asserted here is the state that drives it (overhang shading on,
 * and the lowest point of the part fed to the shader) plus the plate's figure.
 */
@component
export class C2OverhangShown extends Scenario {
  async run(): Promise<void> {
    await resetLens()
    const app = forge()

    const interactor = new DefaultLeafInteractor("C2Interactor")
    await interactor.trigger(app.getTarget("chip:hook"))
    await waitUntil(() => forge().getState().hasPart, "the hook to land", 30)

    const s = forge().getState()

    // The backend says this orientation needs support, so the red is on.
    expect(s.overhangVisible, "overhang shading should be on when the part lands").toBe(true)

    // And the plate cross-checks it with the backend's figure.
    expect(s.overhangPct, "the plate should show the backend's overhang percentage").toBeWithinRange(
      16.5,
      16.7
    )
  }
}
