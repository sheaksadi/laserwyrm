/**
 * Sound and music, and the game's clock.
 *
 * The conductor runs a small electro track on Web Audio and is the clock the
 * whole game runs on: the snake moves on every 16th note, lasers arm on a beat
 * and strike on a later beat, and the track gets faster and fuller as the
 * level climbs. Because game time *is* audio time, a laser's zap always lands
 * exactly on the beat it was drawn for, and pausing (which suspends the audio
 * context) freezes music, timers and animations together.
 *
 * Everything is synthesised; nothing is downloaded.
 */
import { ref, watch } from 'vue'

/* ─── Preferences ────────────────────────────────────────────────────── */

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key)
    return value === null ? fallback : value === '1'
  } catch {
    return fallback
  }
}
function saveFlag(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? '1' : '0')
  } catch {
    /* storage blocked: the switch still works for this visit */
  }
}

function readLevel(key: string, fallback: number): number {
  try {
    const value = Number(localStorage.getItem(key))
    return localStorage.getItem(key) !== null && value >= 0 && value <= 1 ? value : fallback
  } catch {
    return fallback
  }
}
function saveLevel(key: string, value: number) {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    /* storage blocked: the slider still works for this visit */
  }
}

export const muted = ref(readFlag('snake-muted', false))
export const musicOn = ref(readFlag('snake-music', true))
/** Volume sliders in the settings, 0 to 1 on top of the mix below. */
export const musicVolume = ref(readLevel('snake-music-volume', 1))
export const sfxVolume = ref(readLevel('snake-sfx-volume', 1))

const MASTER = 0.8
const MUSIC = 0.55
const SFX = 0.7
const musicGain = () => (musicOn.value ? MUSIC * musicVolume.value : 0)
const sfxGain = () => SFX * sfxVolume.value

watch(muted, (value) => {
  saveFlag('snake-muted', value)
  if (ctx) master.gain.setTargetAtTime(value ? 0 : MASTER, ctx.currentTime, 0.02)
})
watch([musicOn, musicVolume], () => {
  saveFlag('snake-music', musicOn.value)
  saveLevel('snake-music-volume', musicVolume.value)
  if (ctx) musicBus.gain.setTargetAtTime(musicGain(), ctx.currentTime, 0.05)
})
watch(sfxVolume, (value) => {
  saveLevel('snake-sfx-volume', value)
  if (ctx) sfxBus.gain.setTargetAtTime(sfxGain(), ctx.currentTime, 0.02)
})

/** Play one effect now, so a volume change can be heard. */
export function previewSfx() {
  sound.eat(0)
}

/* ─── Graph ──────────────────────────────────────────────────────────── */

let ctx: AudioContext | null = null
let master: GainNode
let musicBus: GainNode
/** Between the music and the mix: dips for a tier's tape-stop, opens on the build. */
let musicFilter: BiquadFilterNode
let sfxBus: GainNode
let noise: AudioBuffer

/** The audio context and the music bus, for a level's own (Strudel) music to play into. */
export function musicOutput(): { ctx: AudioContext; bus: AudioNode } | null {
  const c = ensure()
  return c ? { ctx: c, bus: musicBus } : null
}

function ensure(): AudioContext | null {
  if (ctx) return ctx
  try {
    ctx = new AudioContext()
  } catch {
    return null
  }
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -14
  comp.ratio.value = 4
  master = ctx.createGain()
  master.gain.value = muted.value ? 0 : MASTER
  musicBus = ctx.createGain()
  musicBus.gain.value = musicGain()
  sfxBus = ctx.createGain()
  sfxBus.gain.value = sfxGain()
  musicFilter = ctx.createBiquadFilter()
  musicFilter.type = 'lowpass'
  musicFilter.frequency.value = 20000
  musicFilter.Q.value = 0.8
  musicBus.connect(musicFilter).connect(master)
  sfxBus.connect(master)
  master.connect(comp).connect(ctx.destination)

  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const data = noise.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return ctx
}

function env(gain: GainNode, t: number, peak: number, attack: number, decay: number) {
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(peak, t + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
}

function osc(type: OscillatorType, freq: number, t: number, length: number, out: AudioNode) {
  const o = ctx!.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  o.connect(out)
  o.start(t)
  o.stop(t + length + 0.05)
  return o
}

function noiseSrc(t: number, length: number, out: AudioNode) {
  const n = ctx!.createBufferSource()
  n.buffer = noise
  n.connect(out)
  n.start(t, Math.random() * 0.5)
  n.stop(t + length + 0.05)
  return n
}

function filter(type: BiquadFilterType, freq: number, q = 1) {
  const f = ctx!.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = q
  return f
}

/* ─── Instruments ────────────────────────────────────────────────────── */

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

function kick(t: number, bus: AudioNode) {
  const g = ctx!.createGain()
  g.connect(bus)
  env(g, t, 0.9, 0.002, 0.28)
  const o = osc('sine', 150, t, 0.3, g)
  o.frequency.exponentialRampToValueAtTime(42, t + 0.12)
}

function hat(t: number, open: boolean, bus: AudioNode, level = 0.12) {
  const g = ctx!.createGain()
  const f = filter('highpass', 7500)
  f.connect(g).connect(bus)
  env(g, t, level, 0.001, open ? 0.16 : 0.035)
  noiseSrc(t, 0.2, f)
}

function clap(t: number, bus: AudioNode) {
  const g = ctx!.createGain()
  const f = filter('bandpass', 1400, 1.2)
  f.connect(g).connect(bus)
  g.gain.setValueAtTime(0.0001, t)
  for (const offset of [0, 0.012, 0.024]) {
    g.gain.setValueAtTime(0.35, t + offset)
    g.gain.exponentialRampToValueAtTime(0.05, t + offset + 0.01)
  }
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2)
  noiseSrc(t, 0.22, f)
}

function bass(t: number, midi: number, length: number, bus: AudioNode) {
  const g = ctx!.createGain()
  const f = filter('lowpass', 900, 7)
  f.frequency.setValueAtTime(1400, t)
  f.frequency.exponentialRampToValueAtTime(220, t + length)
  f.connect(g).connect(bus)
  env(g, t, 0.32, 0.004, length)
  osc('sawtooth', hz(midi), t, length, f)
  osc('square', hz(midi - 12), t, length, f)
}

function pluck(t: number, midi: number, bus: AudioNode, level = 0.09) {
  const g = ctx!.createGain()
  const f = filter('lowpass', 3200, 3)
  f.frequency.setValueAtTime(4200, t)
  f.frequency.exponentialRampToValueAtTime(600, t + 0.14)
  f.connect(g).connect(bus)
  env(g, t, level, 0.003, 0.16)
  osc('square', hz(midi), t, 0.2, f)
}

function stab(t: number, notes: number[], bus: AudioNode) {
  const g = ctx!.createGain()
  const f = filter('lowpass', 2400, 2)
  f.connect(g).connect(bus)
  env(g, t, 0.07, 0.01, 0.45)
  for (const midi of notes) {
    osc('sawtooth', hz(midi) * 1.003, t, 0.5, f)
    osc('sawtooth', hz(midi) * 0.997, t, 0.5, f)
  }
}

/** A filtered noise sweep that rises for the whole warning: the laser charging. */
function riser(t: number, length: number, bus: AudioNode) {
  const g = ctx!.createGain()
  const f = filter('bandpass', 300, 6)
  f.frequency.setValueAtTime(300, t)
  f.frequency.exponentialRampToValueAtTime(5000, t + length)
  f.connect(g).connect(bus)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.16, t + length)
  g.gain.exponentialRampToValueAtTime(0.0001, t + length + 0.02)
  noiseSrc(t, length + 0.05, f)
}

/** The laser fires: a falling saw zap over a noise crack. */
function zap(t: number, bus: AudioNode) {
  const g = ctx!.createGain()
  g.connect(bus)
  env(g, t, 0.3, 0.002, 0.3)
  const o = osc('sawtooth', 2400, t, 0.32, g)
  o.frequency.exponentialRampToValueAtTime(60, t + 0.3)
  const g2 = ctx!.createGain()
  const f = filter('highpass', 2000)
  f.connect(g2).connect(bus)
  env(g2, t, 0.25, 0.001, 0.12)
  noiseSrc(t, 0.15, f)
}

/* ─── The track ──────────────────────────────────────────────────────── */

/**
 * One arrangement per laser tier, so each new kind of laser brings its own
 * feel: key and chords, bass rhythm, drums, the arpeggio's shape and voice.
 * `arp` indexes the chord (3 is the root an octave up).
 */
export interface Variant {
  roots: number[]
  chords: number[][]
  bassSteps: Set<number>
  kickSteps: Set<number>
  clapSteps: Set<number>
  arp: number[]
  lead: OscillatorType
  /** Semitones added to the arpeggio. */
  lift: number
}
export const VARIANTS: readonly Variant[] = [
  // Red: A minor, four on the floor. The original.
  { roots: [45, 41, 48, 43], chords: [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62]],
    bassSteps: new Set([0, 3, 6, 8, 10, 11, 14]), kickSteps: new Set([0, 4, 8, 12]), clapSteps: new Set([4, 12]),
    arp: [0, 1, 2, 1, 2, 0, 1, 2], lead: 'square', lift: 0 },
  // Blue: D minor, rolling offbeat bass, rising arpeggio.
  { roots: [38, 46, 41, 48], chords: [[62, 65, 69], [58, 62, 65], [60, 65, 69], [60, 64, 67]],
    bassSteps: new Set([2, 6, 10, 14, 15]), kickSteps: new Set([0, 4, 8, 12]), clapSteps: new Set([4, 12]),
    arp: [0, 1, 2, 3, 0, 1, 2, 3], lead: 'triangle', lift: 12 },
  // Purple: E phrygian, half-time and heavy.
  { roots: [40, 41, 40, 38], chords: [[64, 67, 71], [65, 69, 72], [64, 67, 71], [62, 65, 69]],
    bassSteps: new Set([0, 1, 7, 8, 9, 15]), kickSteps: new Set([0, 10]), clapSteps: new Set([8]),
    arp: [0, 2, 1, 2, 0, 2, 3, 2], lead: 'sawtooth', lift: 0 },
  // White: C major, bright and quick.
  { roots: [48, 43, 45, 41], chords: [[60, 64, 67], [59, 62, 67], [60, 64, 69], [60, 65, 69]],
    bassSteps: new Set([2, 6, 10, 14]), kickSteps: new Set([0, 4, 8, 12]), clapSteps: new Set([4, 12]),
    arp: [0, 1, 2, 3, 2, 1, 2, 3], lead: 'sine', lift: 12 },
  // Green: acid in A, one chord, a busy squelchy bass.
  { roots: [45, 45, 45, 48], chords: [[57, 60, 64], [57, 60, 64], [57, 60, 64], [60, 64, 67]],
    bassSteps: new Set([0, 2, 3, 5, 7, 8, 10, 11, 13, 14]), kickSteps: new Set([0, 4, 8, 12]), clapSteps: new Set([4, 12]),
    arp: [0, 0, 2, 0, 1, 0, 3, 0], lead: 'sawtooth', lift: 0 },
  // Gold: F major anthem, big chords.
  { roots: [41, 43, 40, 45], chords: [[65, 69, 72], [67, 71, 74], [64, 67, 71], [64, 69, 72]],
    bassSteps: new Set([0, 3, 6, 8, 11, 14]), kickSteps: new Set([0, 4, 8, 12]), clapSteps: new Set([4, 12]),
    arp: [0, 1, 2, 3, 0, 1, 2, 3], lead: 'square', lift: 12 },
  // Combos: F minor breakbeat.
  { roots: [41, 37, 44, 39], chords: [[65, 68, 72], [61, 65, 68], [63, 68, 72], [63, 67, 70]],
    bassSteps: new Set([0, 3, 10, 11]), kickSteps: new Set([0, 6, 10]), clapSteps: new Set([4, 12]),
    arp: [3, 2, 1, 0, 3, 2, 1, 2], lead: 'triangle', lift: 0 },
  // Prism: everything, climbing a semitone every bar of four.
  { roots: [45, 46, 47, 48], chords: [[57, 60, 64], [58, 61, 65], [59, 62, 66], [60, 63, 67]],
    bassSteps: new Set([0, 2, 3, 6, 8, 10, 11, 14]), kickSteps: new Set([0, 4, 8, 12, 14]), clapSteps: new Set([4, 12]),
    arp: [0, 1, 2, 3, 2, 1, 0, 3], lead: 'sawtooth', lift: 12 },
]

/** Which arrangement, and where in a tier change it is: an intro pause, a build back up, or full play. */
let style = { variant: 0, phase: 'play' as 'play' | 'intro' | 'build' | 'warmup', from: 0 }
const BUILD_BARS = 4

function lead(t: number, midi: number, type: OscillatorType, bus: AudioNode) {
  const g = ctx!.createGain()
  const f = filter('lowpass', 3200, 3)
  f.frequency.setValueAtTime(4200, t)
  f.frequency.exponentialRampToValueAtTime(600, t + 0.14)
  f.connect(g).connect(bus)
  env(g, t, type === 'sine' || type === 'triangle' ? 0.13 : 0.08, 0.003, 0.16)
  osc(type, hz(midi), t, 0.2, f)
}

/** A soft held chord, for the pause while a new tier is introduced. */
function pad(t: number, notes: number[], length: number, bus: AudioNode) {
  const g = ctx!.createGain()
  const f = filter('lowpass', 1200, 1)
  f.connect(g).connect(bus)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.05, t + length * 0.4)
  g.gain.exponentialRampToValueAtTime(0.0001, t + length)
  for (const midi of notes) {
    osc('triangle', hz(midi) * 1.004, t, length, f)
    osc('triangle', hz(midi - 12) * 0.996, t, length, f)
  }
}

function playStep(step: number, t: number, level: number) {
  const bus = musicBus
  const v = VARIANTS[style.variant]!
  const s = step % 16
  const bar = Math.floor(step / 16)
  const chord = bar % 4
  const sd = stepSeconds()

  // Waiting to start (the briefing): a muffled heartbeat that gathers itself.
  if (style.phase === 'warmup') {
    const into = Math.floor((step - style.from) / 16)
    if (s === 0 || s === 8) kick(t, bus)
    if (s === 0) pad(t, v.chords[chord]!, sd * 16, bus)
    if (into >= 1 && s % 4 === 2) hat(t, false, bus, 0.05)
    if (into >= 2 && v.bassSteps.has(s) && s % 4 === 0) bass(t, v.roots[chord]!, sd * 2, bus)
    if (into >= 3 && (s === 4 || s === 12)) clap(t, bus)
    return
  }
  // The pause: only a pad of the new key, one per bar.
  if (style.phase === 'intro') {
    if (s === 0) pad(t, v.chords[chord]!, sd * 16, bus)
    return
  }
  // The build: the band comes back in a part at a time over four bars.
  const into = style.phase === 'build' ? Math.floor((step - style.from) / 16) : BUILD_BARS
  if (into >= BUILD_BARS && style.phase === 'build') style.phase = 'play'
  const drums = into >= 1
  const full = into >= 2

  if (drums && (v.kickSteps.has(s) || (level >= 4 && s === 14))) kick(t, bus)
  if (v.bassSteps.has(s)) bass(t, v.roots[chord]! + (s === 14 ? 12 : 0), sd * 1.6, bus)
  if (full && level >= 1 && s % 4 === 2) hat(t, true, bus)
  if (full && level >= 3 && s % 2 === 1) hat(t, false, bus, 0.06)
  if (full && level >= 2 && v.clapSteps.has(s)) clap(t, bus)
  if (level >= 2 && (level >= 3 || s % 2 === 0)) {
    const pick = v.arp[s % 8]!
    const note = pick === 3 ? v.chords[chord]![0]! + 12 : v.chords[chord]![pick]!
    lead(t, note + 12 + v.lift + (level >= 5 && s >= 8 ? 12 : 0) - (v.lift && level >= 5 ? 12 : 0), v.lead, bus)
  }
  if (full && level >= 4 && (s === 0 || s === 6)) stab(t, v.chords[chord]!, bus)
}

/* ─── Conductor ──────────────────────────────────────────────────────── */

export interface StepEvent { step: number; time: number }

const LOOKAHEAD = 0.12
let bpm = 110
/** Playback rate, for watching replays at 0.5× to 2×; 1 in play. */
let rate = 1
let level = 0
let nextStep = 0
let nextTime = 0
let timer: ReturnType<typeof setInterval> | null = null
/** Fallback clock when Web Audio is missing: performance time minus pauses. */
let fallbackStart = 0
let fallbackPausedAt = 0
let running = false

export const stepSeconds = () => 60 / (bpm * rate) / 4

/** Steps the game has not handled yet, in time order. */
export const queue: StepEvent[] = []
/** Called for every step as it is scheduled, ahead of time, to add game sounds. */
let onSchedule: (event: StepEvent) => void = () => {}

/**
 * Which clock the game runs on. Normally the audio clock, so sound and play
 * stay locked together. But browsers only start audio after a click, tap or
 * key press, and a controller button does not count: a game started from a
 * controller on a fresh page would sit still. Then the game runs on a plain
 * timer, silently, until the first click or key lets audio start; it then
 * hands over to the audio clock without a jump (`audioOffset` lines the two
 * up), and the music joins in.
 */
let clock: 'audio' | 'timer' = 'timer'
let audioOffset = 0
/** True while a game is running silently, waiting for a click or key to allow sound. */
export const soundBlocked = ref(false)

const timerNow = () => ((running ? performance.now() : fallbackPausedAt) - fallbackStart) / 1000

export function now(): number {
  if (ctx && clock === 'audio') return ctx.currentTime - audioOffset
  return timerNow()
}

/** Audio has just become available mid-game: carry on from the same moment on its clock. */
function handOver() {
  if (!ctx || ctx.state !== 'running' || clock === 'audio' || !running) return
  audioOffset = ctx.currentTime - timerNow()
  clock = 'audio'
  soundBlocked.value = false
}

/** Any click, tap or key unlocks audio for the page; take the chance whenever it comes. */
if (typeof window !== 'undefined') {
  const unlock = () => {
    if (!ensure() || !ctx) return
    if (ctx.state === 'suspended' && running) void ctx.resume().then(handOver)
  }
  window.addEventListener('pointerdown', unlock, true)
  window.addEventListener('keydown', unlock, true)
}

/**
 * A level's own music, written in Strudel: something to ask which notes fall
 * in a stretch of cycles (one cycle is one bar, counted from `from`), and
 * something to play one. While it is set, it plays instead of the track.
 */
export interface CustomMusic {
  from: number
  notes: (begin: number, end: number, cps: number) => { at: number; length: number; play: (t: number, length: number, cps: number) => void }[]
}
let custom: CustomMusic | null = null
export function setCustomMusic(music: CustomMusic | null) {
  custom = music
}

/** One step of a level's own music: every note starting in this 16th, at its exact time. */
function playCustom(music: CustomMusic, step: number, t: number) {
  const cps = (bpm * rate) / 240
  const begin = (step - music.from) / 16
  try {
    for (const note of music.notes(begin, begin + 1 / 16, cps)) note.play(t + (note.at - begin) / cps, note.length / cps, cps)
  } catch {
    // A pattern that throws while playing goes quiet rather than stopping the game.
    custom = null
  }
}

/** The audio clock when play paused, so time spent paused (a music preview) is not played through. */
let pausedAtAudio = 0

function schedule() {
  while (nextTime < now() + LOOKAHEAD) {
    const event = { step: nextStep, time: nextTime }
    if (ctx && clock === 'audio') {
      if (custom && style.phase !== 'warmup') playCustom(custom, nextStep, nextTime + audioOffset)
      else playStep(nextStep, nextTime + audioOffset, level)
    }
    onSchedule(event)
    queue.push(event)
    nextStep++
    nextTime += stepSeconds()
  }
}

export const conductor = {
  get bpm() {
    return bpm
  },
  /** The game sets this; the track follows on the next step. */
  setLevel(value: number, tempo: number) {
    level = value
    bpm = tempo
  },
  onSchedule(callback: (event: StepEvent) => void) {
    onSchedule = callback
  },
  setRate(value: number) {
    rate = value
  },
  /**
   * Switch the arrangement for a laser tier. 'intro' slides the music down
   * (a tape stop) and holds a pad; 'build' brings the new arrangement back in
   * over four bars as the filter opens; 'play' just switches.
   */
  setStyle(variant: number, phase: 'play' | 'intro' | 'build' | 'warmup', fromStep: number) {
    style = { variant: Math.max(0, Math.min(VARIANTS.length - 1, variant)), phase, from: fromStep }
    if (!ctx || !musicFilter) return
    const f = musicFilter.frequency
    const t = ctx.currentTime
    f.cancelScheduledValues(t)
    f.setValueAtTime(f.value, t)
    if (phase === 'intro') {
      f.exponentialRampToValueAtTime(260, t + 0.9)
      tapeStop(t, sfxBus)
    } else if (phase === 'warmup') {
      f.setValueAtTime(700, t)
    } else if (phase === 'build') {
      f.setValueAtTime(400, t)
      f.exponentialRampToValueAtTime(20000, t + stepSeconds() * 16 * BUILD_BARS)
    } else {
      f.setValueAtTime(20000, t)
    }
  },
  /**
   * The waiting music, while the briefing is up: the conductor runs (steps
   * pile up unused; the game is not running) and plays a muffled build. Play
   * starts the conductor afresh, and the game's first bars fade in from it.
   */
  warmup() {
    this.setLevel(0, 108)
    this.start(0)
    this.setStyle(0, 'warmup', 0)
  },
  /** Start the track; a replay starts mid-run, so bars stay in step with the game. */
  start(fromStep = 0) {
    ensure()
    if (ctx?.state === 'suspended') void ctx.resume().then(handOver)
    fallbackStart = performance.now()
    running = true
    audioOffset = 0
    clock = ctx?.state === 'running' ? 'audio' : 'timer'
    soundBlocked.value = clock === 'timer' && !!ctx
    queue.length = 0
    nextStep = fromStep
    nextTime = now() + 0.08
    timer ??= setInterval(schedule, 25)
    schedule()
  },
  pause() {
    if (!running) return
    running = false
    fallbackPausedAt = performance.now()
    pausedAtAudio = ctx?.currentTime ?? 0
    if (timer) clearInterval(timer)
    timer = null
    void ctx?.suspend()
  },
  resume() {
    if (running) return
    fallbackStart += performance.now() - fallbackPausedAt
    // The audio clock may have run while paused (previewing music in the editor): skip that time.
    if (ctx && clock === 'audio') audioOffset += ctx.currentTime - pausedAtAudio
    running = true
    if (clock === 'audio') void ctx?.resume()
    else void ctx?.resume().then(handOver)
    timer ??= setInterval(schedule, 25)
  },
  stop() {
    running = false
    soundBlocked.value = false
    if (timer) clearInterval(timer)
    timer = null
    queue.length = 0
    // Let scheduled notes ring out instead of cutting them.
    if (ctx?.state === 'suspended') void ctx.resume()
  },
}

/** A record slowing to a stop: a falling, darkening saw and a low thud. */
function tapeStop(t: number, bus: AudioNode) {
  const g = ctx!.createGain()
  const f = filter('lowpass', 2400, 1)
  f.frequency.setValueAtTime(2400, t)
  f.frequency.exponentialRampToValueAtTime(120, t + 0.9)
  f.connect(g).connect(bus)
  env(g, t, 0.22, 0.01, 0.95)
  for (const midi of [57, 64]) {
    const o = osc('sawtooth', hz(midi), t, 1, f)
    o.frequency.exponentialRampToValueAtTime(hz(midi) / 6, t + 0.95)
  }
}

/* ─── Game sounds ────────────────────────────────────────────────────── */

function sfx(play: (t: number, bus: AudioNode) => void, delay = 0) {
  if (!ensure() || !ctx) return
  play(ctx.currentTime + delay, sfxBus)
}

export const sound = {
  /** Schedule the laser's zap at the exact time of its beat. */
  zapAt: (time: number) => ctx && clock === 'audio' && zap(time + audioOffset, sfxBus),
  /** The charge-up, from now until the strike. */
  riser: (length: number) => sfx((t, bus) => riser(t, length, bus)),
  turn: () => sfx((t, bus) => hat(t, false, bus, 0.05)),
  eat: (rank = 0) =>
    sfx((t, bus) => {
      pluck(t, 72 + rank * 3, bus, 0.16)
      pluck(t + 0.06, 79 + rank * 3, bus, 0.14)
    }),
  pill: () =>
    sfx((t, bus) => {
      for (let i = 0; i < 4; i++) pluck(t + i * 0.05, 72 + i * 5, bus, 0.12)
    }),
  shield: () => sfx((t, bus) => stab(t, [76, 81, 84], bus)),
  /** A thud when the blade bites. */
  cut: () =>
    sfx((t, bus) => {
      const g = ctx!.createGain()
      g.connect(bus)
      env(g, t, 0.5, 0.002, 0.3)
      const o = osc('triangle', 180, t, 0.3, g)
      o.frequency.exponentialRampToValueAtTime(50, t + 0.25)
    }),
  /** A run of rising blips, one per severed cell as it pops. */
  pops: (count: number, delay: number, gap: number) =>
    sfx((t, bus) => {
      const scale = [0, 3, 5, 7, 10]
      for (let i = 0; i < Math.min(count, 24); i++) {
        const midi = 76 + scale[i % 5]! + 12 * Math.floor(i / 5)
        pluck(t + i * gap, Math.min(midi, 108), bus, 0.07)
      }
    }, delay),
  snip: () =>
    sfx((t, bus) => {
      hat(t, false, bus, 0.3)
      hat(t + 0.05, false, bus, 0.3)
    }),
  bonus: () =>
    sfx((t, bus) => {
      for (const [i, midi] of [72, 76, 79, 84].entries()) pluck(t + i * 0.06, midi, bus, 0.14)
    }),
  die: () =>
    sfx((t, bus) => {
      const g = ctx!.createGain()
      g.connect(bus)
      env(g, t, 0.4, 0.005, 0.9)
      const o = osc('sawtooth', 440, t, 0.9, g)
      o.frequency.exponentialRampToValueAtTime(40, t + 0.9)
    }),
  level: () => sfx((t, bus) => stab(t, [69, 72, 76, 81], bus)),
}
