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
   * Readout plate — a floating upright "tag", off the desk entirely.
   *
   * Build 2 had it lying on the desk, leaned back 40 degrees. Even leaned, the
   * desk gives it nowhere to go: at the edge the display is only ~50 cm wide,
   * and the plate and the 28 cm button block had to share that, which capped
   * every line at about 0.8 degrees of visual angle — under the comfort guide.
   *
   * Taking it off the desk removes the competition. It now hangs above and to
   * the left of the part, tilted to face the seated eye (`plateFaceTarget`), so
   * the text is read nearly face-on and each line can be 1.6 cm — about
   * 1.3 degrees at the 70 cm the plate ends up from the eye.
   *
   * Tuned so that from the seated pose it overlaps no button, no chip and not
   * the part: the sightline through its lower-right corner lands at about
   * (x -11, z -73) on the desk, behind the back row of buttons.
   */
  plateSize: { w: 14, h: 8 },
  plateX: -15,
  /** Height above the desk top, not above the floor. */
  plateAboveDesk: 16,
  plateZ: -44,
  /**
   * The point the plate's face is aimed at — the seated eye. No billboarding:
   * the tilt is authored once at build time from these numbers, so the plate
   * never swims when the head moves.
   */
  plateFaceTarget: { x: 0, y: -35, z: 20 },

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
  pitchDeg: -33.7
}

/**
 * Line heights on the readout plate, in centimetres, and where each line sits
 * on the plate face.
 *
 * `z` is the line's position down the plate face in plate-local coordinates:
 * the face reads along local -Z (up) to +Z (down), so -4 is the top edge of an
 * 8 cm tag and +4 is the bottom.
 *
 * The three main lines are 1.3 cm. At the 70 cm the plate sits from a seated
 * eye that is 1.06 degrees of visual angle — over the ~1 degree comfort guide
 * that build 2's desk-bound plate could not reach, and as large as an 8 cm tag
 * can carry: a two-line part name is 3.1 cm of it once the real line pitch is
 * counted (see TEXT_LINE_PITCH), and the dimensions line is 15 characters
 * wide, which caps it at about 1.3 cm on a 13 cm text width.
 */
export const ReadoutLine = {
  /** Part name. Allowed to wrap, but never past two lines. */
  title: 1.3,
  titleZ: -2.05,
  titleMaxLines: 2,

  dims: 1.3,
  dimsZ: 0.4,

  overhang: 1.3,
  overhangZ: 1.95,

  /**
   * The footer is one row carrying two things side by side: what the export is
   * doing on the left, and which path produced the part on the right. It is
   * deliberately secondary — about 0.7 degrees — and nothing in the readout
   * depends on reading it at a glance.
   */
  footerHeight: 1.0,
  footerZ: 3.45,
  statusX: -3.3,
  statusMaxWidth: 6.4,
  sourceX: 3.3,
  sourceMaxWidth: 6.4,
  /**
   * The footer gets its own floor, below the main lines': "live design" needs
   * 0.85 cm to stay on one line in half a 14 cm plate, and a footer that wraps
   * onto a second line falls off the bottom of the tag.
   */
  footerMinHeight: 0.8,

  /** Plate is 14 cm wide; leave half a centimetre each side. */
  maxWidth: 13,
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

