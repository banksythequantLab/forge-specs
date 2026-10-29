import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario"
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import { expect } from "Leaf.lspkg/Utils/common/Expect"

import { forge, resetLens, wait, waitUntil } from "./ForgeTestUtils"

/**
 * The demo, driven end to end with the pauses a viewer needs.
 *
 * This is not really a test — it asserts only that the Lens got to the end
 * without falling over. It exists so a screen recording can be started, this
 * run kicked off, and the result be the same beats in the same order, held
 * long enough to read.
 *
 * The beats are event-driven, not clocked: each chip waits for its part to
 * land and each export waits for its file, because the live design takes
 * 2-5 s when the box's GPU is free and up to 15 s when it is shared. A fixed
 * 7-s wait (the first version) pinched the tag while the clip was still
 * designing and the tag never appeared. Every beat prints its time since the
 * start so the recording can be cut against the log.
 */
@component
export class DemoRun extends Scenario {
  async run(): Promise<void> {
    await resetLens()
    const app = forge()
    const interactor = new DefaultLeafInteractor("DemoInteractor")
    const t0 = getTime()
    const beat = (what: string) => print("[Demo] +" + (getTime() - t0).toFixed(1) + "s - " + what)
    const landed = () => {
      const s = forge().getState()
      return s.hasPart && s.phase === "ready"
    }
    const exported = (before: string) => () => {
      const s = forge().getState()
      return s.phase === "ready" && s.filename !== "" && s.filename !== before
    }

    // --- the hook: ask, orient, size, export ------------------------------
    beat("pinch the headphone hook chip")
    await interactor.trigger(app.getTarget("chip:hook"))
    await waitUntil(landed, "the hook to land", 20)
    beat("hook landed - " + forge().getState().partName + ", " + forge().getState().dimsText)
    await wait(2.5) // a beat at 1:1 with the red footprint on the desk

    beat("Flip")
    await interactor.trigger(app.getTarget("button:Flip"))
    await wait(2)

    beat("Flip again")
    await interactor.trigger(app.getTarget("button:Flip"))
    await wait(2)

    beat("Auto-orient")
    await interactor.trigger(app.getTarget("button:Auto-orient"))
    await wait(3)

    beat("Bigger, twice")
    await interactor.trigger(app.getTarget("button:Bigger"))
    await interactor.trigger(app.getTarget("button:Bigger"))
    await wait(2)

    beat("Export STL")
    const hookFile = forge().getState().filename
    await interactor.trigger(app.getTarget("button:Export STL"))
    await waitUntil(exported(hookFile), "the hook's export to finish", 30)
    beat("hook exported - " + forge().getState().filename)
    await wait(4) // the chime, the arrow, the saved footer

    // --- the other two chips ---------------------------------------------
    beat("the cable clip")
    await resetLens()
    await interactor.trigger(app.getTarget("chip:clip"))
    await waitUntil(landed, "the clip to land", 20)
    beat("clip landed - " + forge().getState().partName + ", " + forge().getState().dimsText)
    await wait(4)

    beat("the keychain tag")
    await resetLens()
    await interactor.trigger(app.getTarget("chip:tag"))
    await waitUntil(landed, "the tag to land", 20)
    beat("tag landed - " + forge().getState().partName + ", " + forge().getState().dimsText)
    await wait(3)

    beat("Export the tag")
    const tagFile = forge().getState().filename
    await interactor.trigger(app.getTarget("button:Export STL"))
    await waitUntil(exported(tagFile), "the tag's export to finish", 30)
    beat("tag exported - " + forge().getState().filename)
    await wait(3)

    const s = forge().getState()
    beat("done - " + s.partName + ", " + s.dimsText + ", " + s.filename)
    expect(s.hasPart, "the demo should end with a part on the desk").toBe(true)
  }
}
