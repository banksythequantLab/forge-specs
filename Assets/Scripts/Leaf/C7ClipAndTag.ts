import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario"
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import { expect } from "Leaf.lspkg/Utils/common/Expect"

import { forge, resetLens, waitUntil } from "./ForgeTestUtils"

/**
 * The other two chips, which until now had prefabs and cached designs but no
 * scenario driving them.
 *
 * Two passes, because the two things worth checking need different conditions:
 *
 *  1. **Live.** The service names and sizes the part itself, so all that can
 *     be asserted is that it is the right kind of thing ("clip", "tag") and
 *     that whatever it chose is rendered at 1:1 — the mesh's height matches
 *     the dimensions the plate is showing. That check is self-consistent, so
 *     it holds however the model words the design.
 *  2. **Offline.** The cached pair is fixed, so the exact names and the exact
 *     dimension lines can be pinned: the cable clip really is 24 x 12 x 12 mm
 *     and the keychain tag really is 60 x 24 x 4 mm.
 *
 * The clip is deliberately tiny. At 1:1 a 24 mm clip is a little over two
 * centimetres across on the desk, which is the point: the Lens shows print
 * size, not a comfortable display size.
 */
@component
export class C7ClipAndTag extends Scenario {
  async run(): Promise<void> {
    await resetLens()
    const app = forge()
    const interactor = new DefaultLeafInteractor("C7Interactor")

    // --- live: the right kind of part, rendered at 1:1 --------------------
    for (const chip of [{ key: "clip", word: "clip" }, { key: "tag", word: "tag" }]) {
      await resetLens()
      await interactor.trigger(app.getTarget("chip:" + chip.key))
      await waitUntil(() => forge().getState().hasPart, "the " + chip.key + " to land", 30)

      const s = forge().getState()
      expect(
        s.partName.toLowerCase().indexOf(chip.word) >= 0,
        'the ' + chip.key + ' chip should name a ' + chip.word + ', got "' + s.partName + '"'
      ).toBe(true)

      // 1:1: the rendered height matches the dimensions on the plate, within
      // the half-millimetre the mesh measurement is good for.
      expect(
        s.renderedHeightMm,
        chip.key + " should be rendered at its real print height"
      ).toBeWithinRange(s.dimsMm[2] - 0.5, s.dimsMm[2] + 0.5)

      expect(s.partBottomY, chip.key + " should rest on the desk top").toBeWithinRange(
        s.deskTopY - 0.2,
        s.deskTopY + 0.2
      )
    }

    // --- offline: the exact cached designs --------------------------------
    app.setOffline(true)
    try {
      await resetLens()
      await interactor.trigger(app.getTarget("chip:clip"))
      await waitUntil(() => forge().getState().hasPart, "the cached clip to load", 30)

      let s = forge().getState()
      expect(s.partName, "the cached clip").toBe("USB-C Cable Clip")
      expect(s.dimsText, "a 6 mm USB-C cable needs a small clip").toBe("24 x 12 x 12 mm")
      expect(s.offlineText, "and the footer says where it came from").toBe("offline copy")
      // 24 mm across: about the width of two fingernails on the desk.
      expect(s.dimsMm[0], "the clip is 24 mm wide at 1:1").toBeWithinRange(23.5, 24.5)

      await resetLens()
      await interactor.trigger(app.getTarget("chip:tag"))
      await waitUntil(() => forge().getState().hasPart, "the cached tag to load", 30)

      s = forge().getState()
      expect(s.partName, "the cached tag").toBe("Keychain Tag SPECS")
      expect(s.dimsText, "a flat keychain tag").toBe("60 x 24 x 4 mm")

      // The tag lies flat, so nothing overhangs and no support patch is drawn.
      expect(s.overhangPct, "a flat tag needs no support").toBe(0)
      expect(s.footprintTriangles, "so there is no red patch under it").toBe(0)
    } finally {
      forge().setOffline(false)
    }
  }
}
