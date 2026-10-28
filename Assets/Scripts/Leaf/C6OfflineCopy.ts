import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario"
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import { expect } from "Leaf.lspkg/Utils/common/Expect"

import { angleBetweenDegrees, forge, resetLens, waitUntil } from "./ForgeTestUtils"

/**
 * Done criterion 6 - With the network unreachable, the same chip loads the
 * cached copy, the plate says "offline copy", and criteria 2 to 5 still pass.
 *
 * The network is not unplugged; the Lens is put into its offline path, which is
 * the same branch the 12-second timeout takes when the service does not answer.
 */
@component
export class C6OfflineCopy extends Scenario {
  async run(): Promise<void> {
    await resetLens()
    const app = forge()
    app.setOffline(true)

    try {
      const interactor = new DefaultLeafInteractor("C6Interactor")
      await interactor.trigger(app.getTarget("chip:hook"))
      await waitUntil(() => forge().getState().hasPart, "the cached hook to load", 30)

      // --- the offline copy is what answered -----------------------------
      let s = forge().getState()
      expect(s.offline, "the cached copy should have answered").toBe(true)
      expect(s.offlineText, "the plate should say so").toBe("offline copy")
      expect(s.partName, "it is still the right part").toBe("Headphone Desk Hook")
      expect(s.dimsText, "with the backend's dimensions").toBe("84 x 35 x 89 mm")
      expect(
        s.renderedHeightMm,
        "at 1:1 print scale, within 2 mm"
      ).toBeWithinRange(87.4, 91.4)

      // --- criterion 2: overhang still reads -----------------------------
      expect(s.overhangVisible, "overhang shading should still be on").toBe(true)
      expect(s.overhangPct, "and the plate still shows 16.2%").toBeWithinRange(16.1, 16.3)

      // The orientations table travels with the cached job, so the red support
      // footprint works offline too.
      expect(s.footprintTriangles, "the support footprint should be drawn offline").toBe(2)

      // --- criterion 3: Flip and Auto-orient still work ------------------
      const beforeFlip = s.quat
      await interactor.trigger(app.getTarget("button:Flip"))
      await waitUntil(() => !forge().getState().isAnimating, "the Flip to finish", 5)
      expect(
        angleBetweenDegrees(beforeFlip, forge().getState().quat),
        "Flip should still rotate 90 degrees offline"
      ).toBeWithinRange(88, 92)

      // And the readout follows the Flip rather than waiting for Auto-orient:
      // the row this lands in has nothing overhanging, so the red patch goes.
      expect(
        forge().getState().overhangPct,
        "Flip alone should update the overhang figure from the orientations table"
      ).toBe(0)
      expect(forge().getState().footprintTriangles, "and clear the support footprint").toBe(0)

      await interactor.trigger(app.getTarget("button:Auto-orient"))
      await waitUntil(
        () => !forge().getState().isAnimating && forge().getState().overhangPct === 0,
        "Auto-orient to settle at zero overhang",
        20
      )
      expect(forge().getState().overhangPct, "the plate should read 0% offline too").toBe(0)

      // --- criterion 4: Bigger still works -------------------------------
      await interactor.trigger(app.getTarget("button:Bigger"))
      expect(
        forge().getState().scaleFactor,
        "Bigger should still grow the part 15% offline"
      ).toBeWithinRange(1.149, 1.151)

      // --- criterion 5: export still produces a filename -----------------
      await interactor.trigger(app.getTarget("button:Export STL"))
      expect(forge().getState().statusText, "the plate should say it is writing").toBe("writing...")
      await waitUntil(
        () => forge().getState().phase === "ready" && forge().getState().filename !== "",
        "the offline export to finish",
        30
      )

      s = forge().getState()
      expect(
        s.filename.substr(s.filename.length - 4),
        "the cached export filename should end in .stl"
      ).toBe(".stl")
      expect(s.offlineText, "the footer should still say offline copy").toBe("offline copy")
      expect(s.arrowVisible, "the arrow should still point toward the printer").toBe(true)
    } finally {
      // Never leave the Lens stuck offline for the next scenario.
      forge().setOffline(false)
    }
  }
}
