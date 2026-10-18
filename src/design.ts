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
import { reactive, ref, watch } from 'vue'
import {
  cleanDesign,
  compact,
  fromV1,
  packWalls,
  startCells,
  stockDesign,
  type Design,
  type WallTemplate,
} from './designCore'

export * from './designCore'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

/* ─── This device's games, and the one in play ───────────────────────── */

/**
 * A game made on this device: a name and a design. Its share code, once
 * shared, is kept with the design it was made from, so sharing it again
 * unchanged gives the same code.
 */
export interface SavedGame {
  id: string
  name: string
  design: Design
  share?: { slug: string; of: string }
  /** When it last changed (ms), here or (synced) by an AI agent: the newest copy wins. */
  updatedAt?: number
}

const LIBRARY_KEY = 'laserwyrm-games'
const STORE_KEY = 'laserwyrm-design'
const OLD_STORE_KEY = 'laserwyrm-rules'
const newId = () => Math.random().toString(36).slice(2, 10)

function loadLibrary(): { games: SavedGame[]; active: string } {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY)
    if (raw) {
      const lib = JSON.parse(raw) as { games?: SavedGame[]; active?: string }
      const games = (lib.games ?? [])
        .filter((g) => g && typeof g.id === 'string')
        .slice(0, 50)
        .map((g) => ({ id: g.id, name: String(g.name ?? 'My game').slice(0, 40), design: cleanDesign(g.design), share: g.share, updatedAt: g.updatedAt }))
      if (games.length) return { games, active: games.some((g) => g.id === lib.active) ? lib.active! : games[0]!.id }
    }
    // From before there were several games: the one design becomes the first game.
    const one = localStorage.getItem(STORE_KEY)
    const old = localStorage.getItem(OLD_STORE_KEY)
    const first = one ? cleanDesign(JSON.parse(one)) : old ? fromV1(JSON.parse(old)) : stockDesign()
    const id = newId()
    return { games: [{ id, name: 'My game', design: first }], active: id }
  } catch {
    const id = newId()
    return { games: [{ id, name: 'My game', design: stockDesign() }], active: id }
  }
}

/** Every game made on this device; `active` is the one the editor and custom play use. */
export const library = reactive(loadLibrary())
const activeGame = () => library.games.find((g) => g.id === library.active)!

/** The active game's design, edited in the workshop. */
export const design = reactive(clone(activeGame().design))
watch(
  design,
  (d) => {
    const game = activeGame()
    game.design = compact(d)
    game.updatedAt = Date.now()
  },
  { deep: true },
)
watch(
  library,
  (lib) => {
    try {
      localStorage.setItem(LIBRARY_KEY, JSON.stringify({ games: lib.games.map((g) => ({ ...g, design: compact(g.design) })), active: lib.active }))
    } catch {
      /* storage blocked: the games still work for this visit */
    }
  },
  { deep: true },
)

export function replaceDesign(next: Design) {
  Object.assign(design, clone(next))
}

/** Edit and play another of this device's games. */
export function switchGame(id: string) {
  const game = library.games.find((g) => g.id === id)
  if (!game || id === library.active) return
  library.active = id
  replaceDesign(cleanDesign(game.design))
  clearHistory()
}

/* ─── Undo ───────────────────────────────────────────────────────────── */

/**
 * Every change to the design is kept for undo: changes in quick succession
 * (a drag across the board, a slider sliding) count as one step.
 */
const past: string[] = []
const future: string[] = []
let lastSnap = JSON.stringify(compact(design))
let applying = false
let pending = 0
export const history = reactive({ canUndo: false, canRedo: false })
const syncFlags = () => {
  history.canUndo = past.length > 0
  history.canRedo = future.length > 0
}
function record() {
  pending = 0
  const now = JSON.stringify(compact(design))
  if (now === lastSnap) return
  past.push(lastSnap)
  if (past.length > 200) past.shift()
  future.length = 0
  lastSnap = now
  syncFlags()
}
watch(
  design,
  () => {
    if (applying) return
    clearTimeout(pending)
    pending = window.setTimeout(record, 350)
  },
  { deep: true },
)
function restore(snap: string) {
  applying = true
  replaceDesign(cleanDesign(JSON.parse(snap)))
  lastSnap = snap
  syncFlags()
  // The design's watchers run after this; they should not record the restore.
  setTimeout(() => (applying = false), 0)
}
export function undo() {
  if (pending) record()
  const snap = past.pop()
  if (snap === undefined) return
  future.push(lastSnap)
  restore(snap)
}
export function redo() {
  const snap = future.pop()
  if (snap === undefined) return
  past.push(lastSnap)
  restore(snap)
}
function clearHistory() {
  past.length = 0
  future.length = 0
  lastSnap = JSON.stringify(compact(design))
  syncFlags()
}

/* ─── Wall templates ─────────────────────────────────────────────────── */

const TEMPLATE_KEY = 'laserwyrm-wall-templates'
function loadTemplates(): WallTemplate[] {
  try {
    const raw = JSON.parse(localStorage.getItem(TEMPLATE_KEY) ?? '[]') as WallTemplate[]
    return raw.filter((t) => t && typeof t.walls === 'string' && typeof t.name === 'string').slice(0, 60)
  } catch {
    return []
  }
}
/** Templates saved on this device, shared by every game and level. */
export const myTemplates = ref<WallTemplate[]>(loadTemplates())
watch(
  myTemplates,
  (list) => {
    try {
      localStorage.setItem(TEMPLATE_KEY, JSON.stringify(list))
    } catch {
      /* storage blocked */
    }
  },
  { deep: true },
)
export function saveTemplate(name: string, walls: string) {
  myTemplates.value.push({ id: newId(), name: name.trim().slice(0, 24) || 'My walls', walls })
}
export function deleteTemplate(id: string) {
  myTemplates.value = myTemplates.value.filter((t) => t.id !== id)
}

/** A new game, starting as the stock one (or from a design), made the active one. */
export function newGame(name?: string, from?: Design): SavedGame {
  const n = library.games.length + 1
  const game: SavedGame = { id: newId(), name: (name ?? `Game ${n}`).slice(0, 40), design: compact(from ?? stockDesign()), updatedAt: Date.now() }
  library.games.push(game)
  switchGame(game.id)
  return game
}
export function renameGame(id: string, name: string) {
  const game = library.games.find((g) => g.id === id)
  if (game && name.trim()) {
    game.name = name.trim().slice(0, 40)
    game.updatedAt = Date.now()
  }
}
/** Games deleted here, so syncing can delete them on the server too. */
export const deletedGames: string[] = []
/** Forget a game; there is always at least one. */
export function deleteGame(id: string) {
  if (library.games.length <= 1) return
  deletedGames.push(id)
  const wasActive = id === library.active
  library.games = library.games.filter((g) => g.id !== id)
  if (wasActive) {
    library.active = ''
    switchGame(library.games[0]!.id)
  }
}
/** A short fingerprint of a design, to tell whether a game changed since it was shared. */
export const fingerprint = (d: Design) => {
  const text = JSON.stringify(compact(d))
  let h = 0
  for (let i = 0; i < text.length; i++) h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0
  return `${text.length}:${h >>> 0}`
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
