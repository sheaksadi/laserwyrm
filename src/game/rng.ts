/**
 * All the game's chance comes from one seeded generator, so a seed and the
 * inputs replay a run exactly. Never use Math.random in play.
 */


/** mulberry32: small, fast, and the same everywhere for the same seed. */
export function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

let next = seeded(1)
/** A number in [0, 1) from the run's generator. */
export const random = () => next()
/** Start the generator over from a seed (each run does, in `reset`). */
export function reseed(seed: number) {
  next = seeded(seed)
}

export const rand = (n: number) => Math.floor(random() * n)
export const pick = <T>(list: readonly T[]) => list[rand(list.length)]!
