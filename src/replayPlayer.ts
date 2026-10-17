/**
 * Watching a recorded run: which one, whether it is playing, how fast. The
 * clock here advances the engine one step per 16th note at the run's own
 * tempo, times the chosen speed. Seeking replays from the start up to the
 * target, which takes a few milliseconds even for long runs.
 */
import { reactive } from 'vue'
import type { ScoreRow } from './api'
import { replay, replaySeek, replayTo, startReplay, state, stopReplay, type Replay } from './game'

export const SPEEDS = [0.5, 1, 2, 4, 8, 16] as const

export const player = reactive({
  run: null as Replay | null,
  /** The board entry being watched, for the title. */
  entry: null as ScoreRow | null,
  playing: false,
  speed: 1 as (typeof SPEEDS)[number],
})

let frame = 0
let last = 0
let owed = 0

function tick(now: number) {
  frame = requestAnimationFrame(tick)
  const dt = Math.min(0.25, (now - last) / 1000)
  last = now
  if (!player.playing || !player.run) return
  owed += dt * player.speed
  // A 16th note at the run's current tempo; never more than 64 steps a frame.
  let budget = 64
  while (budget-- > 0 && !replay.ended && replay.at < replay.total) {
    const stepSec = 60 / state.bpm / 4
    if (owed < stepSec) break
    owed -= stepSec
    replayTo(replay.at + 1)
  }
  if (replay.ended || replay.at >= replay.total) player.playing = false
}

export function watch(run: Replay, entry: ScoreRow | null) {
  player.run = run
  player.entry = entry
  player.speed = 1
  startReplay(run)
  player.playing = true
  owed = 0
  last = performance.now()
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(tick)
}

export function togglePlay() {
  if (!player.run) return
  // At the end, play means watch again from the top.
  if (replay.ended || replay.at >= replay.total) seek(0)
  player.playing = !player.playing
  last = performance.now()
}

export function seek(target: number) {
  if (!player.run) return
  replaySeek(Math.max(0, Math.min(replay.total, Math.round(target))), player.run)
  owed = 0
}

/** About three seconds of play, either way. */
export const seekBy = (steps: number) => seek(replay.at + steps)

export function stopWatching() {
  cancelAnimationFrame(frame)
  player.run = null
  player.entry = null
  player.playing = false
  stopReplay()
}
