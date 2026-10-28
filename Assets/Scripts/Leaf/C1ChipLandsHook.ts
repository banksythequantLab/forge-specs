import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario"
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import { expect } from "Leaf.lspkg/Utils/common/Expect"

import { forge, resetLens, waitUntil } from "./ForgeTestUtils"

/**
 * Done criterion 1 - Pinching the "Headphone hook" chip shows the designing
 * ring, then a hook appears clamped on the desk edge, and the plate reads the
 * name and the backend's dimensions (84 x 35 x 89 mm for the cached hook) with
 * the part's rendered height matching within 2 mm.
 */
@component
export class C1ChipLandsHook extends Scenario {
  async run(): Promise<void> {
    await resetLens()
    const app = forge()

    const before = app.getState()
    expect(before.chipsVisible, "chips should be showing before a part exists").toBe(true)
    expect(before.hasPart, "no part should exist at the start").toBe(false)

    const interactor = new DefaultLeafInteractor("C1Interactor")
    await interactor.trigger(app.getTarget("chip:hook"))

    // The designing ring appears where the part will land.
    await waitUntil(
      () => forge().getState().phase === "designing",
      "the designing phase to start",
      5
    )
    expect(
      forge().getState().designRingVisible,
      "the designing ring should be visible while the part is being designed"
    ).toBe(true)

    // Then the part lands.
    await waitUntil(() => forge().getState().hasPart, "the part to land", 30)
    const s = forge().getState()

    // The live service names the part itself, and the wording varies between
    // runs ("Headphone Desk Hook", "Desk Hook"). Assert on the part, not on
    // the LLM's phrasing; C6 pins the exact cached name.
    expect(
      s.partName.toLowerCase().indexOf("hook") >= 0,
      'the plate should name the part as a hook, got "' + s.partName + '"'
    ).toBe(true)
    expect(s.chipsVisible, "chips should disappear once a part exists").toBe(false)

    // The backend's dimensions, in the server's [x, y, z] order.
    expect(s.dimsMm[0], "dims_mm[0]").toBeWithinRange(83.5, 84.5)
    expect(s.dimsMm[1], "dims_mm[1]").toBeWithinRange(34.5, 35.5)
    expect(s.dimsMm[2], "dims_mm[2]").toBeWithinRange(89.0, 89.8)

    // The part is rendered at 1:1 print scale: height within 2 mm of dims_mm[2].
    expect(
      s.renderedHeightMm,
      "rendered height should match dims_mm[2] (89.4 mm) within 2 mm"
    ).toBeWithinRange(87.4, 91.4)

    // And it is sitting on the desk's front edge, not floating or sunk.
    expect(
      s.partBottomY,
      "the part should rest on the desk top"
    ).toBeWithinRange(s.deskTopY - 0.2, s.deskTopY + 0.2)

    expect(s.dimsText, "the plate should show the dimensions in mm").toBe("84 x 35 x 89 mm")

    // And the footer says which path answered. The live service is up in this
    // run, so it should not be claiming an offline copy.
    expect(s.footerText, "the footer should name the path").toBe("live design")
  }
}
