import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario"
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import { expect } from "Leaf.lspkg/Utils/common/Expect"

import { forge, resetLens, wait, waitUntil } from "./ForgeTestUtils"

/**
 * The demo, driven end to end with the pauses a viewer needs.
 *
 * This is not really a test — it asserts only that the Lens got to the end
 * without falling over. It exists so a screen recording can be started, this
 * run kicked off, and the result be the same take every time: the same beats,
 * in the same order, held long enough to read.
 *
 * The timings are for watching, not for speed. Seven seconds after a chip
 * covers the live design (2-5 s) plus the ring filling and the part landing,
 * and leaves a beat to look at it.
 */
@component
export class DemoRun extends Scenario {
  async run(): Promise<void> {
    await resetLens()
    const app = forge()
    const interactor = new DefaultLeafInteractor("DemoInteractor")

    // --- the hook: ask, orient, size, export ------------------------------
    print("[Demo] 0s - pinch the headphone hook chip")
    await interactor.trigger(app.getTarget("chip:hook"))
    await wait(7)
    expect(forge().getState().hasPart, "the hook should have landed by 7 s").toBe(true)

    print("[Demo] 7s - Flip")
    await interactor.trigger(app.getTarget("button:Flip"))
    await wait(2)

    print("[Demo] 9s - Flip again")
    await interactor.trigger(app.getTarget("button:Flip"))
    await wait(2)

    print("[Demo] 11s - Auto-orient")
    await interactor.trigger(app.getTarget("button:Auto-orient"))
    await wait(3)

    print("[Demo] 14s - Bigger, twice")
    await interactor.trigger(app.getTarget("button:Bigger"))
    await interactor.trigger(app.getTarget("button:Bigger"))
    await wait(2)

    print("[Demo] 16s - Export STL")
    await interactor.trigger(app.getTarget("button:Export STL"))
    await wait(6)
    expect(forge().getState().filename, "the hook should have exported by 22 s").not.toBe("")

    // --- the other two chips ---------------------------------------------
    print("[Demo] 22s - the cable clip")
    await resetLens()
    await interactor.trigger(app.getTarget("chip:clip"))
    await wait(7)

    print("[Demo] 29s - the keychain tag")
    await resetLens()
    await interactor.trigger(app.getTarget("chip:tag"))
    await wait(7)

    print("[Demo] 36s - Export the tag")
    await interactor.trigger(app.getTarget("button:Export STL"))
    await waitUntil(
      () => forge().getState().phase === "ready" && forge().getState().filename !== "",
      "the tag's export to finish",
      30
    )

    const s = forge().getState()
    print("[Demo] done - " + s.partName + ", " + s.dimsText + ", " + s.filename)
    expect(s.hasPart, "the demo should end with a part on the desk").toBe(true)
  }
}
