/**
 * Forge — layout, colours and backend constants.
 *
 * All distances are in Lens world units (centimetres). The user's eyes sit at
 * the world origin looking down -Z, so the virtual floor is at y = -EYE_HEIGHT.
 *
 * Every number a design reviewer is likely to want to nudge lives in this file.
 */

/** Standing eye height. Floor = -EYE_HEIGHT, desk top = floor + 75. */
export const EYE_HEIGHT = 150

export const Layout = {
  floorY: -EYE_HEIGHT,

  /** Desk top surface. 75 cm above the floor, per the design brief. */
  deskTopY: -75,
  deskWidth: 120,
  deskDepth: 60,
  deskThickness: 4,
  /** z of the desk's front edge — the edge nearest the user. */
  deskFrontZ: -40,

  /** How far along the front edge the part may be slid, measured from centre. */
  edgeSlideLimit: 52,

  /**
   * How far above the desk the part's invisible grab box may reach.
   *
   * It is a cap, not a size: the box hugs the part otherwise. An 89 mm part's
   * full-height box crosses the seated sightline to the middle button and the
   * preview interactor refuses to aim at Smaller through it. See
   * ForgePart.fitGrab.
   */
  grabMaxHeight: 6,

  /** Prompt chips: three 12 x 4 cm slabs lying flat on the desk. */
  chipSize: { w: 12, d: 4 },
  chipZ: -48,
  chipSpacingX: 16,
  /** Lift flat-on-desk UI slightly so it never z-fights the desk top. */
  surfaceLift: 0.35,

  /**
   * Readout plate — a drawer label on the desk's front face.
   *
   * Build 2 laid it flat on the desk; build 3 floated it above and left of the
   * part. Floating fixed the size but not the place: from the seated eye the
   * only spot clear of the buttons' projection was the far top-left corner,
   * where the plate sat skewed and ran off the left of the frame.
   *
   * It now hangs off the front face of the desk like a drawer label — below
   * the work surface, so it can never collide with anything standing on it,
   * and beside the part's hanging arm rather than above it. Billboarded to
   * the head (`plateBillboard`), so it always reads as an upright rectangle
   * instead of the skewed parallelogram the authored tilt produced.
   */
  plateSize: { w: 14, h: 8 },
  /**
   * The review asked for -13. Measured against the SPECS display rectangle,
   * -13 only works from the seated pose: the display is about +/-16.6 degrees
   * wide (calibrated from the preview — the desk is clipped to x 283..716 of
   * a 1000 px capture at both poses, and four independent corners agree with
   * the model to within 3 px), and a plate centred at -13 puts its left edge
   * at 14.9 degrees seated but 19.3 degrees from the lean-in pose, which cut
   * the "84" and the "O" of "Overhang" clean off.
   *
   * -8 puts the left edge at 11.3 degrees seated and 14.7 degrees leaning in,
   * inside the display at both, and it still reads as a drawer label in the
   * lower left beside the part's hanging arm, clear of every button and chip.
   */
  plateX: -8,
  /** How far below the desk TOP the plate's centre hangs. */
  plateBelowDeskTop: 8,
  /** Just proud of the front face, so it never z-fights the desk slab. */
  plateFrontOffset: 1.5,

  /**
   * Button block: two rows of three, flat on the desk, centred behind the part.
   * Each button 8 x 4 cm with 2 cm gaps => block is 28 cm wide and 10 cm deep,
   * starting 6 cm back from the front edge.
   */
  buttonSize: { w: 8, d: 4 },
  buttonGap: 2,
  /**
   * Front boundary of the block.
   *
   * The brief put this 6 cm behind the edge. At that distance an 89 mm part
   * standing on the edge hides the middle column from a seated eye — the
   * sightline to the button passes straight through the part, so Smaller and
   * Auto-orient cannot be aimed at. Moved to 16 cm, the line of sight clears
   * the top of the tallest cached part. The block is still 28 x 10 cm and
   * still centred behind the part, and at ~80 cm it stays within reach.
   */
  buttonBlockStartZ: -56,
  buttonColumnX: [-10, 0, 10],

  /** Printer sits on a table about 1.5 m to the user's right. */
  printerX: 150,
  printerZ: -70,
  printerRingY: -39,
  /** Progress ring over the printer, 15 cm across. */
  printerRingDiameter: 15,

  /** Designing ring appears where the part will land. */
  designRingDiameter: 14,

  /** Attention arrow: 10 cm, 50 cm in front of the user. */
  arrowLength: 10,
  arrowZ: -50,
  arrowY: -45,

  /** Readout fades past this distance from the part. */
  readoutFadeDistance: 150
}

/**
 * The authored preview pose — where to stand the Preview camera so the desk
 * edge sits naturally in view, and where to put it for the demo video.
 *
 * Real-world numbers from the brief: the desk top is 75 cm off the floor and
 * the user is seated, so their eye is at about 115 cm. That puts the front edge
 * 40 cm below eye level and roughly 60 cm in front — inside arm's length.
 *
 * Scene space has the standing eye at the origin and the desk top at
 * Layout.deskTopY (-75), so a seated eye is 40 cm above the desk top at
 * y = -35, and 60 cm back from the front edge (z = -40) at z = +20.
 * Looking at the edge from there is a 34 degree downward pitch.
 */
export const PreviewPose = {
  /** Seated eye height above the floor, in cm. */
  seatedEyeHeight: 115,
  /** Desk top above the floor, in cm. */
  deskTopHeight: 75,
  /** How far the eye sits above the desk top: 115 - 75. */
  eyeAboveDesk: 40,
  /** How far back from the front edge the user sits. */
  eyeBehindEdge: 60,

  /** Preview camera position in scene coordinates. */
  cameraPosition: { x: 0, y: -35, z: 20 },
  /** Point the preview camera looks at: the middle of the desk's front edge. */
  lookAt: { x: 0, y: -75, z: -40 },
  /** Resulting downward pitch, degrees. atan(40 / 60). */
  pitchDeg: -33.7,

  /**
   * The lean-in pose, for the demo video.
   *
   * The seated pose above is the honest one — it is where a user's head
   * actually is — but it puts the eye 98 cm from the back of the button block
   * and everything reads small in a 16:9 frame. Leaning in is something a
   * person does anyway when they want a closer look: 30 cm above the desk top
   * (y = -45) and 45 cm back from the front edge (z = +5). 30/45 is the same
   * ratio as 40/60, so this is a pure dolly along the seated sightline — the
   * pitch stays at 33.7 degrees and only the distance changes, 54 cm to the
   * desk edge instead of 72. The part, the plate, the red footprint and all
   * six buttons sit inside the frame with margin.
   */
  leanIn: {
    /** Eye height above the desk top, in cm. */
    eyeAboveDesk: 30,
    /** How far back from the front edge, in cm. */
    eyeBehindEdge: 45,
    cameraPosition: { x: 0, y: -45, z: 5 },
    lookAt: { x: 0, y: -75, z: -40 },
    /** atan(30 / 45) — the same angle as the seated pose, by construction. */
    pitchDeg: -33.7
  }
}

/**
 * Line heights on the readout plate, in centimetres, and where each line sits
 * on the plate face.
 *
 * `z` is the line's position down the plate face in plate-local coordinates:
 * the face reads along local -Z (up) to +Z (down), so -4 is the top edge of an
 * 8 cm tag and +4 is the bottom. Every line is centred on the plate's own
 * centre line (`horizontalAlignment` Center at local x = 0), and the block is
 * laid out downwards from `topZ` rather than spread over the face, so a short
 * title never leaves a hole at the top and a long one never pushes the
 * dimensions off the bottom.
 *
 * The budget, for an 8 cm tag with a 0.6 cm margin top and bottom (6.8 cm of
 * usable face):
 *
 *     title    2 lines x 1.3 cm at pitch 1.41   3.13 cm
 *     dims     1 line  x 1.3 cm                 1.30 cm
 *     overhang 1 line  x 1.3 cm                 1.30 cm
 *     footer   1 line  x 0.9 cm                 0.90 cm
 *     three 0.05 cm gaps                        0.15 cm
 *                                              --------
 *                                               6.78 cm
 *
 * The three main lines stay at 1.3 cm, which from the seated eye — 77 cm from
 * the plate on the desk's front face — is 0.97 degrees of visual angle, and
 * 1.26 degrees from the lean-in pose used for the video.
 */
export const ReadoutLine = {
  /** Top of the text block: half the plate minus the 0.6 cm margin. */
  topZ: -3.4,
  /** Vertical gap between consecutive lines. */
  gap: 0.05,

  /**
   * Part name. Allowed to wrap, but never past two lines.
   *
   * Unlike the rest it is top-anchored at runtime (ForgeApp.placeTitle): the
   * Text is vertically centred on its own origin, so a one-line title and a
   * two-line title need different origins to share a top edge. Everything
   * below it keeps the fixed z of the two-line worst case, so the dimensions
   * and overhang lines never jump between parts.
   */
  title: 1.3,
  titleMaxLines: 2,

  dims: 1.3,
  dimsZ: 0.43,

  overhang: 1.3,
  overhangZ: 1.78,

  /**
   * The footer is one row carrying two things side by side: what the export is
   * doing on the left, and which path produced the part on the right. It is
   * deliberately secondary — about 0.65 degrees — and nothing in the readout
   * depends on reading it at a glance. The two cells are symmetric about the
   * plate's centre line and each is centre-aligned within its own half.
   */
  footerHeight: 0.9,
  footerZ: 2.93,
  statusX: -3.0,
  statusMaxWidth: 5.9,
  sourceX: 3.0,
  sourceMaxWidth: 5.9,
  /**
   * The footer gets its own floor, below the main lines': "live design" needs
   * 0.8 cm to stay on one line in half a 14 cm plate, and a footer that wraps
   * onto a second line falls off the bottom of the tag.
   */
  footerMinHeight: 0.8,

  /** Plate is 14 cm wide; leave a full centimetre each side. */
  maxWidth: 12,
  /** No line is ever shrunk below this, or it stops being readable at all. */
  minHeight: 1.1
}

/**
 * The red "where supports would go" patch drawn flat on the desk under the
 * part, from the current orientation row's `footprint.tris`.
 *
 * The overhanging faces themselves point down and are invisible from a seated
 * eye; this is the same information turned into something you can see.
 */
export const Footprint = {
  /** Lifted off the desk so it never z-fights the desk top. */
  liftCm: 0.3,
  /** #ff4b4b at 60%, matching the red on the faces. */
  color: new vec4(1.0, 0.294, 0.294, 0.6)
}

/** Colours. The display is additive — nothing here is black. */
export const Palette = {
  /** Overhang red from the API contract. */
  overhang: new vec4(1.0, 0.294, 0.294, 1.0), // #ff4b4b
  /** Part body grey from the API contract. */
  partBody: new vec4(0.812, 0.839, 0.886, 1.0), // #cfd6e2

  uiFill: new vec4(0.741, 0.773, 0.827, 0.92),
  uiFillHover: new vec4(0.945, 0.965, 1.0, 0.98),
  uiFillPressed: new vec4(1.0, 0.886, 0.612, 1.0),
  chipFill: new vec4(0.784, 0.82, 0.878, 0.95),
  plateFill: new vec4(0.675, 0.714, 0.784, 0.9),

  text: new vec4(0.09, 0.11, 0.15, 1.0),
  textOnPlate: new vec4(1.0, 1.0, 1.0, 1.0),
  accent: new vec4(1.0, 0.823, 0.498, 1.0),
  ringTrack: new vec4(0.6, 0.64, 0.71, 0.55),
  ringFill: new vec4(1.0, 0.823, 0.498, 1.0),
  ok: new vec4(0.439, 0.886, 0.573, 1.0)
}

export const Backend = {
  baseUrl: "https://forge.banksyai.com",
  /**
   * Fall back to the cached copy if the service has not answered in 15 s.
   *
   * The contract in devpost/forge-api.md puts the service's own worst case at
   * about 10 s, so 15 s only fires when something is actually wrong.
   */
  timeoutMs: 15000
}

export const Timing = {
  /** Flip / Turn / Auto-orient animation length — a third of a second. */
  rotateSeconds: 0.33,
  /**
   * The designing ring sweeps while the service is thinking — indeterminate,
   * because /design takes 2-5 s and a fixed fill would be a lie — then fills
   * in this long once the answer is actually in hand.
   */
  designRingFillSeconds: 0.4,
  /** Seconds for one full revolution of the indeterminate sweep. */
  designRingSweepSeconds: 1.1,
  /** How much of the ring the sweep lights at once, 0..1. */
  designRingSweepArc: 0.25,
  /** Red overhang clears this long after a successful export. */
  overhangClearDelay: 2.0,
  scaleStep: 0.15,
  scaleMin: 0.5,
  scaleMax: 2.0
}

/** The three demo chips, in display order. */
export const CHIPS = [
  // Captions wrap to three short lines so they fit a 12 cm chip at a text
  // size that can be read from where the user sits.
  { key: "hook", label: "Headphone hook\nfor my 30 mm\ndesk edge", prompt: "Headphone hook for my 30 mm desk edge" },
  { key: "clip", label: "Cable clip\nfor a 6 mm\nUSB-C cable", prompt: "Cable clip for a 6 mm USB-C cable" },
  { key: "tag", label: "Keychain tag\nthat says\nSPECS", prompt: "Keychain tag that says SPECS" }
]

