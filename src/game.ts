/**
 * The game engine.
 *
 * Classic snake, set to music. The conductor in `audio.ts` is the clock: the
 * snake moves on every 16th note, and lasers arm on a beat and strike on a
 * later one, right on the zap in the track. Every eight bars the level goes
 * up: the tempo rises, the track fills out, and more lasers come, with less
 * warning.
 *
 * Scoring: every beat the snake survives scores its multiplier, which grows
 * faster than its length and climbs with the level, so a long snake late in
 * the game is worth far more than a short one early. Fruit only grows it.
 *
 * A laser slices the body where it crosses: the head side lives on, and the
 * rest lies there for a moment, then pops cell by cell. Points already scored
 * stay, but the multiplier drops. Only a laser through the head costs a heart;
 * the third ends the game. Walls and biting yourself end it at once. Each new
 * level refills a heart up to three; a rare heart drop can take you to five.
 *
 * Power-ups are held, not swallowed: the snake carries up to two and uses
 * the oldest on Space. One picked up with both slots full works at once. The
 * Totem of Undying is rare and passive: it cheats one death of any kind.
 *
 * Cheats (the C menu) can jump levels, turn on god mode and hand out items.
 * A run that used any of them never counts toward the best score.
 *
 * Two modes. Normal: walls wrap the snake to the other side, each level
 * refills a heart up to three, and each new kind of laser is introduced with
 * a short pause (the music slides to a stop and comes back in a new
 * arrangement) and then a calmer stretch. Hardcore: walls kill, no hearts
 * back, no pauses, no calm. Each mode has its own high scores.
 *
 * Every run is reproducible: all chance comes from one seeded generator, all
 * timing that matters is counted in steps, and each input is logged against
 * the step it landed before. Seed, grid size and inputs are a replay; feeding
 * them back through the same engine plays the game again exactly.
 */
import { reactive, watch } from 'vue'
import { conductor, now, queue, sound as rawSound, stepSeconds } from './audio'
import { musicForLevel, warmUp } from './music'
import { design, editOf, isStock, itemsStock, live, playWith, snapshot, unpackWalls, type CustomItem, type Design, type Edges, type Stack } from './design'

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

export const LASER_TRAITS: Record<LaserTrait, { unlock: number; kind: LaserKind }> = {
  wide: { unlock: 10, kind: 'blue' },
  cross: { unlock: 20, kind: 'purple' },
  fast: { unlock: 30, kind: 'white' },
  track: { unlock: 40, kind: 'green' },
  repeat: { unlock: 50, kind: 'gold' },
}
/** Levels (0-based) where two, then three traits start to share one laser. */
const COMBO_LEVEL = 60
const PRISM_LEVEL = 80

/** The levels where something new arrives, with what to tell the player. */
export const LASER_TIERS: { level: number; kind: LaserKind; name: string; blurb: string }[] = [
  { level: 0, kind: 'red', name: 'Red', blurb: 'one straight line' },
  { level: 10, kind: 'blue', name: 'Blue lasers', blurb: 'three wide: they splash' },
  { level: 20, kind: 'purple', name: 'Purple lasers', blurb: 'a row and a column at once' },
  { level: 30, kind: 'white', name: 'White lasers', blurb: 'half the warning' },
  { level: 40, kind: 'green', name: 'Green lasers', blurb: 'they follow your head' },
  { level: 50, kind: 'gold', name: 'Gold lasers', blurb: 'they strike twice' },
  { level: COMBO_LEVEL, kind: 'gold', name: 'Combos', blurb: 'lasers mix two tricks' },
  { level: PRISM_LEVEL, kind: 'prism', name: 'Prism lasers', blurb: 'three tricks at once' },
]

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
export type FruitKind = 'apple' | 'cherry' | 'star'
/** A home-made item, by id: `c` and a number. */
export type CustomId = `c${number}`
/** Something that can be held for later: a stock power-up or a home-made one. */
export type Holdable = PowerKind | CustomId
export type ItemKind = FruitKind | PowerKind | 'heart' | 'totem' | CustomId
export interface Item { id: number; kind: ItemKind; x: number; y: number; until: number | null }

export const FRUIT_GROW: Record<FruitKind, number> = { apple: 1, cherry: 3, star: 5 }

/** Every power-up: what it is called, what it does, its colour, and how long it lasts (0: instant). */
export const POWERS: Record<PowerKind, { name: string; blurb: string; tone: Tone; bars: number }> = {
  shield: { name: 'Shield', blurb: 'Blocks the next laser hit', tone: 'sky', bars: 8 },
  double: { name: 'Double', blurb: 'Every beat scores ×2', tone: 'sun', bars: 4 },
  slow: { name: 'Slow-mo', blurb: 'You move at half speed', tone: 'lavender', bars: 2 },
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

export const MAX_HELD = 2
export const START_HEARTS = 3
export const MAX_HEARTS = 5
/** A pixel heart on a 7 × 6 grid, for the board, the HUD and the rules. */
export const HEART_PATH =
  'M1 0H3V1H4V0H6V1H7V3H6V4H5V5H4V6H3V5H2V4H1V3H0V1H1Z'
/** Chance per bar that a heart drops, while the snake is missing some. */
const HEART_CHANCE = 0.05

export interface Debris {
  id: number
  cells: Vec[]
  /** How long the piece lies still before it starts popping. */
  holdMs: number
  gapMs: number
}
export interface Popup { id: number; x: number; y: number; text: string; tone: Tone }

/** A severed piece lies still this long, then pops one cell every `POP_GAP_MS`. */
const HOLD_MS = 700
const POP_GAP_MS = 45
const POPUP_MS = 1000
const BOLT_MS = 320
/** Counted in steps (16th notes), not ms, so replays match. */
const SNIPPER_RESPAWN_STEPS = 64
const SNIPPER_REST_STEPS = 20
const DASH_CELLS = 4
/** Chance per bar that a totem drops, from level 2 on. */
const TOTEM_CHANCE = 0.012
const NOTICE_MS = 1800

/** v2: scores are length × beats now, so old fruit-count bests do not compare. */
const BEST_KEY = 'snake-best-v2'

function readBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0
  } catch {
    return 0
  }
}

function saveBest(value: number) {
  try {
    localStorage.setItem(BEST_KEY, String(value))
  } catch {
    /* storage blocked: the best score lasts for this visit */
  }
}

const same = (a: Vec, b: Vec) => a.x === b.x && a.y === b.y
/* ─── Chance and replays ─────────────────────────────────────────────── */

/** mulberry32: small, fast, and the same everywhere for the same seed. */
function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
let random = seeded(1)

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
}
const DIR_CODE: Record<DirName, ReplayEvent[1]> = { up: 'u', down: 'd', left: 'l', right: 'r' }
const CODE_DIR = { u: 'up', d: 'down', l: 'left', r: 'right' } as const

/** The run being played: its seed, grid and inputs so far. */
let recording: Replay = { v: 1, mode: 'normal', seed: 1, cols: 30, rows: 20, steps: 0, events: [] }
/** Steps processed this run; inputs are filed against it. */
let stepsDone = 0

/** Playback of a recorded run. While active, input and sound are off. */
export const replay = reactive({
  active: false,
  /** Sounds on while watching at an ear-friendly speed; off when skimming or seeking. */
  sound: false,
  ended: false,
  /** Steps played so far, and the total. */
  at: 0,
  total: 0,
})
let replayEvents: ReplayEvent[] = []
let replayCursor = 0
let savedCheats = { god: false, noLasers: false }

/** Sounds go quiet during a replay; everything else calls through. */
const sound = new Proxy(rawSound, {
  get: (target, key: keyof typeof rawSound) => (replay.active && !replay.sound ? () => {} : target[key]),
})

/**
 * What the player should feel through a controller: the moment and how big
 * it was (cells cut, say). The view turns these into rumble.
 */
export type Feel = 'cut' | 'hurt' | 'die' | 'block' | 'revive' | 'level' | 'eat'
const feelers: ((kind: Feel, amount: number) => void)[] = []
export const onFeel = (fn: (kind: Feel, amount: number) => void) => feelers.push(fn)
function feel(kind: Feel, amount = 1) {
  if (!replay.active) for (const fn of feelers) fn(kind, amount)
}

/**
 * Moments worth finding again on a replay's timeline. These fire in replays
 * too (unlike feel), so the viewer can scan a run once and mark its bar.
 */
export type Mark = 'power' | 'use' | 'cut' | 'hurt' | 'heal' | 'level' | 'totem' | 'die'
const markers = new Set<(kind: Mark, step: number) => void>()
export function onMark(fn: (kind: Mark, step: number) => void) {
  markers.add(fn)
  return () => markers.delete(fn)
}
function mark(kind: Mark) {
  for (const fn of markers) fn(kind, state.step)
}

/** A copy of the last run, ready to send with a score. */
export const lastReplay = (): Replay => ({ ...recording, steps: stepsDone, events: [...recording.events] })

const rand = (n: number) => Math.floor(random() * n)
const pick = <T>(list: readonly T[]) => list[rand(list.length)]!
const inBeam = (cell: Vec, beam: Beam) =>
  Math.abs((beam.axis === 'row' ? cell.y : cell.x) - beam.index) <= (beam.width - 1) / 2
const onLine = (cell: Vec, laser: Laser) => laser.beams.some((beam) => inBeam(cell, beam))
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

const barsFor = (level: number) => editOf(live(), level).bars ?? live().global.barsPerLevel

/** Which level a number of bars played reaches. Levels can each last their own number of bars. */
function levelAtBar(bars: number): number {
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

let uid = 0

/** Cheat switches. They outlive a restart, so you can set them up and replay. */
export const cheats = reactive({
  /** Walls wrap, the body is not solid, lasers do nothing. */
  god: false,
  noLasers: false,
})

export const state = reactive({
  cols: 30,
  rows: 20,
  snake: [] as Vec[],
  direction: { ...DIRS.right } as Vec,
  queue: [] as Vec[],
  grow: 0,
  score: 0,
  hearts: START_HEARTS,
  best: readBest(),
  longest: 3,
  status: 'ready' as 'ready' | 'running' | 'paused' | 'over',
  reason: '',

  level: 0,
  bpm: tempoFor(0),
  step: 0,
  /** Bumped every beat, so the view can pulse. */
  beat: 0,

  items: [] as Item[],
  /** Each effect lasts until this step; 0 means off. */
  effects: { shield: 0, double: 0, slow: 0, magnet: 0, ghost: 0 },
  /** Power-ups carried for later, oldest first. */
  held: [] as Holdable[],
  /** Holding a Totem of Undying. */
  totem: false,
  /** A short note under the HUD: what was picked up or used, and what it does. */
  notice: null as { id: number; kind: Holdable | 'totem'; title: string; sub: string } | null,
  /** The last game beat the stored best. */
  newBest: false,
  /** Levels skipped by the cheat menu: the level is this plus the bars played. */
  levelOffset: 0,
  /** Bars spent in tier intros; they do not count toward the next level. */
  pausedBars: 0,
  mode: 'normal' as Mode,
  /** A new kind of laser being introduced: play is frozen until `until`. */
  intro: null as { tier: number; until: number; healed: boolean } | null,
  /** Until this step, after an intro, lasers come less often. */
  calmUntil: 0,
  /** Cheats were used, or the game was changed, so this run cannot set a best. */
  cheated: false,
  /** Real cheats (god mode, no lasers, a level jump, items handed out), not just a changed game. */
  usedCheats: false,
  lasers: [] as Laser[],
  debris: [] as Debris[],
  popups: [] as Popup[],
  banner: null as { id: number; title: string; sub: string } | null,
  snipper: {
    x: 0,
    y: 0,
    facing: { ...DIRS.left } as Vec,
    active: false,
    until: 0,
    resting: false,
  },

  stats: { eaten: 0, lost: 0, cuts: 0, snippers: 0, blocked: 0 },
  /** Wall cells (y × cols + x), from a home-made level. */
  walls: [] as number[],
  /** Bumped on every hit, so the view can shake once. */
  shake: 0,
})

export const isActive = (effect: keyof typeof state.effects) => state.effects[effect] > state.step

/* ─── Game-clock timers ──────────────────────────────────────────────── */

const clock = () => now() * 1000
const timers: { at: number; run: () => void }[] = []
function later(ms: number, run: () => void) {
  timers.push({ at: clock() + ms, run })
}

/* ─── Setup ──────────────────────────────────────────────────────────── */

/** Phones and tablets get on-screen controls, so the board makes room for them. */
export const isTouch = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window)

/**
 * Where the board sits, in px from each window edge. The HUD band is on top
 * (with room under it for the power-up hint on desktop). Phones play
 * sideways with the HUD and controls laid faintly over the board, so the
 * board takes the whole screen; held upright, the view asks to be turned.
 */
export function arenaInsets() {
  const w = window.innerWidth
  const h = window.innerHeight
  if (!isTouch()) return { top: 90, right: 12, bottom: 12, left: 12, pad: 'none' as 'none' | 'sticks', portrait: false }
  // The board fills the height; the HUD sits in narrow gutters either side, the controls lie faintly over the board.
  return { top: 4, right: 48, bottom: 4, left: 48, pad: 'sticks' as 'none' | 'sticks', portrait: h > w }
}

export const layout = reactive(arenaInsets())

/** Keep the board and pad placement in step with the window. */
export function fitLayout() {
  Object.assign(layout, arenaInsets())
}

/**
 * Every screen plays the same board: 48 × 26 cells, scaled to fit. A big
 * monitor and a phone get the same room to move, so runs (and the high
 * scores) compare fairly.
 */
export const GRID = { cols: 48, rows: 26 }
export function fitGrid() {
  fitLayout()
  state.cols = GRID.cols
  state.rows = GRID.rows
}

/** Walls, for quick lookups; `state.walls` is the same, for drawing. */
let wallSet = new Set<number>()
const isWall = (cell: Vec) => wallSet.has(cell.y * state.cols + cell.x)

/** The walls drawn for the current level. */
let wallsShown: string | undefined

/** Put up a level's walls, leaving any cell the snake is on clear. */
function setWalls(level: number) {
  const walls = editOf(live(), level).walls
  if (walls === wallsShown && state.walls.length === wallSet.size) return
  wallsShown = walls
  const keep = new Set(state.snake.map((c) => c.y * state.cols + c.x))
  const out = unpackWalls(walls, state.cols * state.rows).filter((at) => !keep.has(at))
  state.walls = out
  wallSet = new Set(out)
  state.items = state.items.filter((i) => !isWall(i))
}

function freeCell(): Vec {
  const taken = (x: number, y: number) =>
    wallSet.has(y * state.cols + x) ||
    state.snake.some((c) => c.x === x && c.y === y) ||
    state.items.some((i) => i.x === x && i.y === y) ||
    (state.snipper.active && state.snipper.x === x && state.snipper.y === y)
  const free: Vec[] = []
  for (let y = 1; y < state.rows - 1; y++)
    for (let x = 1; x < state.cols - 1; x++) if (!taken(x, y)) free.push({ x, y })
  return pick(free)
}

function addItem(kind: ItemKind, lifeSteps: number | null) {
  const cell = freeCell()
  state.items.push({ id: ++uid, kind, ...cell, until: lifeSteps === null ? null : state.step + lifeSteps })
}

export function reset(from?: { seed: number; cols: number; rows: number; mode?: Mode }) {
  conductor.stop()
  if (from) {
    state.cols = from.cols
    state.rows = from.rows
  } else {
    fitGrid()
  }
  const seed = from?.seed ?? (Math.floor(Math.random() * 2 ** 32) >>> 0)
  random = seeded(seed)
  if (from) state.mode = from.mode ?? 'normal'
  recording = { v: 1, mode: state.mode, seed, cols: state.cols, rows: state.rows, steps: 0, events: [] }
  if (!isStock(live())) recording.design = snapshot(live())
  conductor.setStyle(0, 'play', 0)
  stepsDone = 0
  const cx = Math.floor(state.cols / 2) - 3
  const cy = Math.floor(state.rows / 2)
  Object.assign(state, {
    snake: [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }],
    direction: { ...DIRS.right },
    queue: [],
    grow: 0,
    score: 0,
    hearts: START_HEARTS,
    longest: 3,
    status: 'ready',
    reason: '',
    level: 0,
    bpm: tempoFor(0),
    step: 0,
    items: [],
    effects: { shield: 0, double: 0, slow: 0, magnet: 0, ghost: 0 },
    held: [],
    totem: false,
    notice: null,
    newBest: false,
    levelOffset: 0,
    pausedBars: 0,
    intro: null,
    calmUntil: 0,
    cheated: cheats.god || cheats.noLasers || !isStock(live()),
    usedCheats: cheats.god || cheats.noLasers,
    lasers: [],
    debris: [],
    popups: [],
    banner: null,
    stats: { eaten: 0, lost: 0, cuts: 0, snippers: 0, blocked: 0 },
  })
  state.snipper.active = false
  state.snipper.until = 0
  timers.length = 0
  conductor.setLevel(0, state.bpm)
  wallsShown = undefined
  state.walls = []
  wallSet = new Set()
  setWalls(0)
  warmUp(live().levels.flatMap((l) => (l.music ? [l.music] : [])))
  musicForLevel(editOf(live(), 0).music, 0)
  addItem('apple', null)
}

/* ─── Effects ────────────────────────────────────────────────────────── */

function popup(cell: Vec, text: string, tone: Tone) {
  const id = ++uid
  state.popups.push({ id, x: cell.x, y: cell.y, text, tone })
  later(POPUP_MS, () => (state.popups = state.popups.filter((p) => p.id !== id)))
}

function banner(title: string, sub: string) {
  const id = ++uid
  state.banner = { id, title, sub }
  later(1800, () => {
    if (state.banner?.id === id) state.banner = null
  })
}

function notice(kind: Holdable | 'totem', title: string, sub: string) {
  const id = ++uid
  state.notice = { id, kind, title, sub }
  later(NOTICE_MS, () => {
    if (state.notice?.id === id) state.notice = null
  })
}

function die(reason: string) {
  if (state.totem) return revive(reason)
  state.reason = reason
  state.shake++
  if (replay.active) {
    replay.ended = true
    mark('die')
    return
  }
  state.status = 'over'
  conductor.stop()
  sound.die()
  feel('die', state.snake.length)
  mark('die')
  state.newBest = !state.cheated && state.score > state.best
  if (state.newBest) {
    state.best = state.score
    saveBest(state.best)
  }
}

/** The totem crumbles and the snake lives: one heart, a turn away from the wall, two bars of cover. */
function revive(reason: string) {
  state.totem = false
  state.hearts = Math.max(1, state.hearts)
  state.queue = []
  if (reason === 'hit the wall' || reason === 'hit a wall') {
    state.snake.reverse()
    const [head, neck] = state.snake
    state.direction = neck ? { x: head!.x - neck.x, y: head!.y - neck.y } : { x: -state.direction.x, y: -state.direction.y }
  }
  const cover = state.step + 32
  state.effects.shield = Math.max(state.effects.shield, cover)
  state.effects.ghost = Math.max(state.effects.ghost, cover)
  state.shake++
  sound.level()
  feel('revive')
  mark('totem')
  banner('Undying!', 'the totem crumbles')
  popup(state.snake[0]!, 'saved', 'sun')
}

/** Slice the snake at `index`: the head side lives, the rest lies there, then pops. */
function cut(index: number) {
  const lost = state.snake.splice(index)
  if (!lost.length) return
  state.grow = 0
  const id = ++uid
  state.debris.push({ id, cells: lost, holdMs: HOLD_MS, gapMs: POP_GAP_MS })
  later(HOLD_MS + lost.length * POP_GAP_MS + 700, () => (state.debris = state.debris.filter((d) => d.id !== id)))
  state.stats.lost += lost.length
  state.stats.cuts++
  state.shake++
  popup(lost[0]!, `−${lost.length}`, 'coral')
  sound.cut()
  sound.pops(lost.length, HOLD_MS / 1000, POP_GAP_MS / 1000)
  feel('cut', lost.length)
  mark('cut')
}

/* ─── Lasers ─────────────────────────────────────────────────────────── */

/** Warning before a laser strikes, in 16th notes: long at first, then shorter. */
function warnFor(level: number) {
  const d = live()
  const set = editOf(d, level).warn
  if (set !== undefined) return set
  const i = intensity(level)
  const steps = i < 1.3 ? 16 : i < 2.6 ? 12 : i < 14 ? 8 : 6
  return Math.max(4, Math.round(steps * d.global.warn))
}
const warnSteps = () => warnFor(state.level)
/** Lasers that come each bar at a level, on average. */
const lasersFor = (level: number) =>
  editOf(live(), level).lasers ?? Math.min(10, 1 + intensity(level)) * live().global.lasers
/** The most lasers armed at once. */
const armedFor = (level: number) =>
  editOf(live(), level).armed ?? Math.round(Math.min(14, Math.floor(2 + intensity(level))) * live().global.lasers)

/** Laser tricks that can turn up at a level: its own pick, or the ones unlocked by then. */
export const traitsFor = (level: number): LaserTrait[] =>
  editOf(live(), level).traits ?? (Object.keys(LASER_TRAITS) as LaserTrait[]).filter((t) => LASER_TRAITS[t].unlock <= level)

const edgesFor = (level: number): Edges => editOf(live(), level).edges ?? (state.mode === 'hardcore' ? 'kill' : 'wrap')
const snipperFor = (level: number) => editOf(live(), level).snipper ?? 1
/** Hearts back on reaching a level: normal play refills one, up to the starting three. */
const healFor = (level: number) =>
  editOf(live(), level).heal ?? (state.mode === 'normal' && state.hearts < START_HEARTS ? 1 : 0)
/** Stop to introduce a level: stock does it for each new kind of laser, in normal play. */
const introFor = (level: number) =>
  editOf(live(), level).intro ?? (state.mode === 'normal' && level > 0 && LASER_TIERS.some((t) => t.level === level))

/**
 * How a level plays by the current design, for the editor: every value, and
 * whether the level sets it itself or follows the curve.
 */
export const levelPlan = (level: number) => {
  const e = editOf(live(), level)
  return {
    intensity: intensity(level),
    bpm: tempoFor(level),
    lasers: lasersFor(level),
    armed: armedFor(level),
    warn: warnFor(level),
    bars: barsFor(level),
    traits: traitsFor(level),
    edges: edgesFor(level),
    snipper: snipperFor(level),
    heal: e.heal ?? (state.mode === 'normal' ? 1 : 0),
    intro: introFor(level),
    calm: e.calm ?? (introFor(level) ? CALM_STEPS / 16 : 0),
    score: e.score ?? 1,
  }
}
/** Older name, for the global tab. */
export const levelFeel = levelPlan

/** Which tricks a new laser gets: more of them, and more often, the higher the level. */
function rollTraits(): LaserTrait[] {
  const level = state.level
  const own = editOf(live(), level).traits
  if (own) {
    // A level with its own pick: about two in three lasers get one of its tricks, now and then two.
    const open = own
    if (!open.length || random() > 0.65) return []
    const first = pick(open)
    const second = open.length > 1 && random() < 0.3 ? pick(open.filter((t) => t !== first)) : null
    return second ? [first, second] : [first]
  }
  const open = (Object.keys(LASER_TRAITS) as LaserTrait[]).filter((t) => LASER_TRAITS[t].unlock <= level)
  if (!open.length) return []
  const newest = open[open.length - 1]!
  const roll = random()
  let count = 0
  if (level >= PRISM_LEVEL && roll < 0.35) count = 3
  else if (level >= COMBO_LEVEL && roll < 0.45) count = 2
  else if (roll < Math.min(0.8, 0.4 + (level - 10) * 0.01)) count = 1
  const traits: LaserTrait[] = []
  // A freshly unlocked trick turns up often, so the player meets it.
  if (count && random() < 0.5) traits.push(newest)
  while (traits.length < Math.min(count, open.length)) {
    const t = pick(open)
    if (!traits.includes(t)) traits.push(t)
  }
  return traits
}

function kindOf(traits: LaserTrait[]): LaserKind {
  if (traits.length >= 3) return 'prism'
  if (!traits.length) return 'red'
  // Two tricks wear the colour of the later one.
  const latest = traits.reduce((a, b) => (LASER_TRAITS[b].unlock > LASER_TRAITS[a].unlock ? b : a))
  return LASER_TRAITS[latest].kind
}

function spawnLaser(forced?: Pick<Beam, 'axis' | 'index'>) {
  const head = state.snake[0]!
  const body = state.snake.slice(2)
  const busy = (axis: Beam['axis'], index: number) =>
    state.lasers.some((l) => !l.struck && l.beams.some((b) => b.axis === axis && b.index === index))

  // Half the time the laser runs along the line the snake travels on: turn
  // off it in time and only the tail still on it gets sliced. Otherwise it
  // crosses the body somewhere, or lands anywhere.
  for (let attempt = 0; attempt < 12; attempt++) {
    let axis: Beam['axis']
    let index: number
    let target: Vec = head
    const roll = random()
    if (forced && attempt === 0) {
      axis = forced.axis
      index = forced.index
    } else if (roll < 0.5 && attempt === 0) {
      axis = state.direction.x ? 'row' : 'col'
      index = axis === 'row' ? head.y : head.x
    } else if (roll < 0.85 && body.length) {
      target = pick(body)
      axis = random() < 0.5 ? 'row' : 'col'
      index = axis === 'row' ? target.y : target.x
    } else {
      axis = random() < 0.5 ? 'row' : 'col'
      index = rand(axis === 'row' ? state.rows : state.cols)
      target = { x: rand(state.cols), y: rand(state.rows) }
    }
    if (busy(axis, index)) continue

    const traits = rollTraits()
    const width = traits.includes('wide') ? 3 : 1
    const beams: Beam[] = [{ axis, index, width, bolt: '' }]
    // A cross adds the other direction through the same target.
    if (traits.includes('cross')) {
      const other = axis === 'row' ? 'col' : 'row'
      beams.push({ axis: other, index: other === 'row' ? target.y : target.x, width, bolt: '' })
    }
    const steps = traits.includes('fast') ? Math.max(4, warnSteps() / 2) : warnSteps()
    const warnSec = steps * stepSeconds()
    state.lasers.push({
      id: ++uid,
      kind: kindOf(traits),
      beams,
      traits,
      strikeStep: state.step + steps,
      warnMs: warnSec * 1000,
      struck: false,
      from: random() < 0.5 ? 'start' : 'end',
      echo: false,
    })
    sound.riser(warnSec)
    return { axis, index }
  }
  return null
}

/** Green lasers drift one cell toward the head each beat, until the last beat of their fuse. */
function trackLasers() {
  const head = state.snake[0]!
  for (const laser of state.lasers) {
    if (laser.struck || !laser.traits.includes('track') || laser.strikeStep - state.step <= 4) continue
    for (const beam of laser.beams) {
      const goal = beam.axis === 'row' ? head.y : head.x
      beam.index += Math.sign(goal - beam.index)
    }
  }
}

function boltPoints(beam: Beam): string {
  const length = beam.axis === 'row' ? state.cols : state.rows
  const points: string[] = []
  for (let i = 0; i <= length; i += 0.5) {
    const jitter = i === 0 || i >= length ? 0 : (random() - 0.5) * 0.7 * beam.width
    const across = beam.index + 0.5 + jitter
    points.push(beam.axis === 'row' ? `${i},${across}` : `${across},${i}`)
  }
  return points.join(' ')
}

function strike(laser: Laser) {
  laser.struck = true
  for (const beam of laser.beams) beam.bolt = boltPoints(beam)
  later(BOLT_MS, () => (state.lasers = state.lasers.filter((l) => l.id !== laser.id)))

  // Gold lasers fire again on the same lines a beat later.
  if (laser.traits.includes('repeat') && !laser.echo) {
    const warnSec = 4 * stepSeconds()
    state.lasers.push({
      ...laser,
      id: ++uid,
      beams: laser.beams.map((b) => ({ ...b, bolt: '' })),
      strikeStep: state.step + 4,
      warnMs: warnSec * 1000,
      struck: false,
      echo: true,
    })
    sound.riser(warnSec)
  }

  const s = state.snipper
  if (s.active && onLine(s, laser)) {
    s.active = false
    s.until = state.step + SNIPPER_RESPAWN_STEPS
    state.grow += 2
    popup(s, '+2 × zapped', 'lavender')
  }

  if (cheats.god) return
  const headHit = onLine(state.snake[0]!, laser)
  const index = state.snake.findIndex((cell, i) => i > 0 && onLine(cell, laser))
  if (!headHit && index < 0) return
  if (isActive('shield')) {
    state.effects.shield = 0
    state.stats.blocked++
    sound.shield()
    feel('block')
    popup(state.snake[0]!, 'blocked', 'sky')
    return
  }
  if (index > 0) cut(index)
  // The body can be sliced freely; only the head costs a heart.
  if (headHit) {
    state.hearts--
    feel('hurt', state.hearts)
    mark('hurt')
    state.shake++
    popup(state.snake[0]!, '−1 life', 'coral')
    if (state.hearts <= 0) die('ran out of hearts')
  }
}

/* ─── The snipper ────────────────────────────────────────────────────── */

function spawnSnipper() {
  const s = state.snipper
  const side = rand(4)
  s.x = side === 0 ? 0 : side === 1 ? state.cols - 1 : rand(state.cols)
  s.y = side === 2 ? 0 : side === 3 ? state.rows - 1 : rand(state.rows)
  s.active = true
  s.resting = false
  popup(s, 'snipper!', 'lavender')
}

function moveSnipper() {
  const s = state.snipper
  const head = state.snake[0]!
  let target: Vec
  if (s.resting || state.snake.length < 4) {
    target = { x: s.x + Math.sign(s.x - head.x || 1) * 5, y: s.y + Math.sign(s.y - head.y || 1) * 5 }
  } else {
    target = state.snake[Math.floor(state.snake.length / 2)]!
  }
  const dx = target.x - s.x
  const dy = target.y - s.y
  const options: Vec[] = []
  if (dx) options.push({ x: Math.sign(dx), y: 0 })
  if (dy) options.push({ x: 0, y: Math.sign(dy) })
  if (Math.abs(dy) > Math.abs(dx)) options.reverse()
  if (random() < 0.2) options.reverse()
  const step = options.find((d) => {
    const nx = s.x + d.x
    const ny = s.y + d.y
    return nx >= 0 && ny >= 0 && nx < state.cols && ny < state.rows
  })
  if (!step) return
  s.x += step.x
  s.y += step.y
  s.facing = step

  if (same(s, head)) return eatSnipper()
  const index = state.snake.findIndex((cell) => same(cell, s))
  if (index > 0) {
    cut(index)
    sound.snip()
    s.resting = true
    s.until = state.step + SNIPPER_REST_STEPS
  }
}

function eatSnipper() {
  const s = state.snipper
  s.active = false
  s.until = state.step + Math.round(SNIPPER_RESPAWN_STEPS / Math.max(0.25, snipperFor(state.level)))
  state.grow += 3
  state.stats.snippers++
  sound.bonus()
  popup(s, '+3 × crunch', 'sun')
}

/* ─── Eating ─────────────────────────────────────────────────────────── */

function eat(item: Item) {
  state.items = state.items.filter((i) => i.id !== item.id)
  if (item.kind === 'heart') {
    state.hearts = Math.min(MAX_HEARTS, state.hearts + 1)
    sound.bonus()
    popup(item, '+1 life', 'coral')
    mark('heal')
    return
  }
  if (item.kind === 'totem') {
    state.totem = true
    sound.level()
    popup(item, 'totem!', 'sun')
    notice('totem', TOTEM.name, TOTEM.blurb)
    mark('power')
    return
  }
  if (isCustom(item.kind)) return eatCustom(item, item.kind)
  if (isPower(item.kind)) {
    const power = POWERS[item.kind]
    if (state.held.length < MAX_HELD) {
      state.held.push(item.kind)
      mark('power')
      sound.pill()
      popup(item, power.name, power.tone)
      notice(item.kind, `${power.name} stored`, `${power.blurb}. Space to use.`)
    } else {
      activate(item.kind, item)
    }
    return
  }
  const grow = live().items[item.kind]?.grow ?? FRUIT_GROW[item.kind]
  state.grow += grow
  state.stats.eaten++
  sound.eat(item.kind === 'apple' ? 0 : item.kind === 'cherry' ? 1 : 2)
  feel('eat', grow)
  popup(item, `+${grow} ×`, item.kind === 'star' ? 'sun' : 'mint')
  if (item.kind === 'apple') addItem('apple', null)
}

/** A home-made item: a fruit grows, scores and heals; a power-up is held or goes off at once. */
function eatCustom(item: Item, kind: CustomId) {
  const c = customItem(kind)
  if (!c) return
  if (c.kind === 'power') {
    if (c.hold && state.held.length < MAX_HELD) {
      state.held.push(kind)
      mark('power')
      sound.pill()
      popup(item, c.name, 'mint')
      notice(kind, `${c.name} stored`, `${c.blurb}. Space to use.`)
    } else {
      activate(kind, item)
    }
    return
  }
  state.grow += c.grow
  state.score += c.points
  state.stats.eaten++
  if (c.hearts) {
    state.hearts = Math.min(MAX_HEARTS, state.hearts + c.hearts)
    mark('heal')
  }
  sound.eat(c.grow >= 5 ? 2 : c.grow >= 2 ? 1 : 0)
  feel('eat', c.grow)
  const bits = [c.grow ? `+${c.grow} ×` : '', c.points ? `+${c.points}` : '', c.hearts ? `+${c.hearts} ♥` : ''].filter(Boolean)
  popup(item, bits.join(' ') || c.name, 'sun')
}

/** Start an effect for `bars`, or, if it is already running, stretch it, start it over, or leave it. */
function applyEffect(effect: keyof typeof state.effects, bars: number, stack: Stack) {
  const until = state.effects[effect]
  const running = until > state.step
  if (stack === 'extend') state.effects[effect] = Math.max(until, state.step) + bars * 16
  else if (stack === 'refresh') state.effects[effect] = Math.max(until, state.step + bars * 16)
  else if (!running) state.effects[effect] = state.step + bars * 16
  effectSpan[effect] = Math.max(state.effects[effect] - state.step, 1)
}
/** How long each running effect was set to last, for the HUD's bars. */
const effectSpan: Record<keyof typeof state.effects, number> = { shield: 1, double: 1, slow: 1, magnet: 1, ghost: 1 }

/** Start a power-up, or stretch its effect if it is already running. */
function activate(kind: Holdable, at: Vec) {
  if (isCustom(kind)) {
    const c = customItem(kind)
    if (!c) return
    for (const effect of c.effects) {
      if (effect === 'dash') dash()
      else applyEffect(effect, c.bars, c.stack)
    }
    sound.pill()
    popup(at, c.name, 'mint')
    notice(kind, c.name, c.blurb)
    mark('use')
    return
  }
  const power = POWERS[kind]
  const tweak = live().items[kind] ?? {}
  if (kind === 'dash') dash()
  else applyEffect(kind, tweak.bars ?? power.bars, tweak.stack ?? 'extend')
  sound.pill()
  popup(at, power.name, power.tone)
  notice(kind, power.name, power.blurb)
  mark('use')
}

/** Use the oldest held power-up. */
export function useItem() {
  if (state.status !== 'running' || replay.active) return
  const kind = state.held.shift()
  if (!kind) return
  recording.events.push([stepsDone, 'i'])
  activate(kind, state.snake[0]!)
}

/* ─── The beat ───────────────────────────────────────────────────────── */

/**
 * Arrive at a new level: tempo, walls, hearts, and for a new kind of laser
 * (or a level that asks), an intro. True when an intro started: that bar
 * then drops nothing.
 */
function enterLevel(level: number): boolean {
  const e = editOf(live(), level)
  applyLevel(level)
  setWalls(level)
  if (snipperFor(level) === 0) state.snipper.active = false
  sound.level()
  feel('level')
  mark('level')
  const tierIndex = LASER_TIERS.findIndex((t) => t.level === level && level > 0)
  if (introFor(level)) {
    startIntro(tierIndex > 0 ? tierIndex : tierOf(level))
    return true
  }
  if (tierIndex > 0) conductor.setStyle(tierIndex, 'play', state.step)
  if (e.calm !== undefined) state.calmUntil = state.step + e.calm * 16
  const heal = Math.min(healFor(level), MAX_HEARTS - state.hearts)
  if (heal > 0) {
    state.hearts += heal
    popup(state.snake[0]!, `+${heal} ${heal === 1 ? 'life' : 'lives'}`, 'coral')
    mark('heal')
  }
  const tier = LASER_TIERS.find((t) => t.level === level && level > 0)
  const sub = e.name ?? (tier ? `${tier.name}: ${tier.blurb}` : `${state.bpm} bpm · more lasers`)
  banner(`Level ${level + 1}`, heal > 0 ? `${sub} · +${heal} heart${heal === 1 ? '' : 's'}` : sub)
  return false
}

function onBar(bar: number) {
  if (state.intro) return
  const level = state.levelOffset + levelAtBar(bar - state.pausedBars)
  if (level !== state.level && enterLevel(level)) return

  // Bonus fruit and pills, at most two extras at a time.
  const extras = state.items.filter((i) => i.kind !== 'apple').length
  const stockItems = itemsStock(live())
  if (extras < 2 && bar > 0) {
    const roll = random()
    if (!stockItems) dropWeighted(roll, level)
    else if (roll < 0.3) addItem('cherry', 48)
    else if (roll < 0.4 && level >= 1) addItem('star', 32)
    else if (roll < 0.62 && level >= 1) addItem(pick(POWER_KINDS), 48)
  }
  const totemOut = state.items.some((i) => i.kind === 'totem')
  if (level >= 1 && !state.totem && !totemOut && random() < TOTEM_CHANCE * rateOf('totem', level)) addItem('totem', lifeOf('totem', 32))
  const heartOut = state.items.some((i) => i.kind === 'heart')
  if (bar > 0 && !heartOut && state.hearts < MAX_HEARTS && random() < HEART_CHANCE * rateOf('heart', level))
    addItem('heart', lifeOf('heart', 40))
}

/** × on an item's chance at a level: the global tweak times the level's own. */
const rateOf = (kind: string, level: number) => (live().items[kind]?.rate ?? 1) * (editOf(live(), level).items?.[kind] ?? 1)
/** Steps an item stays on the board. */
const lifeOf = (kind: string, steps: number) => {
  const bars = live().items[kind]?.life
  return bars === undefined ? steps : bars * 16
}

/**
 * With items changed, each bonus item has a weight: its stock share of the
 * old rolls (cherry 0.3, star 0.1, the six pills 0.22 between them), or a
 * home-made item's own rate, times the global and level ×. One roll picks
 * at most one, so the weights add up to the chance anything drops.
 */
function dropWeighted(roll: number, level: number) {
  const options: [kind: ItemKind, weight: number, steps: number][] = [['cherry', 0.3 * rateOf('cherry', level), lifeOf('cherry', 48)]]
  if (level >= 1) {
    options.push(['star', 0.1 * rateOf('star', level), lifeOf('star', 32)])
    for (const kind of POWER_KINDS) options.push([kind, (0.22 / POWER_KINDS.length) * rateOf(kind, level), lifeOf(kind, 48)])
  }
  for (const c of live().custom) if (level >= c.from) options.push([c.id as CustomId, c.rate * rateOf(c.id, level), c.life * 16])
  const total = options.reduce((sum, [, w]) => sum + w, 0)
  const chance = Math.min(0.95, total)
  if (roll >= chance || total <= 0) return
  let at = (roll / chance) * total
  for (const [kind, weight, steps] of options) {
    at -= weight
    if (at < 0) return addItem(kind, steps)
  }
}

/**
 * Points scored per beat. Each cell is worth more the longer the snake is
 * (length × (1 + length / 20)), and every level adds another quarter on top,
 * so growing pays off most late in the game. The yellow pill doubles it.
 */
export const multiplier = () => {
  const length = state.snake.length
  const perLength = length * (1 + length / 20)
  const perLevel = 1 + state.level * 0.25
  const own = editOf(live(), state.level).score ?? 1
  return Math.round(perLength * perLevel * own) * (isActive('double') ? 2 : 1)
}

/* ─── Tier intros ────────────────────────────────────────────────────── */

/** Which laser tier (and so which music) a level belongs to. */
export const tierOf = (level: number) => LASER_TIERS.reduce((at, t, i) => (t.level <= level ? i : at), 0)

/** Two bars of pause to meet a new laser, then four calmer bars. */
const INTRO_STEPS = 32
const CALM_STEPS = 64

/** Freeze play and introduce a new kind of laser. Everything timed in steps waits it out. */
function startIntro(tier: number) {
  const until = state.step + INTRO_STEPS
  const heal = Math.min(healFor(state.level), MAX_HEARTS - state.hearts)
  const healed = heal > 0
  state.intro = { tier, until, healed }
  state.pausedBars += INTRO_STEPS / 16
  state.lasers = state.lasers.filter((l) => l.struck)
  for (const key of Object.keys(state.effects) as (keyof typeof state.effects)[]) {
    if (state.effects[key] > state.step) state.effects[key] += INTRO_STEPS
  }
  for (const item of state.items) if (item.until !== null) item.until += INTRO_STEPS
  state.snipper.until += INTRO_STEPS
  state.hearts += heal
  conductor.setStyle(tier, 'intro', state.step)
  mark('level')
}

function endIntro(step: number) {
  const tier = state.intro!.tier
  state.intro = null
  state.calmUntil = step + (editOf(live(), state.level).calm ?? CALM_STEPS / 16) * 16
  conductor.setStyle(tier, 'build', step)
}

function onBeat(step: number) {
  if (state.intro) return
  state.beat++
  state.score += multiplier()
  const bar = Math.floor(step / 16)
  if (bar < 1 || cheats.noLasers) return // one bar of intro

  trackLasers()

  // More lasers per bar, and more armed at once, as the intensity climbs.
  const i = intensity(state.level)
  const perBar = lasersFor(state.level)
  const armedCap = armedFor(state.level)
  const armed = state.lasers.filter((l) => !l.struck).length
  if (armed >= armedCap) return
  // Just after an intro, the new lasers come gently.
  const chance = (perBar / 4) * (step < state.calmUntil ? 0.35 : 1)
  let count = Math.floor(chance) + (random() < chance % 1 ? 1 : 0)
  while (count-- > 0) {
    const placed = spawnLaser()
    // Past the first few levels a laser sometimes brings a crossing partner.
    if (placed && i >= 3 && random() < 0.25) {
      const head = state.snake[0]!
      spawnLaser(placed.axis === 'row' ? { axis: 'col', index: head.x } : { axis: 'row', index: head.y })
    }
  }
}

function tick() {
  while (state.queue.length) {
    const wanted = state.queue.shift()!
    if (wanted.x !== -state.direction.x || wanted.y !== -state.direction.y) {
      state.direction = wanted
      break
    }
  }

  const head = state.snake[0]!
  const next = { x: head.x + state.direction.x, y: head.y + state.direction.y }
  if (next.x < 0 || next.y < 0 || next.x >= state.cols || next.y >= state.rows) {
    // Normal mode wraps to the other side; hardcore walls kill.
    if (edgesFor(state.level) === 'kill' && !cheats.god) return die('hit the wall')
    next.x = (next.x + state.cols) % state.cols
    next.y = (next.y + state.rows) % state.rows
  }
  if (isWall(next) && !isActive('ghost') && !cheats.god) return die('hit a wall')
  // The tail moves out of the way this tick, unless the snake is growing.
  const body = state.grow > 0 ? state.snake : state.snake.slice(0, -1)
  if (!isActive('ghost') && !cheats.god && body.some((cell) => same(cell, next))) return die('bit itself')

  state.snake.unshift(next)
  if (state.grow > 0) state.grow--
  else state.snake.pop()

  arrive(next)
}

/** The head has moved onto `cell`: eat what is there. */
function arrive(cell: Vec) {
  const item = state.items.find((i) => same(i, cell))
  if (item) eat(item)
  state.longest = Math.max(state.longest, state.snake.length)

  const s = state.snipper
  if (s.active && same(s, cell)) eatSnipper()
}

/** Lunge ahead, passing over the body; through the wall in normal mode, stopping short of it in hardcore. */
function dash() {
  for (let i = 0; i < DASH_CELLS; i++) {
    const head = state.snake[0]!
    const next = { x: head.x + state.direction.x, y: head.y + state.direction.y }
    if (next.x < 0 || next.y < 0 || next.x >= state.cols || next.y >= state.rows) {
      if (edgesFor(state.level) === 'kill') break
      next.x = (next.x + state.cols) % state.cols
      next.y = (next.y + state.rows) % state.rows
    }
    if (isWall(next)) break
    state.snake.unshift(next)
    if (state.grow > 0) state.grow--
    else state.snake.pop()
    arrive(next)
  }
  // A beat of ghost, so landing on the body is not a bite.
  state.effects.ghost = Math.max(state.effects.ghost, state.step + 4)
}

/** Fruit within reach slides one cell toward the head. */
function pullFruit() {
  const head = state.snake[0]!
  for (const item of state.items) {
    if (!(item.kind in FRUIT_GROW)) continue
    const dx = head.x - item.x
    const dy = head.y - item.y
    if (Math.abs(dx) + Math.abs(dy) > 10) continue
    const step = Math.abs(dx) >= Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) }
    const to = { x: item.x + step.x, y: item.y + step.y }
    if (same(to, head)) {
      eat(item)
      continue
    }
    const blocked = isWall(to) || state.snake.some((c) => same(c, to)) || state.items.some((i) => i !== item && same(i, to))
    if (!blocked) Object.assign(item, to)
  }
}

function onStep(step: number) {
  state.step = step
  stepsDone = step + 1
  if (state.intro && step >= state.intro.until) endIntro(step)
  // Intro pause: time passes, play does not.
  if (state.intro) return
  if (step % 16 === 0) onBar(step / 16)
  if (step % 4 === 0) onBeat(step)

  // Slow-mo: the snake moves on 8ths instead of 16ths.
  if (!isActive('slow') || step % 2 === 0) tick()
  if (state.status !== 'running' || replay.ended) return
  if (isActive('magnet') && step % 2 === 0) pullFruit()

  for (const laser of state.lasers) if (!laser.struck && laser.strikeStep <= step) strike(laser)

  const s = state.snipper
  if (s.active && step % 2 === 0) moveSnipper()
  if (!s.active && snipperFor(state.level) > 0 && (state.level >= 1 || state.snake.length >= 8) && state.step >= s.until) spawnSnipper()
  if (s.active && s.resting && state.step >= s.until) s.resting = false

  state.items = state.items.filter((i) => i.until === null || i.until > step)
}

// Zaps are booked into the track ahead of time, so they land on the beat.
conductor.onSchedule(({ step, time }) => {
  if (state.lasers.some((l) => !l.struck && l.strikeStep === step)) sound.zapAt(time)
})

/* ─── Loop and controls ──────────────────────────────────────────────── */

function frame() {
  if (state.status === 'running' || replay.active) {
    const t = now()
    while (!replay.active && queue.length && queue[0]!.time <= t && state.status === 'running') onStep(queue.shift()!.step)
    const ms = clock()
    for (let i = timers.length - 1; i >= 0; i--) {
      if (ms >= timers[i]!.at) timers.splice(i, 1)[0]!.run()
    }
  }
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

function applyLevel(level: number) {
  state.level = level
  state.bpm = tempoFor(level)
  conductor.setLevel(level, state.bpm)
  musicForLevel(editOf(live(), level).music, state.step)
}

/* ─── Cheats ─────────────────────────────────────────────────────────── */

export const MAX_LEVEL = 100

/** Jump to a level (0-based) now; later levels follow on from it. */
export function cheatLevel(level: number) {
  state.cheated = true
  state.usedCheats = true
  state.levelOffset = level - levelAtBar(Math.floor(state.step / 16) - state.pausedBars)
  applyLevel(level)
  setWalls(level)
  conductor.setStyle(tierOf(level), 'play', state.step)
}

export function cheatToggle(name: keyof typeof cheats) {
  cheats[name] = !cheats[name]
  if (cheats[name]) state.cheated = state.usedCheats = true
  if (name === 'noLasers' && cheats.noLasers) state.lasers = state.lasers.filter((l) => l.struck)
}

/** Forget the best score on this device, to test new-best runs again. */
export function resetBest() {
  state.best = 0
  saveBest(0)
}

export function cheatGive(kind: Holdable | 'totem' | 'heart' | 'grow') {
  state.cheated = true
  state.usedCheats = true
  if (kind === 'totem') state.totem = true
  else if (kind === 'heart') state.hearts = MAX_HEARTS
  else if (kind === 'grow') state.grow += 10
  else if (state.held.length < MAX_HELD) state.held.push(kind)
  else state.held = [...state.held.slice(1), kind]
}

/** Pick normal or hardcore for the next game. */
export function setMode(mode: Mode) {
  if (state.status === 'running' || replay.active) return
  state.mode = mode
  recording.mode = mode
}

export function play() {
  if (state.status === 'running' || replay.active) return
  if (state.status === 'over') reset()
  if (state.status === 'paused') conductor.resume()
  else {
    conductor.start()
    // A fresh game fades in: the band joins over the first bars.
    conductor.setStyle(tierOf(state.level), 'build', 0)
  }
  state.status = 'running'
}

export function pause() {
  if (state.status !== 'running' || replay.active) return
  state.status = 'paused'
  conductor.pause()
}

export function toggle() {
  if (state.status === 'running') pause()
  else play()
}

export function turn(name: DirName) {
  if (state.status === 'over' || replay.active) return
  if (!queueTurn(name)) return
  recording.events.push([stepsDone, DIR_CODE[name]])
  sound.turn()
  if (state.status === 'ready' || state.status === 'paused') play()
}

function queueTurn(name: DirName): boolean {
  const wanted = DIRS[name]
  const lastQueued = state.queue[state.queue.length - 1] ?? state.direction
  if (same(wanted, lastQueued) || state.queue.length >= 3) return false
  state.queue.push({ ...wanted })
  return true
}

/* ─── Replays ────────────────────────────────────────────────────────── */

/** Set up a recorded run at its first step. Cheats are put aside until it ends. */
export function startReplay(run: Replay) {
  if (!replay.active) savedCheats = { ...cheats }
  // reset() stops the track; a sounding replay restarts it after.
  cheats.god = false
  cheats.noLasers = false
  replay.active = true
  replay.ended = false
  replay.total = run.steps
  replayEvents = run.events
  replayCursor = 0
  playWith(run.design ?? null)
  reset(run)
  replay.at = 0
  // 'running' so the board and HUD show as in play; the conductor stays off.
  state.status = 'running'
}

/** Play forward to `target` steps, feeding in the recorded inputs on time. */
export function replayTo(target: number) {
  while (replay.at < target && !replay.ended) {
    while (replayCursor < replayEvents.length && replayEvents[replayCursor]![0] <= replay.at) {
      const code = replayEvents[replayCursor++]![1]
      if (code === 'i') {
        const kind = state.held.shift()
        if (kind) activate(kind, state.snake[0]!)
      } else {
        queueTurn(CODE_DIR[code])
      }
    }
    onStep(replay.at)
    replay.at++
  }
}

/** Jump anywhere: back means playing again from the start, quickly. Leftover effects are cleared. */
export function replaySeek(target: number, run: Replay) {
  const sound = replay.sound
  replay.sound = false
  if (target < replay.at) startReplay(run)
  replayTo(target)
  replay.sound = sound
  timers.length = 0
  state.popups = []
  state.debris = []
  state.banner = null
  state.notice = null
  state.lasers = state.lasers.filter((l) => !l.struck)
}

/** How long `steps` of a run last in seconds, with the tempo rising level by level. */
export function runSeconds(steps: number) {
  let seconds = 0
  for (let bar = 0, left = steps; left > 0; bar++, left -= 16) {
    seconds += (Math.min(left, 16) * 60) / (tempoFor(levelAtBar(bar)) * 4)
  }
  return seconds
}

/** Leave the replay and set up a fresh live game. */
export function stopReplay() {
  if (!replay.active) return
  replay.active = false
  replay.ended = false
  replay.sound = false
  conductor.setRate(1)
  Object.assign(cheats, savedCheats)
  playWith(null)
  reset()
}

/** Share of an effect still left, 0 to 1, for the HUD. */
export function effectLeft(effect: keyof typeof state.effects): number {
  const total = Math.max(effectSpan[effect], POWERS[effect].bars * 16)
  return Math.max(0, Math.min(1, (state.effects[effect] - state.step) / total))
}

/**
 * Changing the design mid-run plays on with it: the run counts as cheated,
 * and its replay keeps the latest design. Before the first move, the game
 * starts over instead, so the board shows the change (a level's walls).
 */
watch(
  design,
  (d) => {
    if (replay.active || live() !== design) return
    if (state.status === 'ready') return reset()
    if (!isStock(d)) state.cheated = true
    recording.design = isStock(d) ? undefined : snapshot(d)
    setWalls(state.level)
  },
  { deep: true },
)

reset()
