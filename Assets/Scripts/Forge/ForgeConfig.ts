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

  /** Prompt chips: three 12 x 4 cm slabs lying flat on the desk. */
  chipSize: { w: 12, d: 4 },
  chipZ: -48,
  chipSpacingX: 16,
  /** Lift flat-on-desk UI slightly so it never z-fights the desk top. */
  surfaceLift: 0.35,

  /**
   * Readout plate, to the left of the part.
   *
   * The brief asked for 12 x 5 cm lying flat. Flat text at the desk edge is
   * foreshortened to about half its height from a seated eye, which put every
   * line under the ~1 degree legibility guide (see the build log). The plate is
   * therefore larger and propped up towards the user, which removes almost all
   * of the foreshortening and lets three big lines carry the readout.
   *
   * It sits level with the button block rather than up at the edge: close to
   * the edge the display is only about 50 cm wide and a plate this size falls
   * off the left of the view.
   *
   * 18 cm at x = -17 is as large and as far left as the plate can go and still
   * be wholly in view from the seated pose below. That width is what caps the
   * line heights in ReadoutLine — see the build log for the trade-off.
   */
  plateSize: { w: 18, d: 12 },
  plateX: -17,
  plateZ: -54,
  /** Degrees the plate leans back towards the user. 0 would lie flat. */
  plateTiltDeg: 40,

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
 * Line heights on the readout plate, in centimetres.
 *
 * Three big lines carry the answer — what it is, how big it is, how much of it
 * would need support — with a small footer for export status and the offline
 * marker. Anything longer than `maxWidth` is shrunk to fit rather than spilling
 * off the plate.
 */
export const ReadoutLine = {
  // Sized so each line fits the 20 cm plate on one line at TEXT_ASPECT 0.9 —
  // "74 x 28 x 89 mm" and "Overhang 16.6%" are the longest the plate has to
  // hold. The part name is the one line allowed to wrap.
  title: 1.2,
  dims: 1.15,
  overhang: 1.15,
  status: 0.85,
  offline: 0.85,
  /** Plate is 18 cm wide; leave a 1 cm margin each side. */
  maxWidth: 16
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
  /** How long the designing ring takes to fill when answering from cache. */
  designRingSeconds: 2.4,
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

