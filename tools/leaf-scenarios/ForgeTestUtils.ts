/**
 * Helpers shared by the Forge LEAF scenarios.
 *
 * The Lens publishes itself on `global.forge` from ForgeApp.onStart, which is
 * how a scenario reaches the state a user would be reading off the plate.
 */

/** Snapshot of everything the done criteria need to check. */
export interface ForgeState {
  phase: string
  hasPart: boolean
  offline: boolean
  partName: string
  dimsMm: number[]
  renderedHeightCm: number
  renderedHeightMm: number
  overhangPct: number
  scaleFactor: number
  quat: number[]
  isAnimating: boolean
  overhangVisible: boolean
  filename: string
  statusText: string
  dimsText: string
  offlineText: string
  chipsVisible: boolean
  designRingVisible: boolean
  printerRingVisible: boolean
  arrowVisible: boolean
  edgeX: number
  partBottomY: number | null
  deskTopY: number
}

export interface ForgeHandle {
  getState(): ForgeState
  getTarget(name: string): any
  listTargets(): string[]
  setOffline(on: boolean): void
  reset(): void
}

/** The running Lens. Throws a clear error if ForgeApp never started. */
export function forge(): ForgeHandle {
  const f = (global as any).forge as ForgeHandle
  if (!f) {
    throw new Error(
      "global.forge is not set - ForgeApp did not reach onStart. Check that the ForgeApp " +
        "component is on a SceneObject and that its inputs are wired."
    )
  }
  return f
}

export function wait(seconds: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(() => resolve(), Math.max(0, seconds) * 1000)
  })
}

/** Polls until `predicate` is true, or fails naming what it was waiting for. */
export async function waitUntil(
  predicate: () => boolean,
  label: string,
  timeoutSeconds: number = 25
): Promise<void> {
  const start = getTime()
  while (!predicate()) {
    if (getTime() - start > timeoutSeconds) {
      throw new Error(
        "Timed out after " + timeoutSeconds + "s waiting for " + label
      )
    }
    await wait(0.1)
  }
}

/** Puts the Lens back to the opening state so each scenario starts the same way. */
export async function resetLens(): Promise<void> {
  forge().reset()
  await waitUntil(() => forge().getState().phase === "idle", "the Lens to return to idle", 5)
}

/** Degrees between two [x, y, z, w] rotations. */
export function angleBetweenDegrees(a: number[], b: number[]): number {
  const qa = new quat(a[3], a[0], a[1], a[2])
  const qb = new quat(b[3], b[0], b[1], b[2])
  return (quat.angleBetween(qa, qb) * 180) / Math.PI
}
