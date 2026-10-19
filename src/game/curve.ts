/**
 * How each level plays, read from the design in play: the difficulty curve,
 * tempo, laser counts and warning, level lengths, item chances. These only
 * read the design, never the run, so the editor can ask about any level.
 */
import { editOf, live } from '../design'
import { laserTraits, type LaserTrait } from './catalog'

/** The rules of the game in play (stock unless a custom game changes them). */
export const gameRules = () => live().rules
export const heldSlots = () => gameRules().slots
export const startHearts = () => gameRules().hearts
export const maxHearts = () => gameRules().maxHearts

/**
 * How hard a level (0-based) plays. Stock: levels 1–10 stretch what used to
 * be levels 1–6 or so (×0.65 a level), then it climbs faster and faster: a
 * steady 0.4 a level plus a growing square term. Tempo, laser counts and
 * warning time all read from this. The global tab moves every part of it,
 * and each level can scale its own.
 */
export const intensity = (level: number) => {
  const d = live()
  const g = d.global
  const base = level < 10 ? level * g.start : 10 * g.start + (level - 10) * g.climb + (level - 10) ** 2 * g.end
  return base * g.overall * (editOf(d, level).difficulty ?? 1)
}

export const tempoFor = (level: number) => {
  const d = live()
  const g = d.global
  return editOf(d, level).bpm ?? Math.round(Math.max(40, Math.min(g.tempoMax, g.tempoStart + intensity(level) * 8)))
}

/** A level's own music, else the game's, else none (the stock track). */
export const musicFor = (level: number) => editOf(live(), level).music ?? live().music
/** A level's background track, else the game's, else none. */
export const backgroundFor = (level: number) => editOf(live(), level).background ?? live().background

export const barsFor = (level: number) => editOf(live(), level).bars ?? live().global.barsPerLevel

/** Which level a number of bars played reaches. Levels can each last their own number of bars. */
export function levelAtBar(bars: number): number {
  const d = live()
  const each = d.global.barsPerLevel
  if (d.levels.every((l) => l.bars === undefined)) return Math.floor(bars / each)
  let level = 0
  let left = bars
  for (; level < d.levels.length; level++) {
    const length = barsFor(level)
    if (left < length) return level
    left -= length
  }
  return level + Math.floor(left / each)
}

/** Warning before a laser strikes, in 16th notes: long at first, then shorter. */
export function warnFor(level: number) {
  const d = live()
  const set = editOf(d, level).warn
  if (set !== undefined) return set
  const i = intensity(level)
  const steps = i < 1.3 ? 16 : i < 2.6 ? 12 : i < 14 ? 8 : 6
  return Math.max(4, Math.round(steps * d.global.warn))
}

/** Lasers that come each bar at a level, on average. */
export const lasersFor = (level: number) =>
  editOf(live(), level).lasers ?? Math.min(10, 1 + intensity(level)) * live().global.lasers
/** The most lasers armed at once. */
export const armedFor = (level: number) =>
  editOf(live(), level).armed ?? Math.round(Math.min(14, Math.floor(2 + intensity(level))) * live().global.lasers)

/** Laser tricks that can turn up at a level: its own pick, or the ones unlocked by then. */
export const traitsFor = (level: number): LaserTrait[] =>
  editOf(live(), level).traits ?? (Object.keys(laserTraits()) as LaserTrait[]).filter((t) => laserTraits()[t].unlock <= level)

export const snipperFor = (level: number) => editOf(live(), level).snipper ?? 1

/** × on an item's chance at a level: the global tweak times the level's own. */
export const rateOf = (kind: string, level: number) => (live().items[kind]?.rate ?? 1) * (editOf(live(), level).items?.[kind] ?? 1)
/** Steps an item stays on the board. */
export const lifeOf = (kind: string, steps: number) => {
  const bars = live().items[kind]?.life
  return bars === undefined ? steps : bars * 16
}
