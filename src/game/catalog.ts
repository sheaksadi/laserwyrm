/**
 * What the game is made of: the types, the stock tables (lasers and their
 * tiers, power-ups, fruit, colours) and the tuning numbers. Nothing here
 * changes during play.
 */
import { live, type CustomItem, type Design } from '../design'

export interface Vec { x: number; y: number }
export type DirName = 'up' | 'down' | 'left' | 'right'
export type Tone = 'mint' | 'coral' | 'sun' | 'lavender' | 'sky' | 'rose' | 'white'

export const DIRS: Record<DirName, Vec> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

/** One straight band of a laser: a row or a column, 1 or 3 cells wide. */
export interface Beam {
  axis: 'row' | 'col'
  /** The middle row or column of the band. */
  index: number
  width: 1 | 3
  /** Jagged bolt drawn when it fires, as SVG points. */
  bolt: string
}

/**
 * What a laser can do beyond a plain line. Each unlocks at a level (0-based):
 * wide 3-cell bands, a cross of row and column, a short fuse, a fuse that
 * drifts toward the head, and a second strike a beat after the first.
 */
export type LaserTrait = 'wide' | 'cross' | 'fast' | 'track' | 'repeat'
export type LaserKind = 'red' | 'blue' | 'purple' | 'white' | 'green' | 'gold' | 'prism'

export type TraitTable = Record<LaserTrait, { unlock: number; kind: LaserKind }>
export interface Tier { level: number; kind: LaserKind; name: string; blurb: string }

/** Revisions 1–3: blue at level 11, purple at 21, white at 31. */
const TRAITS_V1: TraitTable = {
  wide: { unlock: 10, kind: 'blue' },
  cross: { unlock: 20, kind: 'purple' },
  fast: { unlock: 30, kind: 'white' },
  track: { unlock: 40, kind: 'green' },
  repeat: { unlock: 50, kind: 'gold' },
}
/** Revision 4: purple comes first, at level 5; blue at 12, white at 21. The rest as before. */
const TRAITS_V4: TraitTable = {
  cross: { unlock: 4, kind: 'purple' },
  wide: { unlock: 11, kind: 'blue' },
  fast: { unlock: 20, kind: 'white' },
  track: { unlock: 40, kind: 'green' },
  repeat: { unlock: 50, kind: 'gold' },
}
/** Levels (0-based) where two, then three traits start to share one laser. */
export const COMBO_LEVEL = 60
export const PRISM_LEVEL = 80

const TIER_TEXT: Record<LaserTrait, Omit<Tier, 'level' | 'kind'>> = {
  wide: { name: 'Blue lasers', blurb: 'three wide: they splash' },
  cross: { name: 'Purple lasers', blurb: 'a row and a column at once' },
  fast: { name: 'White lasers', blurb: 'half the warning' },
  track: { name: 'Green lasers', blurb: 'they follow your head' },
  repeat: { name: 'Gold lasers', blurb: 'they strike twice' },
}
/** The levels where something new arrives, with what to tell the player: red, each trick as it unlocks, combos, prisms. */
function tiersOf(traits: TraitTable): Tier[] {
  const tricks = (Object.keys(traits) as LaserTrait[]).sort((a, b) => traits[a].unlock - traits[b].unlock)
  return [
    { level: 0, kind: 'red', name: 'Red', blurb: 'one straight line' },
    ...tricks.map((t) => ({ level: traits[t].unlock, kind: traits[t].kind, ...TIER_TEXT[t] })),
    { level: COMBO_LEVEL, kind: 'gold', name: 'Combos', blurb: 'lasers mix two tricks' },
    { level: PRISM_LEVEL, kind: 'prism', name: 'Prism lasers', blurb: 'three tricks at once' },
  ]
}
const TIERS_V1 = tiersOf(TRAITS_V1)
const TIERS_V4 = tiersOf(TRAITS_V4)

export interface Laser {
  id: number
  kind: LaserKind
  beams: Beam[]
  traits: LaserTrait[]
  /** Step it fires on; the warning lasts from now until then. */
  strikeStep: number
  /** Warning length in ms, for the fuse animation. */
  warnMs: number
  struck: boolean
  from: 'start' | 'end'
  /** The second strike of a gold laser; it does not strike again. */
  echo: boolean
}

export type PowerKind = 'shield' | 'double' | 'slow' | 'dash' | 'magnet' | 'ghost'
export type FruitKind = 'apple' | 'cherry' | 'star' | 'cookie' | 'starry'
/** A home-made item, by id: `c` and a number. */
export type CustomId = `c${number}`
/** Something that can be held for later: a stock power-up or a home-made one. */
export type Holdable = PowerKind | CustomId
/** The wizard cookie: eaten, it clears the lasers and keeps new ones off for a moment. */
export type ItemKind = FruitKind | PowerKind | 'heart' | 'totem' | 'wizard' | CustomId
export interface Item { id: number; kind: ItemKind; x: number; y: number; until: number | null }

export const FRUIT_GROW: Record<FruitKind, number> = { apple: 1, cherry: 3, star: 5, cookie: 2, starry: 4 }

/**
 * Which rules of play a run uses. 1: the first item table. 2 adds the
 * cookies (plain, wizard, starry). 3: a new kind of laser no longer stops
 * play for two bars; it is announced and play goes on. 4: purple lasers
 * come first (level 5), then blue (12) and white (21). 5: far fewer lasers;
 * their number grows slowly and steps up with each new kind (see
 * `lasersFor`). 6: slow-mo slows the world, not the snake (see
 * `worldSlowed`). 7: energy and dashing. The use button dashes, paid for
 * with energy that fruit and time fill; power-ups go off as they are eaten
 * instead of being held, and a totem refills hearts and energy at once
 * (see `ENERGY`). Replays keep the revision they were played with, so old
 * runs play back the same.
 */
export const ITEMS_REV = 7

/** The revision of the run in play (set by `reset`): everything that differs between revisions reads it. */
export const revision = { rev: ITEMS_REV }

/** Revision 7 on: the use button dashes for energy, and power-ups are not held. */
export const usesEnergy = () => revision.rev >= 7
/**
 * Energy (revision 7): a dash costs `dash`; it starts at `start`, comes back
 * one point every `regenSteps` steps (about one a second), and fruit adds
 * its share (a home-made fruit: `perGrow` a cell it grows).
 */
export const ENERGY = {
  max: 100,
  start: 40,
  dash: 35,
  regenSteps: 8,
  fruit: { apple: 6, cherry: 10, cookie: 20, star: 30, starry: 50 } as Record<FruitKind, number>,
  perGrow: 4,
}

/** When each laser trick unlocks, by the rules in play. */
export const laserTraits = (): TraitTable => (revision.rev >= 4 ? TRAITS_V4 : TRAITS_V1)
/** The laser tiers, by the rules in play: their index is also the music's arrangement. */
export const laserTiers = (): Tier[] => (revision.rev >= 4 ? TIERS_V4 : TIERS_V1)

/** Every power-up: what it is called, what it does, its colour, and how long it lasts (0: instant). */
export const POWERS: Record<PowerKind, { name: string; blurb: string; tone: Tone; bars: number }> = {
  shield: { name: 'Shield', blurb: 'Blocks the next laser hit', tone: 'sky', bars: 8 },
  double: { name: 'Double', blurb: 'Every beat scores ×2', tone: 'sun', bars: 4 },
  slow: { name: 'Slow-mo', blurb: 'Everything but you slows down', tone: 'lavender', bars: 2 },
  dash: { name: 'Dash', blurb: 'Lunge 4 cells ahead, through your tail', tone: 'mint', bars: 0 },
  magnet: { name: 'Magnet', blurb: 'Fruit drifts toward your head', tone: 'rose', bars: 4 },
  ghost: { name: 'Ghost', blurb: 'Slide through your own body', tone: 'white', bars: 4 },
}
export const POWER_KINDS = Object.keys(POWERS) as PowerKind[]
export const TOTEM = { name: 'Totem of Undying', blurb: 'Cheats death once, then crumbles' }

/** Colours for each tone, shared by the board and the HUD. */
export const TONE_COLOR: Record<Tone, string> = {
  mint: 'var(--mint)',
  coral: 'var(--coral)',
  sun: 'var(--sun)',
  lavender: 'var(--lavender)',
  sky: 'var(--sky)',
  rose: 'var(--rose)',
  white: '#E8E8FF',
}

export const isPower = (kind: ItemKind): kind is PowerKind => kind in POWERS
export const isCustom = (kind: string): kind is CustomId => /^c\d+$/.test(kind)
/** A home-made item in the design being played. */
export const customItem = (kind: CustomId): CustomItem | undefined => live().custom.find((c) => c.id === kind)

/** Name and what it does, for anything that can be held or noticed. */
export function itemInfo(kind: Holdable | 'totem'): { name: string; blurb: string } {
  if (kind === 'totem') return TOTEM
  if (isCustom(kind)) {
    const c = customItem(kind)
    return { name: c?.name ?? 'Unknown', blurb: c?.blurb ?? '' }
  }
  return POWERS[kind]
}

/** Stock: power-up slots, hearts at the start, most hearts. A game's rules can change all three. */
export const MAX_HELD = 2
export const START_HEARTS = 3
export const MAX_HEARTS = 5

/** A pixel heart on a 7 × 6 grid, for the board, the HUD and the rules. */
export const HEART_PATH =
  'M1 0H3V1H4V0H6V1H7V3H6V4H5V5H4V6H3V5H2V4H1V3H0V1H1Z'
/** Chance per bar that a heart drops, while the snake is missing some. */
export const HEART_CHANCE = 0.05

export interface Debris {
  id: number
  cells: Vec[]
  /** How long the piece lies still before it starts popping. */
  holdMs: number
  gapMs: number
}
export interface Popup { id: number; x: number; y: number; text: string; tone: Tone }

/** A severed piece lies still this long, then pops one cell every `POP_GAP_MS`. */
export const HOLD_MS = 700
export const POP_GAP_MS = 45
export const POPUP_MS = 1000
export const BOLT_MS = 320
/** Counted in steps (16th notes), not ms, so replays match. */
export const SNIPPER_RESPAWN_STEPS = 64
export const SNIPPER_REST_STEPS = 20
export const DASH_CELLS = 4
/** Chance per bar that a totem drops, from level 2 on. */
export const TOTEM_CHANCE = 0.012
export const NOTICE_MS = 1800
/** How long a new kind of laser's notice stays. */
export const TIER_NOTE_MS = 3200

/** Inputs, as [steps done before it, code]: u d l r for turns, i for using a power-up. */
export type ReplayEvent = [number, 'u' | 'd' | 'l' | 'r' | 'i']
export type Mode = 'normal' | 'hardcore'
export interface Replay {
  v: 1
  /** Missing on runs from before modes: those are normal. */
  mode?: Mode
  seed: number
  cols: number
  rows: number
  /** Steps played until the end. */
  steps: number
  events: ReplayEvent[]
  /** The game's design, when the run was not played by the stock one. */
  design?: Design
  /** The item table it was played with (missing: 1, before cookies). */
  rev?: number
}
export const DIR_CODE: Record<DirName, ReplayEvent[1]> = { up: 'u', down: 'd', left: 'l', right: 'r' }
export const CODE_DIR = { u: 'up', d: 'down', l: 'left', r: 'right' } as const

/**
 * What the player should feel through a controller: the moment and how big
 * it was (cells cut, say). The view turns these into rumble.
 */
export type Feel = 'cut' | 'hurt' | 'die' | 'block' | 'revive' | 'level' | 'eat'

/**
 * Moments worth finding again on a replay's timeline. These fire in replays
 * too (unlike feel), so the viewer can scan a run once and mark its bar.
 */
export type Mark = 'power' | 'use' | 'cut' | 'hurt' | 'heal' | 'level' | 'totem' | 'die'

/**
 * Every screen plays the same board: 48 × 26 cells, scaled to fit. A big
 * monitor and a phone get the same room to move, so runs (and the high
 * scores) compare fairly.
 */
export const GRID = { cols: 48, rows: 26 }

export const MAX_LEVEL = 100

/** Which laser tier (and so which music) a level belongs to. */
export const tierOf = (level: number) => laserTiers().reduce((at, t, i) => (t.level <= level ? i : at), 0)

/** Two bars of pause to meet a new laser, then four calmer bars. */
export const INTRO_STEPS = 32
export const CALM_STEPS = 64
