/**
 * Attract mode: behind the start screen the real game plays itself, as a
 * replay steered by a simple pilot. Nothing is recorded or scored.
 */
import { DIRS, ENERGY, ITEMS_REV, usesEnergy, type Beam, type DirName, type Vec } from './catalog'
import { isWall } from './board'
import { queueTurn } from './controls'
import { onStep } from './engine'
import { activate, spendDash } from './items'
import { fitGrid } from './layout'
import { edgesFor, multiplier } from './levels'
import { startReplay, stopReplay } from './replay'
import { demo, replay, same, state } from './state'

let demoLast = 0
let demoOwed = 0
let demoRestartAt = 0

export function demoRun() {
  fitGrid()
  startReplay({ v: 1, mode: 'normal', seed: Math.floor(Math.random() * 2 ** 32) >>> 0, cols: state.cols, rows: state.rows, steps: 0, events: [], rev: ITEMS_REV })
  replay.total = Number.MAX_SAFE_INTEGER
  demo.on = true
  demoLast = performance.now()
  demoOwed = 0
  demoRestartAt = 0
}

/** Start the backdrop game, or start it over (the window changed size). */
export function startDemo() {
  if (replay.active && !demo.on) return
  if (!demo.on) demo.hud = { hearts: state.hearts, score: state.score, mult: multiplier(), level: state.level }
  demoRun()
}

/** Back to a fresh game, ready for the player. */
export function stopDemo() {
  if (!demo.on) return
  demo.on = false
  stopReplay()
}

export function demoFrame() {
  const t = performance.now()
  // A hidden tab skips ahead rather than racing to catch up.
  const dt = Math.min(250, t - demoLast)
  demoLast = t
  if (replay.ended) {
    if (!demoRestartAt) demoRestartAt = t + 1600
    else if (t >= demoRestartAt) demoRun()
    return
  }
  demoOwed += dt
  const stepMs = 60000 / (state.bpm * 4)
  while (demoOwed >= stepMs && !replay.ended) {
    demoOwed -= stepMs
    pilot()
    onStep(replay.at)
    replay.at++
  }
}

/** Cells about to be hit by a laser that is warming up. */
export function dangerCells(): Set<number> {
  const out = new Set<number>()
  for (const laser of state.lasers) {
    if (laser.struck || laser.strikeStep - state.step > 6) continue
    for (const beam of laser.beams) {
      for (let k = -half(beam); k <= half(beam); k++) {
        const line = beam.index + k
        if (beam.axis === 'row') for (let x = 0; x < state.cols; x++) out.add(line * state.cols + x)
        else for (let y = 0; y < state.rows; y++) out.add(y * state.cols + line)
      }
    }
  }
  return out
}
export const half = (beam: Beam) => (beam.width - 1) / 2

/** The pilot: toward the nearest food, out of laser lines, never into a corner it cannot leave. */
export function pilot() {
  if (state.queue.length) return
  const head = state.snake[0]!
  const wrap = edgesFor(state.level) !== 'kill'
  const body = new Set(state.snake.slice(0, -1).map((c) => c.y * state.cols + c.x))
  const danger = dangerCells()
  const move = (from: Vec, d: Vec): Vec | null => {
    let x = from.x + d.x
    let y = from.y + d.y
    if (x < 0 || y < 0 || x >= state.cols || y >= state.rows) {
      if (!wrap) return null
      x = (x + state.cols) % state.cols
      y = (y + state.rows) % state.rows
    }
    const cell = { x, y }
    return isWall(cell) || body.has(y * state.cols + x) ? null : cell
  }
  /** Room to move from `start`, counted up to a little more than the snake needs. */
  const room = (start: Vec) => {
    const limit = state.snake.length + 8
    const seen = new Set([start.y * state.cols + start.x])
    const todo = [start]
    while (todo.length && seen.size < limit) {
      const c = todo.pop()!
      for (const d of Object.values(DIRS)) {
        const n = move(c, d)
        if (n && !seen.has(n.y * state.cols + n.x)) {
          seen.add(n.y * state.cols + n.x)
          todo.push(n)
        }
      }
    }
    return seen.size
  }
  const gap = (a: number, b: number, n: number) => (wrap ? Math.min(Math.abs(a - b), n - Math.abs(a - b)) : Math.abs(a - b))
  const far = (c: Vec, i: Vec) => gap(c.x, i.x, state.cols) + gap(c.y, i.y, state.rows)
  const food = state.items.filter((i) => i.kind !== 'totem' || !state.totem)
  let best: { name: DirName; score: number } | null = null
  for (const name of Object.keys(DIRS) as DirName[]) {
    const d = DIRS[name]
    if (d.x === -state.direction.x && d.y === -state.direction.y) continue
    const next = move(head, d)
    if (!next) continue
    const target = food.reduce((m, i) => Math.min(m, far(next, i)), 99)
    const space = room(next)
    let score = target + Math.random() * 1.5
    if (space < state.snake.length + 8) score += 200 - space
    if (danger.has(next.y * state.cols + next.x)) score += 60
    if (same(d, state.direction)) score -= 0.4
    if (!best || score < best.score) best = { name, score }
  }
  if (best && !same(DIRS[best.name], state.direction)) queueTurn(best.name)
  // Use what it carries, now and then.
  if (state.held.length && Math.random() < 0.02) activate(state.held.shift()!, head)
  // Dash now and then, when there is energy to spare.
  if (usesEnergy() && state.energy >= ENERGY.dash + 20 && Math.random() < 0.01) spendDash()
}
