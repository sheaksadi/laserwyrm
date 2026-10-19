/**
 * What the player (or a test) does: play, pause, steer, use an item, pick
 * the mode, and the cheats. Live input is recorded for the replay here.
 */
import { conductor } from '../audio'
import { DIR_CODE, DIRS, tierOf, type DirName, type Holdable, type Mode } from './catalog'
import { setWalls } from './board'
import { heldSlots, levelAtBar, maxHearts } from './curve'
import { stopDemo } from './demo'
import { reset } from './engine'
import { activate } from './items'
import { applyLevel } from './levels'
import { cheats, match, replay, run, same, saveBest, sound, state } from './state'

/** Use the oldest held power-up. */
export function useItem() {
  if (state.status !== 'running' || replay.active) return
  const kind = state.held.shift()
  if (!kind) return
  run.recording.events.push([run.stepsDone, 'i'])
  activate(kind, state.snake[0]!)
}

/* ─── Cheats ─────────────────────────────────────────────────────────── */

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
  else if (kind === 'heart') state.hearts = maxHearts()
  else if (kind === 'grow') state.grow += 10
  else if (state.held.length < heldSlots()) state.held.push(kind)
  else state.held = [...state.held.slice(1), kind]
}

/** Pick normal or hardcore for the next game. */
export function setMode(mode: Mode) {
  if (state.status === 'running' || replay.active) return
  state.mode = mode
  run.recording.mode = mode
}

export function play() {
  stopDemo()
  if (state.status === 'running' || replay.active || (match.on && !match.live)) return
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
  // Nobody waits in multiplayer: the game plays on.
  if (state.status !== 'running' || replay.active || match.on) return
  state.status = 'paused'
  conductor.pause()
}

export function toggle() {
  if (state.status === 'running') pause()
  else play()
}

export function turn(name: DirName) {
  stopDemo()
  if (state.status === 'over' || replay.active || (match.on && !match.live)) return
  if (!queueTurn(name)) return
  run.recording.events.push([run.stepsDone, DIR_CODE[name]])
  sound.turn()
  if (state.status === 'ready' || state.status === 'paused') play()
}

export function queueTurn(name: DirName): boolean {
  const wanted = DIRS[name]
  const lastQueued = state.queue[state.queue.length - 1] ?? state.direction
  if (same(wanted, lastQueued) || state.queue.length >= 3) return false
  state.queue.push({ ...wanted })
  return true
}
