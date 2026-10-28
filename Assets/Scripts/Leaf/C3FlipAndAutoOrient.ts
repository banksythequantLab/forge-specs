import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario"
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import { expect } from "Leaf.lspkg/Utils/common/Expect"

import { angleBetweenDegrees, forge, resetLens, sawWhile, waitUntil } from "./ForgeTestUtils"

/**
 * Done criterion 3 - Pinching Flip rotates the part 90 degrees over a third of
 * a second; after Auto-orient the red is gone and the plate reads 0%.
 *
 * Build 3 also made Flip itself honest: the overhang figure comes out of the
 * backend's orientations table every time the part settles, not just when
 * Auto-orient asks the service. For this hook one Flip is already enough to
 * reach a zero-overhang orientation, which is asserted here too.
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

    // Transient state: see sawWhile. By the time the trigger resolves the
    // third-of-a-second rotation can already be over.
    const sawAnimation = await sawWhile(
      () => forge().getState().isAnimating,
      interactor.trigger(app.getTarget("button:Flip"))
    )

    // It animates rather than snapping.
    expect(sawAnimation, "Flip should animate, not snap").toBe(true)

    await waitUntil(() => !forge().getState().isAnimating, "the Flip animation to finish", 5)
    const elapsed = getTime() - startedAt

    const turned = angleBetweenDegrees(before, forge().getState().quat)
    expect(turned, "Flip should rotate the part 90 degrees").toBeWithinRange(88, 92)

    // The readout follows the Flip without a network call: the new rotation
    // picks its row out of the orientations table the design arrived with.
    expect(
      forge().getState().orientationKey,
      "Flip should land on an axis-aligned row"
    ).toBe("1,0,0,0,0,-1,0,1,0")
    expect(
      forge().getState().overhangPct,
      "and the plate should read that row, not the one the part landed in"
    ).toBe(0)
    // A third of a second, with room for the trigger and frame pacing.
    expect(elapsed, "the Flip animation should take about a third of a second").toBeLessThan(2.0)

    // --- Auto-orient: the backend's least-overhang orientation -------------
    //
    // Wait on the rotation, not on the percentage. Since build 3 the overhang
    // figure follows every Flip out of the orientations table, and one Flip
    // already puts this hook flat at 0% — so waiting for "0%" would be
    // satisfied before Auto-orient had moved anything at all.
    const suggested = [-0.707107, 0, 0, 0.707107]
    await interactor.trigger(app.getTarget("button:Auto-orient"))
    await waitUntil(
      () =>
        !forge().getState().isAnimating &&
        angleBetweenDegrees(forge().getState().quat, suggested) < 3,
      "Auto-orient to settle at the suggested orientation",
      20
    )

    const s = forge().getState()
    expect(s.overhangPct, "the plate should read 0% after Auto-orient").toBe(0)
    expect(s.footprintTriangles, "and nothing should be left to support").toBe(0)
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
