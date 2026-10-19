/**
 * A multiplayer match, from the game's side: set up the shared seed and
 * design, go, halt, and leave. The room itself is in ../multiplayer.ts.
 */
import { conductor } from '../audio'
import { playWith, stockDesign, type Design } from '../design'
import { play } from './controls'
import { stopDemo } from './demo'
import { reset } from './engine'
import { stopReplay } from './replay'
import { isWall } from './board'
import { ITEMS_REV, type Vec } from './catalog'
import { die } from './hits'
import { match, replay, run, state } from './state'

/** Set up a match's game: its design, seed and grid, ready for the go. */
export function prepareMatch(setup: { seed: number; cols: number; rows: number; design: Design | null; respawn: boolean; calm?: boolean }) {
  stopDemo()
  if (replay.active) stopReplay()
  playWith(setup.design ?? stockDesign())
  Object.assign(match, { on: true, live: false, respawn: setup.respawn, respawns: 0, calm: !!setup.calm })
  // The current rules: a match is never a replay of an older run.
  reset({ seed: setup.seed, cols: setup.cols, rows: setup.rows, mode: 'normal', rev: ITEMS_REV })
  // A match never sets a best.
  state.cheated = true
}

/** The go: play starts for everyone at once. */
export function goMatch() {
  match.live = true
  play()
}

/** Time is up (or the race is won): stop where it stands. */
export function haltMatch() {
  match.live = false
  if (state.status !== 'running') return
  state.status = 'over'
  state.reason = 'finished'
  conductor.stop()
}

/** Ran into another player's snake (slither): the snake dies, or respawns. */
export function crash(reason: string) {
  if (state.status !== 'running' || !match.live) return
  die(reason)
}

/** A fallen snake turns to food (slither): a cookie on every other cell it lay on, for a few bars. */
export function dropPellets(cells: Vec[]) {
  const taken = new Set(state.items.map((i) => i.y * state.cols + i.x))
  for (let i = 0; i < cells.length && i < 60; i += 2) {
    const c = cells[i]!
    const at = c.y * state.cols + c.x
    if (c.x < 0 || c.y < 0 || c.x >= state.cols || c.y >= state.rows || taken.has(at) || isWall(c)) continue
    taken.add(at)
    state.items.push({ id: ++run.uid, kind: 'cookie', x: c.x, y: c.y, until: state.step + 96 })
  }
}

/** Out of the match: back to the chosen game, fresh. */
export function endMatch() {
  Object.assign(match, { on: false, live: false, respawn: false, respawns: 0, calm: false })
  playWith(null)
  reset()
}
