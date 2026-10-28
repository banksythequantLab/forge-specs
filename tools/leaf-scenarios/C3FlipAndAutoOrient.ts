import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario"
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import { expect } from "Leaf.lspkg/Utils/common/Expect"

import { angleBetweenDegrees, forge, resetLens, wait, waitUntil } from "./ForgeTestUtils"

/**
 * Done criterion 3 - Pinching Flip rotates the part 90 degrees over a third of
 * a second; after Auto-orient the red is gone and the plate reads 0%.
 */
@component
export class C3FlipAndAutoOrient extends Scenario {
  async run(): Promise<void> {
    await resetLens()
    const app = forge()

    const interactor = new DefaultLeafInteractor("C3Interactor")
    await interactor.trigger(app.getTarget("chip:hook"))
    await waitUntil(() => forge().getState().hasPart, "the hook to land", 30)

    // --- Flip: 90 degrees, animated over about a third of a second ---------
    const before = forge().getState().quat
    const startedAt = getTime()
    await interactor.trigger(app.getTarget("button:Flip"))

    // It animates rather than snapping.
    expect(forge().getState().isAnimating, "Flip should animate, not snap").toBe(true)

    await waitUntil(() => !forge().getState().isAnimating, "the Flip animation to finish", 5)
    const elapsed = getTime() - startedAt

    const turned = angleBetweenDegrees(before, forge().getState().quat)
    expect(turned, "Flip should rotate the part 90 degrees").toBeWithinRange(88, 92)
    // A third of a second, with room for the trigger and frame pacing.
    expect(elapsed, "the Flip animation should take about a third of a second").toBeLessThan(2.0)

    // --- Auto-orient: the backend's least-overhang orientation -------------
    await interactor.trigger(app.getTarget("button:Auto-orient"))
    await waitUntil(
      () => !forge().getState().isAnimating && forge().getState().overhangPct === 0,
      "Auto-orient to settle at zero overhang",
      20
    )

    const s = forge().getState()
    expect(s.overhangPct, "the plate should read 0% after Auto-orient").toBe(0)

    // The suggested orientation for the cached hook is -90 degrees about X,
    // which is where the part should now be sitting.
    const suggested = [-0.707107, 0, 0, 0.707107]
    expect(
      angleBetweenDegrees(s.quat, suggested),
      "the part should be at the backend's suggested orientation"
    ).toBeLessThan(3)

    // And it is still resting on the desk after the rotation.
    expect(s.partBottomY, "the part should still rest on the desk top").toBeWithinRange(
      s.deskTopY - 0.2,
      s.deskTopY + 0.2
    )
  }
}
