/**
 * Watching a recorded run: which one, whether it is playing, how fast.
 *
 * At 0.5× to 2× the music conductor is the clock, exactly as in play: it
 * runs the track from the replay's current step at the chosen rate, and each
 * step it schedules moves the replay on one, so music, lasers and sounds all
 * land together. Faster than that, a plain timer skims through in silence.
 * Seeking replays from the start up to the target, quietly; it takes a few
 * milliseconds even for long runs.
 *
 * On load the whole run is played through once, quietly, to note where
 * things happened (power-ups, cuts, hearts, levels), for the seek bar.
 */
import { reactive } from 'vue'
import { conductor, now, queue } from './audio'
import { onMark, replay, replaySeek, replayTo, startReplay, state, stopReplay, type Mark, type Replay } from './game'

/** What the title shows: whose run, its score, and its game code if it has one. */
export interface WatchedEntry {
  name: string | null
  score: number
  level: number
  code: string | null
}

export const SPEEDS = [0.5, 1, 2, 4, 8, 16] as const
type Speed = (typeof SPEEDS)[number]
/** Up to this speed the replay plays with music and sound. */
const SOUND_UP_TO = 2

export const player = reactive({
  run: null as Replay | null,
  /** The board entry being watched, for the title. */
  entry: null as WatchedEntry | null,
  playing: false,
  speed: 1 as Speed,
  /** Where things happened, by step, for the seek bar. */
  marks: [] as { kind: Mark; step: number }[],
})

let frame = 0
let last = 0
let owed = 0
/** True while the conductor is driving the replay (with sound). */
let conducted = false

function startConductor() {
  conductor.setRate(player.speed)
  conductor.setLevel(state.level, state.bpm)
  conductor.start(replay.at)
  replay.sound = true
  conducted = true
}

function stopConductor() {
  if (conducted) conductor.stop()
  conducted = false
  replay.sound = false
}

/** Pick the clock for the current speed and play state. */
function setClock() {
  stopConductor()
  owed = 0
  last = performance.now()
  if (player.playing && player.speed <= SOUND_UP_TO && !replay.ended) startConductor()
}

function finished() {
  return replay.ended || replay.at >= replay.total
}

function tick(time: number) {
  frame = requestAnimationFrame(tick)
  const dt = Math.min(0.25, (time - last) / 1000)
  last = time
  if (!player.playing || !player.run) return
  if (conducted) {
    // Each step the conductor has played moves the replay on by one.
    const t = now()
    while (queue.length && queue[0]!.time <= t && !finished()) {
      queue.shift()
      replayTo(replay.at + 1)
    }
  } else {
    owed += dt * player.speed
    // A 16th note at the run's current tempo; never more than 64 steps a frame.
    let budget = 64
    while (budget-- > 0 && !finished()) {
      const stepSec = 60 / state.bpm / 4
      if (owed < stepSec) break
      owed -= stepSec
      replayTo(replay.at + 1)
    }
  }
  if (finished()) {
    player.playing = false
    stopConductor()
  }
}

/** Play the run through once without showing it, noting its moments. */
function scan(run: Replay) {
  const marks: { kind: Mark; step: number }[] = []
  const off = onMark((kind, step) => marks.push({ kind, step }))
  startReplay(run)
  replayTo(run.steps)
  off()
  return marks
}

export function watch(run: Replay, entry: WatchedEntry | null) {
  player.run = run
  player.entry = entry
  player.speed = 1
  player.marks = scan(run)
  startReplay(run)
  player.playing = true
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(tick)
  setClock()
}

export function togglePlay() {
  if (!player.run) return
  // At the end, play means watch again from the top.
  if (finished()) seek(0)
  player.playing = !player.playing
  setClock()
}

export function setSpeed(speed: Speed) {
  player.speed = speed
  setClock()
}

export function seek(target: number) {
  if (!player.run) return
  stopConductor()
  replaySeek(Math.max(0, Math.min(replay.total, Math.round(target))), player.run)
  setClock()
}

/** About five seconds of play, either way. */
export const seekBy = (steps: number) => seek(replay.at + steps)

export function stopWatching() {
  cancelAnimationFrame(frame)
  stopConductor()
  player.run = null
  player.entry = null
  player.playing = false
  player.marks = []
  stopReplay()
}
