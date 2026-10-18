/**
 * The game's design, editable from the cheat menu: one game, every level of
 * it open to change.
 *
 * - Global: the whole climb at once. How hard everything plays, how gently
 *   the first ten levels ramp, how the middle climbs, how hard the end
 *   bites, tempo, lasers, warning, level length, and a × for every level.
 * - Levels: one entry per level, 1 to 100 and any added after. An entry only
 *   holds what was changed (walls, pacing, feel, items, music); everything
 *   left alone follows the global curve, so an untouched level plays as stock.
 * - Items: tweaks to the stock fruit and power-ups (spawn rate, how long they
 *   last, how a second one stacks), and home-made items.
 *
 * It lives on this device and travels as a share code or through Explore. A
 * run with anything changed counts as cheated on the main boards, and its
 * replay carries the design so it plays back the same.
 */
import { reactive, watch } from 'vue'
import type { LaserTrait, PowerKind } from './game'

export const STOCK_LEVELS = 100
/** Room for added levels past the stock hundred. */
export const MAX_LEVELS = 150

/* ─── Global ─────────────────────────────────────────────────────────── */

export interface Global {
  /** Everything at once: × on how hard each level plays. */
  overall: number
  /** Levels 1–10: intensity added each level. */
  start: number
  /** From level 11: steady intensity added each level. */
  climb: number
  /** From level 11: the squared term, how hard the end bites. */
  end: number
  /** Tempo at level 1, and the most it climbs to. */
  tempoStart: number
  tempoMax: number
  /** × on the warning before a laser strikes. */
  warn: number
  /** × on how many lasers come. */
  lasers: number
  /** Bars each level lasts. */
  barsPerLevel: number
}

export const STOCK_GLOBAL: Global = {
  overall: 1,
  start: 0.65,
  climb: 0.4,
  end: 0.012,
  tempoStart: 108,
  tempoMax: 172,
  warn: 1,
  lasers: 1,
  barsPerLevel: 8,
}

type Range = [min: number, max: number, step: number]
export const GLOBAL_RANGE: Record<keyof Global, Range> = {
  overall: [0.25, 3, 0.05],
  start: [0.1, 1.5, 0.05],
  climb: [0, 1.2, 0.05],
  end: [0, 0.04, 0.001],
  tempoStart: [70, 160, 1],
  tempoMax: [100, 220, 1],
  warn: [0.5, 2, 0.05],
  lasers: [0, 3, 0.05],
  barsPerLevel: [2, 32, 1],
}

/* ─── Levels ─────────────────────────────────────────────────────────── */

export type Edges = 'wrap' | 'kill'

/** What one level changes. Anything missing follows the global curve. */
export interface LevelEdit {
  name?: string
  /** Wall cells as a bitmap over the board, base64. */
  walls?: string
  // Pacing
  /** × on this level's intensity. */
  difficulty?: number
  bpm?: number
  /** Lasers per bar, on average. */
  lasers?: number
  /** Most lasers armed at once. */
  armed?: number
  /** Warning before a strike, in 16th notes. */
  warn?: number
  /** Bars before the next level. */
  bars?: number
  /** Laser tricks that can turn up; plain red ones always can. */
  traits?: LaserTrait[]
  // Feel
  /** Walls of the board: wrap round, or kill. */
  edges?: Edges
  /** The snipper: 0 never comes, 1 as usual, 2 back twice as fast. */
  snipper?: number
  /** Hearts given back on reaching this level. */
  heal?: number
  /** Stop for two bars to introduce this level. */
  intro?: boolean
  /** Bars of fewer lasers after the level starts. */
  calm?: number
  /** × on points scored. */
  score?: number
  // Items
  /** × on each item's chance to turn up here, by item id. */
  items?: Record<string, number>
  // Music
  /** Strudel code; missing plays the stock arrangement. */
  music?: string
}

export const LEVEL_RANGE = {
  difficulty: [0, 2, 0.05],
  bpm: [60, 220, 1],
  lasers: [0, 12, 0.25],
  armed: [0, 16, 1],
  warn: [4, 24, 1],
  bars: [1, 32, 1],
  snipper: [0, 2, 0.25],
  heal: [0, 5, 1],
  calm: [0, 16, 1],
  score: [0, 5, 0.1],
  itemRate: [0, 4, 0.1],
} as const satisfies Record<string, Range>

export const TRAITS: LaserTrait[] = ['wide', 'cross', 'fast', 'track', 'repeat']

/* ─── Items ──────────────────────────────────────────────────────────── */

/** How a second one acts while the first is still running. */
export type Stack = 'extend' | 'refresh' | 'keep'

/** Changes to a stock item. */
export interface ItemTweak {
  /** × on how often it turns up. */
  rate?: number
  /** Bars the effect lasts (power-ups). */
  bars?: number
  /** Bars it stays on the board before it fades. */
  life?: number
  stack?: Stack
  /** Cells it grows the snake (fruit). */
  grow?: number
}

export type Effect = PowerKind
export type Shape = 'fruit' | 'gem' | 'pill' | 'orb' | 'bolt' | 'star'
export const SHAPES: Shape[] = ['fruit', 'gem', 'pill', 'orb', 'bolt', 'star']
export const COLORS = ['#FF3355', '#FF9966', '#FFE14D', '#5CFF5C', '#00F0C8', '#3FA9FF', '#B26BFF', '#FF5FB0', '#E8E8FF'] as const

/** A home-made item: a fruit to eat, or a power-up to hold and use. */
export interface CustomItem {
  /** `c` and a number; ids are never reused. */
  id: string
  name: string
  blurb: string
  kind: 'fruit' | 'power'
  shape: Shape
  color: string
  /** Base chance per bar that it turns up (0 to 0.5). */
  rate: number
  /** First level (0-based) it can turn up on. */
  from: number
  /** Bars it stays on the board. */
  life: number
  // Fruit
  grow: number
  points: number
  hearts: number
  // Power-up
  effects: Effect[]
  bars: number
  stack: Stack
  /** Held for later (like stock power-ups), or used the moment it is eaten. */
  hold: boolean
}

export const ITEM_RANGE = {
  rate: [0, 4, 0.1],
  customRate: [0, 0.5, 0.01],
  bars: [1, 32, 1],
  life: [1, 16, 1],
  grow: [0, 20, 1],
  points: [0, 5000, 50],
  hearts: [0, 5, 1],
  from: [0, MAX_LEVELS - 1, 1],
} as const satisfies Record<string, Range>

export function newItem(id: string, kind: CustomItem['kind']): CustomItem {
  return {
    id,
    name: kind === 'fruit' ? 'New fruit' : 'New power',
    blurb: kind === 'fruit' ? 'Grows you' : 'Does something good',
    kind,
    shape: kind === 'fruit' ? 'fruit' : 'gem',
    color: kind === 'fruit' ? '#FF9966' : '#00F0C8',
    rate: 0.05,
    from: 0,
    life: 3,
    grow: 2,
    points: 0,
    hearts: 0,
    effects: kind === 'power' ? ['shield'] : [],
    bars: 4,
    stack: 'extend',
    hold: true,
  }
}

/* ─── The whole design ───────────────────────────────────────────────── */

export interface Design {
  global: Global
  /** By level, 0-based; empty objects for untouched levels. */
  levels: LevelEdit[]
  /** Tweaks to stock items, by item kind. */
  items: Record<string, ItemTweak>
  custom: CustomItem[]
  /** The next home-made item's number. */
  nextItem: number
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

export const stockDesign = (): Design => ({
  global: clone(STOCK_GLOBAL),
  levels: Array.from({ length: STOCK_LEVELS }, () => ({})),
  items: {},
  custom: [],
  nextItem: 1,
})

const isEmpty = (o: object) => Object.keys(o).length === 0

/** Nothing changed from the stock game. */
export function isStock(d: Design): boolean {
  return (
    JSON.stringify(d.global) === JSON.stringify(STOCK_GLOBAL) &&
    d.levels.every(isEmpty) &&
    Object.values(d.items).every(isEmpty) &&
    d.custom.length === 0
  )
}
/** Items are stock: then the stock spawning runs, number for number. */
export const itemsStock = (d: Design) =>
  Object.values(d.items).every(isEmpty) && d.custom.length === 0 && d.levels.every((l) => !l.items || isEmpty(l.items))

/** The level's edit, or an empty one past the end. */
export const editOf = (d: Design, level: number): LevelEdit => d.levels[level] ?? {}

/* ─── Walls ──────────────────────────────────────────────────────────── */

/** Where a new snake lies, and the cells just ahead of it: kept clear of walls. */
export function startCells(cols: number, rows: number): number[] {
  const cx = Math.floor(cols / 2) - 3
  const cy = Math.floor(rows / 2)
  const out: number[] = []
  for (let x = cx - 2; x <= cx + 4; x++) out.push(cy * cols + x)
  return out
}

export function packWalls(cells: Iterable<number>, cols: number, rows: number): string {
  const bytes = new Uint8Array(Math.ceil((cols * rows) / 8))
  for (const i of cells) if (i >= 0 && i < cols * rows) bytes[i >> 3]! |= 1 << (i & 7)
  if (bytes.every((b) => b === 0)) return ''
  let text = ''
  for (const b of bytes) text += String.fromCharCode(b)
  return btoa(text)
}

export function unpackWalls(walls: string | undefined, cells: number): number[] {
  if (!walls) return []
  let text = ''
  try {
    text = atob(walls)
  } catch {
    return []
  }
  const out: number[] = []
  for (let i = 0; i < cells; i++) if ((text.charCodeAt(i >> 3) >> (i & 7)) & 1) out.push(i)
  return out
}

/* ─── Checking what comes in ─────────────────────────────────────────── */

const num = (v: unknown, [min, max]: readonly [number, number, ...unknown[]]) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined
const POWER_EFFECTS: Effect[] = ['shield', 'double', 'slow', 'dash', 'magnet', 'ghost']
const STACKS: Stack[] = ['extend', 'refresh', 'keep']
const ITEM_KINDS = ['apple', 'cherry', 'star', 'heart', 'totem', ...POWER_EFFECTS]
const MUSIC_MAX = 6000

function cleanLevel(raw: unknown): LevelEdit {
  const l = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const r = LEVEL_RANGE
  const out: LevelEdit = {}
  if (typeof l.name === 'string' && l.name.trim()) out.name = l.name.slice(0, 24)
  if (typeof l.walls === 'string' && l.walls && l.walls.length < 4000) out.walls = l.walls
  for (const key of ['difficulty', 'bpm', 'lasers', 'armed', 'warn', 'bars', 'snipper', 'heal', 'calm', 'score'] as const) {
    const v = num(l[key], r[key])
    if (v !== undefined) out[key] = v
  }
  if (Array.isArray(l.traits)) out.traits = TRAITS.filter((t) => (l.traits as unknown[]).includes(t))
  if (l.edges === 'wrap' || l.edges === 'kill') out.edges = l.edges
  if (typeof l.intro === 'boolean') out.intro = l.intro
  if (l.items && typeof l.items === 'object') {
    const items: Record<string, number> = {}
    for (const [id, v] of Object.entries(l.items)) {
      const n = num(v, r.itemRate)
      if (n !== undefined && /^[a-z0-9]{1,12}$/.test(id)) items[id] = n
    }
    if (!isEmpty(items)) out.items = items
  }
  if (typeof l.music === 'string' && l.music.trim()) out.music = l.music.slice(0, MUSIC_MAX)
  return out
}

function cleanTweak(raw: unknown): ItemTweak {
  const t = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out: ItemTweak = {}
  const r = ITEM_RANGE
  const rate = num(t.rate, r.rate)
  if (rate !== undefined) out.rate = rate
  const bars = num(t.bars, r.bars)
  if (bars !== undefined) out.bars = bars
  const life = num(t.life, r.life)
  if (life !== undefined) out.life = life
  const grow = num(t.grow, r.grow)
  if (grow !== undefined) out.grow = grow
  if (STACKS.includes(t.stack as Stack)) out.stack = t.stack as Stack
  return out
}

function cleanItem(raw: unknown): CustomItem | null {
  const c = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  if (typeof c.id !== 'string' || !/^c\d{1,4}$/.test(c.id)) return null
  const kind = c.kind === 'power' ? 'power' : 'fruit'
  const base = newItem(c.id, kind)
  const r = ITEM_RANGE
  return {
    ...base,
    name: typeof c.name === 'string' && c.name.trim() ? c.name.slice(0, 18) : base.name,
    blurb: typeof c.blurb === 'string' ? c.blurb.slice(0, 60) : base.blurb,
    shape: SHAPES.includes(c.shape as Shape) ? (c.shape as Shape) : base.shape,
    color: typeof c.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(c.color) ? c.color : base.color,
    rate: num(c.rate, r.customRate) ?? base.rate,
    from: num(c.from, r.from) ?? base.from,
    life: num(c.life, r.life) ?? base.life,
    grow: num(c.grow, r.grow) ?? base.grow,
    points: num(c.points, r.points) ?? base.points,
    hearts: num(c.hearts, r.hearts) ?? base.hearts,
    effects: Array.isArray(c.effects) ? POWER_EFFECTS.filter((e) => (c.effects as unknown[]).includes(e)) : base.effects,
    bars: num(c.bars, r.bars) ?? base.bars,
    stack: STACKS.includes(c.stack as Stack) ? (c.stack as Stack) : base.stack,
    hold: typeof c.hold === 'boolean' ? c.hold : base.hold,
  }
}

export function cleanDesign(raw: unknown): Design {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out = stockDesign()
  const g = (d.global && typeof d.global === 'object' ? d.global : {}) as Record<string, unknown>
  for (const key of Object.keys(GLOBAL_RANGE) as (keyof Global)[]) out.global[key] = num(g[key], GLOBAL_RANGE[key]) ?? STOCK_GLOBAL[key]
  if (Array.isArray(d.levels)) {
    const levels = d.levels.slice(0, MAX_LEVELS).map(cleanLevel)
    while (levels.length < STOCK_LEVELS) levels.push({})
    out.levels = levels
  }
  if (d.items && typeof d.items === 'object') {
    for (const [id, t] of Object.entries(d.items)) {
      if (!ITEM_KINDS.includes(id)) continue
      const tweak = cleanTweak(t)
      if (!isEmpty(tweak)) out.items[id] = tweak
    }
  }
  if (Array.isArray(d.custom)) out.custom = d.custom.slice(0, 24).map(cleanItem).filter((c): c is CustomItem => !!c)
  const highest = out.custom.reduce((n, c) => Math.max(n, Number(c.id.slice(1))), 0)
  out.nextItem = Math.max(highest + 1, num(d.nextItem, [1, 9999, 1]) ?? 1)
  return out
}

/** A design from the first version of the tuning tab: its tuning becomes the global knobs and level ×. */
function fromV1(raw: unknown): Design {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { tuning?: Record<string, unknown> & { levels?: unknown[] } }
  const t = r.tuning ?? {}
  const design = cleanDesign({ global: t })
  if (Array.isArray(t.levels))
    t.levels.forEach((v, i) => {
      if (typeof v === 'number' && v !== 1 && i < STOCK_LEVELS) design.levels[i]!.difficulty = num(v, LEVEL_RANGE.difficulty)
    })
  return design
}

/** Smaller to store and share: untouched levels at the end are left off. */
export function compact(d: Design): Design {
  const out = clone(d)
  let end = out.levels.length
  while (end > 0 && isEmpty(out.levels[end - 1]!)) end--
  out.levels = out.levels.slice(0, end)
  return out
}

/* ─── Share codes ────────────────────────────────────────────────────── */

const CODE_PREFIX = 'LW2-'
const OLD_PREFIX = 'LW1-'

const toBase64Url = (text: string) => {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const fromBase64Url = (code: string) => {
  const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'))
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

/** The design as one line of text, to copy and paste. Numbers are rounded to keep it short. */
export function shareCode(d: Design): string {
  return CODE_PREFIX + toBase64Url(JSON.stringify(compact(d), (_k, v: unknown) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)))
}

/** A design from a share code (this version or the first), or null if it is not one. */
export function readShareCode(code: string): Design | null {
  const body = code.trim()
  try {
    if (body.startsWith(CODE_PREFIX)) return cleanDesign(JSON.parse(fromBase64Url(body.slice(CODE_PREFIX.length))))
    if (body.startsWith(OLD_PREFIX)) return fromV1(JSON.parse(fromBase64Url(body.slice(OLD_PREFIX.length))))
  } catch {
    /* not a code */
  }
  return null
}

/* ─── This device's design, and the one in play ──────────────────────── */

const STORE_KEY = 'laserwyrm-design'
const OLD_STORE_KEY = 'laserwyrm-rules'

function load(): Design {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) return cleanDesign(JSON.parse(raw))
    const old = localStorage.getItem(OLD_STORE_KEY)
    if (old) return fromV1(JSON.parse(old))
  } catch {
    /* unreadable: start from stock */
  }
  return stockDesign()
}

/** The design edited in the cheat menu, kept on this device. */
export const design = reactive(load())
watch(
  design,
  (d) => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(compact(d)))
    } catch {
      /* storage blocked: the design still works for this visit */
    }
  },
  { deep: true },
)

export function replaceDesign(next: Design) {
  Object.assign(design, clone(next))
}

/**
 * Normal play is always the stock game. Custom play is this device's design,
 * or one shared on Explore; the choice is kept on the device.
 */
const CUSTOM_KEY = 'laserwyrm-custom'
const readCustom = () => {
  try {
    return localStorage.getItem(CUSTOM_KEY) === '1'
  } catch {
    return false
  }
}
export const custom = reactive({ on: readCustom() })
watch(
  () => custom.on,
  (on) => {
    try {
      localStorage.setItem(CUSTOM_KEY, on ? '1' : '0')
    } catch {
      /* storage blocked: the choice lasts this visit */
    }
  },
)

/** A design shared on Explore, chosen to play instead of this device's own. */
export const shared = reactive({ slug: null as string | null, name: '', author: '' })
let sharedDesign: Design | null = null
const STOCK = reactive(stockDesign())
const chosen = (): Design => (custom.on ? (sharedDesign ?? design) : STOCK)

/** What the game reads: the stock game, the custom one, or a replay's while it plays. */
let current: Design = chosen()
export const live = () => current
/** Play by another design for a while (a replay's), or null to go back to the chosen one. */
export function playWith(other: Design | null) {
  current = other ? reactive(cleanDesign(other)) : chosen()
}
/** Custom play on (this device's design) or off (the stock game). */
export function setCustom(on: boolean) {
  custom.on = on
  if (!on) {
    sharedDesign = null
    shared.slug = null
  }
  current = chosen()
}
/** Play a design from Explore; the editor keeps this device's own. */
export function playShared(info: { slug: string; name: string; author: string }, d: unknown) {
  sharedDesign = reactive(cleanDesign(d))
  Object.assign(shared, info)
  custom.on = true
  current = sharedDesign
}
/** Back to this device's own design, still in custom play. */
export function stopShared() {
  sharedDesign = null
  shared.slug = null
  current = chosen()
}
export const snapshot = (d: Design): Design => compact(d)
