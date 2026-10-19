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
import { match, replay, state } from './state'

/** Set up a match's game: its design, seed and grid, ready for the go. */
export function prepareMatch(setup: { seed: number; cols: number; rows: number; design: Design | null; respawn: boolean }) {
  stopDemo()
  if (replay.active) stopReplay()
  playWith(setup.design ?? stockDesign())
  Object.assign(match, { on: true, live: false, respawn: setup.respawn, respawns: 0 })
  reset({ seed: setup.seed, cols: setup.cols, rows: setup.rows, mode: 'normal' })
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

/** Out of the match: back to the chosen game, fresh. */
export function endMatch() {
  Object.assign(match, { on: false, live: false, respawn: false, respawns: 0 })
  playWith(null)
  reset()
}
