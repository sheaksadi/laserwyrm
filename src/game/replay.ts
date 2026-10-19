/**
 * Watching a recorded run: set it up, play it forward step by step with its
 * inputs, seek, and leave. Cheats are put aside while it plays.
 */
import { conductor } from '../audio'
import { playWith } from '../design'
import { CODE_DIR, type Replay, type ReplayEvent } from './catalog'
import { levelAtBar, tempoFor } from './curve'
import { queueTurn } from './controls'
import { onStep, reset } from './engine'
import { activate } from './items'
import { cheats, demo, replay, state, timers } from './state'

let replayEvents: ReplayEvent[] = []
let replayCursor = 0
let savedCheats = { god: false, noLasers: false }

/** Set up a recorded run at its first step. Cheats are put aside until it ends. */
export function startReplay(run: Replay) {
  // A real replay takes over from the start screen's backdrop.
  demo.on = false
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
