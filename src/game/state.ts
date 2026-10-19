/**
 * The live run: the reactive `state` the view draws, the cheat switches,
 * replay and match flags, the run's bookkeeping, sound that hushes during
 * replays, and the hooks for rumble (`onFeel`) and timeline marks (`onMark`).
 */
import { reactive } from 'vue'
import { now, sound as rawSound } from '../audio'
import { DIRS, revision, START_HEARTS, type Feel, type Holdable, type Item, type Laser, type Debris, type Popup, type Mark, type Mode, type Replay, type Vec } from './catalog'
import { tempoFor } from './curve'

/**
 * The run in play, beyond what the view shows: its recording so far, the steps done (inputs are filed against them) and the
 * id counter for things on the board.
 */
export const run = {
  recording: { v: 1, mode: 'normal', seed: 1, cols: 30, rows: 20, steps: 0, events: [] } as Replay,
  stepsDone: 0,
  uid: 0,
}

/** v2: scores are length × beats now, so old fruit-count bests do not compare. */
export const BEST_KEY = 'snake-best-v2'

export function readBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0
  } catch {
    return 0
  }
}

export function saveBest(value: number) {
  try {
    localStorage.setItem(BEST_KEY, String(value))
  } catch {
    /* storage blocked: the best score lasts for this visit */
  }
}

export const same = (a: Vec, b: Vec) => a.x === b.x && a.y === b.y

/** Playback of a recorded run. While active, input and sound are off. */
export const replay = reactive({
  active: false,
  /** Sounds on while watching at an ear-friendly speed; off when skimming or seeking. */
  sound: false,
  ended: false,
  /** Steps played so far, and the total. */
  at: 0,
  total: 0,
})

/** Sounds go quiet during a replay; everything else calls through. */
export const sound = new Proxy(rawSound, {
  get: (target, key: keyof typeof rawSound) => (replay.active && !replay.sound ? () => {} : target[key]),
})

export const feelers: ((kind: Feel, amount: number) => void)[] = []
export const onFeel = (fn: (kind: Feel, amount: number) => void) => feelers.push(fn)
export function feel(kind: Feel, amount = 1) {
  if (!replay.active) for (const fn of feelers) fn(kind, amount)
}

export const markers = new Set<(kind: Mark, step: number) => void>()
export function onMark(fn: (kind: Mark, step: number) => void) {
  markers.add(fn)
  return () => markers.delete(fn)
}
export function mark(kind: Mark) {
  for (const fn of markers) fn(kind, state.step)
}

/** A copy of the last run, ready to send with a score. */
export const lastReplay = (): Replay => ({ ...run.recording, steps: run.stepsDone, events: [...run.recording.events] })

/** Cheat switches. They outlive a restart, so you can set them up and replay. */
export const cheats = reactive({
  /** Walls wrap, the body is not solid, lasers do nothing. */
  god: false,
  noLasers: false,
})

export const state = reactive({
  cols: 30,
  rows: 20,
  snake: [] as Vec[],
  direction: { ...DIRS.right } as Vec,
  queue: [] as Vec[],
  grow: 0,
  score: 0,
  hearts: START_HEARTS,
  best: readBest(),
  longest: 3,
  status: 'ready' as 'ready' | 'running' | 'paused' | 'over',
  reason: '',

  level: 0,
  bpm: tempoFor(0),
  step: 0,
  /** Bumped every beat, so the view can pulse. */
  beat: 0,

  items: [] as Item[],
  /** Each effect lasts until this step; 0 means off. */
  effects: { shield: 0, double: 0, slow: 0, magnet: 0, ghost: 0 },
  /** Power-ups carried for later, oldest first. */
  held: [] as Holdable[],
  /** Holding a Totem of Undying. */
  totem: false,
  /** A short note under the HUD: what was picked up or used, and what it does. */
  notice: null as { id: number; kind: Holdable | 'totem'; title: string; sub: string } | null,
  /** The last game beat the stored best. */
  newBest: false,
  /** Levels skipped by the cheat menu: the level is this plus the bars played. */
  levelOffset: 0,
  /** Bars spent in tier intros; they do not count toward the next level. */
  pausedBars: 0,
  mode: 'normal' as Mode,
  /** A new kind of laser being introduced: play is frozen until `until`. */
  intro: null as { tier: number; until: number; healed: boolean } | null,
  /** Until this step, after an intro, lasers come less often. */
  calmUntil: 0,
  /** Cheats were used, or the game was changed, so this run cannot set a best. */
  cheated: false,
  /** Real cheats (god mode, no lasers, a level jump, items handed out), not just a changed game. */
  usedCheats: false,
  lasers: [] as Laser[],
  debris: [] as Debris[],
  popups: [] as Popup[],
  /** Star bursts from starry cookies, for the board to draw. */
  bursts: [] as { id: number; x: number; y: number }[],
  /** Until this step, after a wizard cookie, no lasers. */
  wizardUntil: 0,
  /** A new kind of laser just arrived (without stopping play): the notice saying so. */
  tierNote: null as { id: number; tier: number; healed: boolean } | null,
  banner: null as { id: number; title: string; sub: string } | null,
  snipper: {
    x: 0,
    y: 0,
    facing: { ...DIRS.left } as Vec,
    active: false,
    until: 0,
    resting: false,
  },

  stats: { eaten: 0, lost: 0, cuts: 0, snippers: 0, blocked: 0 },
  /** Wall cells (y × cols + x), from a home-made level. */
  walls: [] as number[],
  /** Bumped on every hit, so the view can shake once. */
  shake: 0,
})

export const isActive = (effect: keyof typeof state.effects) => state.effects[effect] > state.step
/**
 * Slow-mo, from revision 6: the snake keeps its speed and the world around
 * it (lasers, items, the snipper) runs at half speed. Before, the snake
 * itself moved at half speed.
 */
export const worldSlowed = () => revision.rev >= 6 && isActive('slow')

/* ─── Game-clock timers ──────────────────────────────────────────────── */

export const clock = () => now() * 1000
export const timers: { at: number; run: () => void }[] = []
export function later(ms: number, run: () => void) {
  timers.push({ at: clock() + ms, run })
}

/**
 * A multiplayer match, as far as the game is concerned: every player plays
 * the same seed and grid on their own; the match module handles the rest.
 * While one is on there is no pausing; with respawns, dying starts the
 * snake again instead of ending the run.
 */
export const match = reactive({ on: false, live: false, respawn: false, respawns: 0 })

/**
 * The start screen's backdrop: the real game playing itself on the board,
 * silently. It runs as a replay whose moves are made up as it goes by a
 * simple pilot, so nothing is recorded or scored; when the snake dies, a
 * fresh one starts a moment later.
 */
export const demo = reactive({
  on: false,
  /** What the HUD shows meanwhile: the fresh game that is ready, not the backdrop's. */
  hud: { hearts: 0, score: 0, mult: 1, level: 0 },
})
