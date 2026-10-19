/**
 * What lies on the board besides the snake: walls, items and where a new
 * one can go, and the short-lived popups, banners and notices.
 */
import { editOf, live, unpackWalls } from '../design'
import { NOTICE_MS, POPUP_MS, type Holdable, type ItemKind, type Tone, type Vec } from './catalog'
import { pick } from './rng'
import { later, run, state } from './state'

/** Walls, for quick lookups; `state.walls` is the same, for drawing. */
let wallSet = new Set<number>()
export const isWall = (cell: Vec) => wallSet.has(cell.y * state.cols + cell.x)

/** The walls drawn for the current level. */
let wallsShown: string | undefined

/** Put up a level's walls, leaving any cell the snake is on clear. */
export function setWalls(level: number) {
  const walls = editOf(live(), level).walls
  if (walls === wallsShown && state.walls.length === wallSet.size) return
  wallsShown = walls
  const keep = new Set(state.snake.map((c) => c.y * state.cols + c.x))
  const out = unpackWalls(walls, state.cols * state.rows).filter((at) => !keep.has(at))
  state.walls = out
  wallSet = new Set(out)
  state.items = state.items.filter((i) => !isWall(i))
}

/** Take every wall down (a new run). */
export function clearWalls() {
  wallsShown = undefined
  state.walls = []
  wallSet = new Set()
}

export function freeCell(): Vec {
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

export function addItem(kind: ItemKind, lifeSteps: number | null) {
  const cell = freeCell()
  state.items.push({ id: ++run.uid, kind, ...cell, until: lifeSteps === null ? null : state.step + lifeSteps })
}

/* ─── Popups, banners and notices ─────────────────────────────────────── */

export function popup(cell: Vec, text: string, tone: Tone) {
  const id = ++run.uid
  state.popups.push({ id, x: cell.x, y: cell.y, text, tone })
  later(POPUP_MS, () => (state.popups = state.popups.filter((p) => p.id !== id)))
}

export function banner(title: string, sub: string) {
  const id = ++run.uid
  state.banner = { id, title, sub }
  later(1800, () => {
    if (state.banner?.id === id) state.banner = null
  })
}

export function notice(kind: Holdable | 'totem', title: string, sub: string) {
  const id = ++run.uid
  state.notice = { id, kind, title, sub }
  later(NOTICE_MS, () => {
    if (state.notice?.id === id) state.notice = null
  })
}
