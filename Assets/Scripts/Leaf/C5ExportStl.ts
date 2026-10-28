import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario"
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import { expect } from "Leaf.lspkg/Utils/common/Expect"

import { forge, resetLens, waitUntil } from "./ForgeTestUtils"

/**
 * Done criterion 5 - Pinching Export STL shows "writing...", then a filename
 * ending in .stl; the ring over the printer completes; and because the user is
 * looking at the desk rather than the printer, the arrow points toward it.
 *
 * The plate footer only has room for a word, so it says "saved"; the filename
 * is shown at size under the printer ring, and both are checked here.
 *
 * The chime is played from the printer's SceneObject at the same moment the
 * arrow appears; a scenario cannot hear it, so the arrow stands in for both.
 */
@component
export class C5ExportStl extends Scenario {
  async run(): Promise<void> {
    await resetLens()
    const app = forge()

    const interactor = new DefaultLeafInteractor("C5Interactor")
    await interactor.trigger(app.getTarget("chip:hook"))
    await waitUntil(() => forge().getState().hasPart, "the hook to land", 30)

    await interactor.trigger(app.getTarget("button:Export STL"))

    // The readout says what is happening straight away.
    expect(forge().getState().phase, "export should start").toBe("exporting")
    expect(forge().getState().statusText, "the plate should say it is writing").toBe("writing...")
    expect(
      forge().getState().printerRingVisible,
      "the progress ring over the printer should appear"
    ).toBe(true)

    // Then the file lands.
    await waitUntil(
      () => forge().getState().phase === "ready" && forge().getState().filename !== "",
      "the export to finish",
      30
    )

    const s = forge().getState()
    expect(
      s.filename.substr(s.filename.length - 4),
      "the export should produce an .stl filename"
    ).toBe(".stl")
    expect(s.statusText, "the plate footer should say the file is saved").toBe("saved")
    expect(
      s.printerFileText,
      "and the filename itself should be shown under the printer ring"
    ).toBe(s.filename)
    expect(s.printerRingVisible, "the ring should still be showing its result").toBe(true)

    // The user is looking at the desk, so the printer is out of view and the
    // arrow points the way.
    expect(s.arrowVisible, "the arrow should point toward the printer").toBe(true)
  }
}
