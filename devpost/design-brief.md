---
status: approved
---

# Design brief: Forge

## The one spatial moment

I'm standing at my desk looking down at the front edge, about arm's length away, headphones in one hand. The hook is clamped on that edge at exactly the size it would print: 74 mm tall, 28 mm wide. I can see straight away the band is wider than the hook, so I pinch Bigger once and it grows to 35 mm. Then I lean around it and the faces that would droop in the print are glowing red, so I pinch Flip and the red clears. That's the moment: real size, on the real edge, mistake caught before I waste forty minutes of filament.

## Why it belongs on glasses

- Uses: **draws in the world** (the part sits on the actual desk edge at 1:1 print size) and **leaves your body free** (hands hold the headphones, eyes stay on the desk, never on a laptop).
- Why it's better than the phone or laptop version: half the things I print come out the wrong size because a slicer preview on a laptop lies about scale. On glasses the part isn't a picture of a size, it's the size, next to the thing it has to fit.

## Product or overlay

- Type: **overlay** — the part is virtual, but the whole value is how it sits against something real (the desk edge, the headphone band).
- What the real version would sense: where the real desk edge is, marked by aiming and pinching at it.
- Stand-in for the preview: **the Lens brings its own desk.** At start a virtual desk appears in front of the user at real height (75 cm to the top) with a clearly visible front edge, and a small virtual 3D printer sits on a table about 1.5 m to the right. The user aims at the desk edge and pinches to say "the edge is here"; a thin highlight runs along the edge where they pinched and the part clamps there. If they don't pinch, the part defaults to the middle of the edge. On real glasses the same pinch marks the real edge, so the stand-in and the real version are the same gesture. Desk and printer are plain light grey, never black, because the display is additive.

## Where things live

- Where the user is looking during the main task: **down at the front edge of the desk, about arm's length (~50–60 cm) away.** Part, readout plate and buttons are all inside that one glance.
- **Virtual desk**: in front of the user at start, 75 cm to the top surface, with a distinct front edge. Footprint 120 × 60 cm *(default)*.
- **The part**: clamped on the desk's front edge, at 1:1 print scale from the backend's `dims_mm`.
- **Prompt chips**: three, lying flat on the desk surface about 40 cm in front of the user, each 12 × 4 cm.
- **Readout plate**: 12 × 5 cm, flat on the desk to the left of the part. Shows part name, current dimensions in mm, the backend's overhang percentage, the export state ("writing…", then the filename), and a small "offline copy" label when the cached answer was used.
- **Button block**: two rows of three, flat on the desk surface, centred behind the part, starting 6 cm back from the edge. Each button 8 × 4 cm with 2 cm gaps, so the block is 28 cm wide and 10 cm deep — this fits inside the display at arm's length. Front row: Bigger, Smaller, Flip. Back row: Turn, Auto-orient, Export STL. Light fill with a hover highlight.
- **Virtual 3D printer**: on a table about 1.5 m to the user's right.
- **Progress ring (export)**: 15 cm across, hovering 10 cm above the virtual printer.
- **Attention arrow**: 10 cm, 50 cm in front of the user, pointing toward the printer.

## Hands and input

- Pinch a **prompt chip** to request a part. Three chips: "Headphone hook for my 30 mm desk edge", "Cable clip for a 6 mm USB-C cable", "Keychain tag that says SPECS".
- Pinch the **desk edge** to set where the part clamps.
- Pinch **Bigger** / **Smaller**: uniform 15% per pinch, and the readout's dimensions update. Clamped to 50%–200% of the backend size *(default)*.
- Pinch **Flip**: rotates the part 90° about its left–right axis, animated over a third of a second so the user can follow it.
- Pinch **Turn**: rotates 90° about the vertical axis, same third-of-a-second animation.
- Pinch **Auto-orient**: animates to the orientation the backend suggests (least overhang).
- Pinch **Export STL**: sends the part's current rotation and scale to the backend; readout shows "writing…", then the filename.
- **Grab the part**: slides it along the desk edge only, so it can be moved to where the headphones actually hang. It snaps back to the edge on release.
- Targets are big and highlight when aimed at. **No two-hand gestures anywhere.**
- Voice: **none in this version.** The three chips do the asking.
- Typed custom requests through the on-screen keyboard: nice-to-have, not needed for the demo.

## When things show

- **Prompt chips**: show at start and after "Ask again"; disappear the moment a part exists.
- **Designing ring**: appears right where the part will land on the edge the moment a chip is pinched, fills over a few seconds, and goes when the part fades in.
- **The part, readout plate and buttons**: appear together when the part lands.
- **Red overhang shading**: shows whenever downward faces steeper than 45° exist in the current orientation; updates live on Flip and Turn; fades out two seconds after a successful export because the decision is made, and comes back if Flip or Turn is pinched again.
- **Readout plate**: fades when the user walks more than 1.5 m from the part, returns when they come back.
- **Progress ring over the printer**: fills while the backend writes the file; becomes a checkmark with the filename under it on completion.
- If something needs attention out of view: on export completion, if the user isn't looking at the printer, a short **chime plays from the printer's side** and a **10 cm arrow** appears 50 cm in front pointing toward it. The arrow disappears as soon as the printer comes into view.
- Nothing is ever stuck to the user's face; everything lives on the desk or over the printer.

## Done criteria

Each one can be checked in Lens Studio's preview.

1. Pinching the "Headphone hook" chip shows the designing ring, then a hook appears clamped on the desk edge, and the plate reads the name and the backend's dimensions (for the cached hook: 74 × 28 × 89 mm) with the part's rendered height matching within 2 mm.
2. With the hook on the edge, the downward faces steeper than 45° are shaded red and the plate shows the backend's overhang figure (16.6% for the cached hook).
3. Pinching Flip rotates the part 90° over a third of a second; after Auto-orient the red is gone and the plate reads 0%.
4. Pinching Bigger grows the part 15% and the plate's dimensions update to match.
5. Pinching Export STL shows "writing…", then a filename ending in `.stl`; the ring over the printer completes; and if the user is looking at the desk, a chime plays from the right and the arrow points toward the printer until it's in view.
6. With the network unreachable, the same chip loads the cached copy, the plate says "offline copy", and criteria 2 to 5 still pass.

## Out of scope

- Voice input of any kind.
- Typed custom prompts via the on-screen keyboard (nice-to-have only).
- Recognizing the real desk, the real headphones, or any real object — the virtual desk is the stand-in.
- Remembering parts or edge positions between sessions.
- Anything two-handed.

## Risks and open questions

- **The real-edge pinch is unproven.** In the preview it marks a virtual edge; whether aiming and pinching at a real desk edge on glasses lands accurately is something only the device can answer. Label "feel unproven".
- **The live backend is a network dependency.** Mitigated by the 12-second timeout and a cached response plus GLB per chip in `Assets/ForgeCache/`, so the demo can't be broken by the network. The preview needs Device Type Override = Spectacles for HTTPS to reach `https://forge.banksyai.com`.
- **Overhang shading is computed twice, deliberately.** The red is computed inside the Lens from the model's face angles so it updates live on Flip and Turn; the plate shows the backend's overhang percentage for the current orientation as a cross-check. If the two disagree visibly, the in-Lens shading is the one the user is acting on.
- **Comfort at the desk edge.** Looking down at arm's length for a whole session is untested on real hardware. Label "feel unproven".

## Build notes for CLAD

- The backend API contract, mesh conventions (Y-up metres, `dims_mm[2]` is the height, quaternion frame), the overhang shading rule and colours, and the cached-chip fallback are all specified in **`devpost/forge-api.md`**. Read it before writing the network or scaling code.
- Build for SPECS so it runs and can be demonstrated in Lens Studio's preview. No SPECS device is available.
- Use Spectacles Interaction Kit (SIK) and UI Kit for all interactions, so they work with the mouse in Interactive Preview and with LEAF.
- Build any stand-in exactly as described above, and keep it obvious in the scene.
- Use real-world scale in centimeters. Keep content inside the user's view during the main task.
- The display is additive: black renders as transparent. Don't rely on black or very dark content to be seen; keep text light and readable from where the user stands.
- Get the basic flow working first, then add detail.
- Write LEAF scenarios for each done criterion, run them in preview, and report which pass. Say which criteria have no test.
- Don't record, identify, or follow people.

## After the build: judge it

This part is for you, after CLAD finishes.

1. **Does it work?** Ask your agent which LEAF tests passed and which done criteria have no test.
2. **Walk around it.** Open the preview in Interactive Preview. Use WASD to move, Q and E to go down and up, and right-drag (or hold Shift) to look around. Clicking acts as a pinch. Stand where a user would and look at the task.
3. **Ask the three questions.**
   - Does it use what I'm looking at?
   - Does it put something in my space, where it belongs?
   - Does it free my hands or let me keep my eyes up?
   - Would it be just as good on a phone? If so, what would make it need the glasses?
4. **Check comfort.**
   - Everything I need is in view while I do the task. Nothing sits at the edges, behind me, or stuck to my face.
   - Every control is within reach of someone standing there.
   - Text reads easily from where I stand. No dark UI disappearing.
   - Things show when needed and get out of the way.
5. **Label what you know.** Write "logic proven" next to anything the tests and preview show working, and "feel unproven" next to anything only real glasses could tell you (comfort over time, real hand tracking, real recognition).
6. **Fix with design notes, not code.** Tell your agent what to change in design terms, for example: "Move the step card 15 cm lower and next to the pan. Make the Next button twice as big. Re-run the tests." If a fix takes under a minute, like nudging a panel, do it yourself in the scene.
7. **Submit.** Record a video under 3 minutes of your Lens in the preview, public on YouTube. Make your repo public with your Lens Studio project and this `devpost/` folder. Details are on the hackathon site: https://learn-specs.devpost.com/resources
