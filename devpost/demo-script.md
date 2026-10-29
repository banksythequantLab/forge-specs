# Forge — demo video script (target 2:35, hard limit 3:00)

Screen recording of the Lens Studio preview (Interactive Preview, Device Type Override = Spectacles), driven by the LEAF `demo_run` scenario so every take is identical. Voice-over recorded separately and laid over the cut. 1080p, 16:9 preview dock. No faces, no third parties.

| Time | On screen (preview) | Voice-over |
|---|---|---|
| 0:00–0:08 | Opening frame from the seated pose: desk edge, three chips. Title overlay: **Forge — say it, see it at real size, print it.** | "This is Forge. Say what you need, and it shows up on your desk at the exact size it will print." |
| 0:08–0:25 | Hold on the chips. Cursor hovers "Headphone hook for my 30 mm desk edge". | "I print a lot of small parts, and half of them come out the wrong size, because a slicer preview on a laptop lies about scale. On glasses the part isn't a picture of a size. It *is* the size, sitting next to the thing it has to fit." |
| 0:25–0:40 | Pinch the hook chip. Designing ring sweeps on the edge (~3 s). Hook lands clamped on the edge. Plate: "Headphone Desk Hook · 84 × 35 × 89 mm · Overhang 16%". | "One pinch. A small language model on my own box picks a part from a parametric catalog and sizes it — 30 millimetre edge, 35 wide for a headphone band — OpenSCAD renders it, and it lands on the edge at one to one. Eighty-nine millimetres tall, right there." |
| 0:40–0:55 | Camera dips to the edge: red support footprint under the arms; lean under to show the red faces. | "The red on the desk is where the printer would have to build supports — the faces that would droop. That's the mistake I usually find forty minutes into a print." |
| 0:55–1:12 | Pinch Flip: part rotates a third of a second; red clears; plate reads 0%. Pinch Auto-orient (snaps to the backend's best orientation). | "Flip it, and the red is gone — zero percent. Or let it pick: Auto-orient asks the service for the least-overhang orientation out of all twenty-four." |
| 1:12–1:25 | Pinch Bigger twice: part grows, dims update on the plate. | "Too small for the band? Bigger. Fifteen percent a pinch, and the numbers follow." |
| 1:25–1:45 | Pinch Export STL: plate "writing…", then `forge_headphone_desk_hook_….stl`. Ring over the printer fills on the right, chime, arrow points right; camera turns to the printer, checkmark + filename. | "Export sends the orientation I chose, not the one the CAD file came in. The STL is written on the box, in that orientation, ready for the slicer. The chime comes from the printer's side, and the arrow tells me where to look." |
| 1:45–2:05 | Clip chip: tiny 24 mm clip lands (hold 3 s — it is correctly tiny). Tag chip: keychain tag with raised SPECS text. | "Everything is honest about scale. A six-millimetre cable clip really is this small. A keychain tag that says SPECS." |
| 2:05–2:25 | Cut to Lens Studio: LEAF panel with 7 scenarios green; a glimpse of `devpost/design-brief.md` and the build log. | "It was planned with the Devpost Learn plan-lens brief, built with CLAD through the Lens Studio MCP — SIK targets, a custom overhang shader, LEAF scenarios for every done criterion, all passing — and it degrades gracefully: with the network gone, the same chips load a cached copy and the plate says so." |
| 2:25–2:35 | (Optional, if printed in time) 5 s of the real printed hook clamped on the real desk edge, headphones hanging. Then end card: **Forge — built with CLAD for SPECS.** | "Say it. See it at real size. Print it. Forge." |

## Recording checklist

1. Box quiet: nothing else talking to Ollama for the take (check `curl https://forge.banksyai.com/health` → `llm_ready: true`, then `tools/latency.sh` on the box: three live designs under 5 s).
2. Lens Studio: project open, preview dock 16:9, Device Type Override = Spectacles, preview camera at `ForgeConfig.PreviewPose`.
3. Start the screen recorder on the preview panel only (OBS window capture, 1080p, 30 fps), then run the LEAF `demo_run` scenario.
4. Two takes minimum. Keep the one where the first design came back live (footer says "live design").
5. Voice-over: record to the script, then cut the video to the voice, not the other way round. Trim to under 3:00.
6. Upload to YouTube as **Public** (not unlisted — the rules say public), title "Forge — say it, see it at real size, print it (Learn AR with SPECS)".
