import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario"
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import { expect } from "Leaf.lspkg/Utils/common/Expect"

import { forge, resetLens, waitUntil } from "./ForgeTestUtils"

/**
 * Done criterion 4 - Pinching Bigger grows the part 15% and the plate's
 * dimensions update to match.
 */
@component
export class C4BiggerGrows extends Scenario {
  async run(): Promise<void> {
    await resetLens()
    const app = forge()

    const interactor = new DefaultLeafInteractor("C4Interactor")
    await interactor.trigger(app.getTarget("chip:hook"))
    await waitUntil(() => forge().getState().hasPart, "the hook to land", 30)

    const before = forge().getState()
    expect(before.scaleFactor, "the part starts at the backend's size").toBe(1)

    await interactor.trigger(app.getTarget("button:Bigger"))
    const after = forge().getState()

    // 15% per pinch, uniform.
    expect(after.scaleFactor, "Bigger should grow the part by 15%").toBeWithinRange(1.149, 1.151)

    for (let i = 0; i < 3; i++) {
      expect(
        after.dimsMm[i],
        "dims_mm[" + i + "] should grow by 15% too"
      ).toBeWithinRange(before.dimsMm[i] * 1.149, before.dimsMm[i] * 1.151)
    }

    // The rendered mesh really is bigger, not just the readout.
    expect(
      after.renderedHeightMm,
      "the rendered height should grow with the part"
    ).toBeWithinRange(before.renderedHeightMm * 1.13, before.renderedHeightMm * 1.17)

    // And the plate text matches the new numbers: 74 x 28 x 89 -> 85 x 32 x 103.
    expect(after.dimsText, "the plate should show the grown dimensions").toBe("85 x 32 x 103 mm")

    // Still clamped to the desk.
    expect(after.partBottomY, "the part should still rest on the desk top").toBeWithinRange(
      after.deskTopY - 0.2,
      after.deskTopY + 0.2
    )
  }
}
