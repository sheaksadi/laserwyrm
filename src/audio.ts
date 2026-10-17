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
let sfxBus: GainNode
let noise: AudioBuffer

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
  musicBus.connect(master)
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

// A minor: Am, F, C, G. Roots as MIDI notes in octave 2.
const ROOTS = [45, 41, 48, 43]
const CHORDS = [
  [57, 60, 64], // Am
  [53, 57, 60], // F
  [55, 60, 64], // C
  [55, 59, 62], // G
]
const BASS_STEPS = new Set([0, 3, 6, 8, 10, 11, 14])
const ARP = [0, 1, 2, 1, 2, 0, 1, 2]

function playStep(step: number, t: number, level: number) {
  const bus = musicBus
  const s = step % 16
  const bar = Math.floor(step / 16)
  const chord = bar % 4
  const sd = stepSeconds()

  // Kick on every beat, plus a pickup at higher levels.
  if (s % 4 === 0 || (level >= 4 && s === 14)) kick(t, bus)
  // Bass from the first bar: a pumping line on the chord root.
  if (BASS_STEPS.has(s)) bass(t, ROOTS[chord]! + (s === 14 ? 12 : 0), sd * 1.6, bus)
  // Hats come in at level 1, go 16ths at level 3.
  if (level >= 1 && s % 4 === 2) hat(t, true, bus)
  if (level >= 3 && s % 2 === 1) hat(t, false, bus, 0.06)
  // Clap on 2 and 4 from level 2.
  if (level >= 2 && (s === 4 || s === 12)) clap(t, bus)
  // Arpeggio from level 2, an octave higher from level 5.
  if (level >= 2 && (level >= 3 || s % 2 === 0)) {
    const note = CHORDS[chord]![ARP[s % 8]!]! + (level >= 5 && s >= 8 ? 12 : 0)
    pluck(t, note + 12, bus)
  }
  // Chord stabs at level 4.
  if (level >= 4 && (s === 0 || s === 6)) stab(t, CHORDS[chord]!, bus)
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

export function now(): number {
  if (ctx) return ctx.currentTime
  return ((running ? performance.now() : fallbackPausedAt) - fallbackStart) / 1000
}

function schedule() {
  while (nextTime < now() + LOOKAHEAD) {
    const event = { step: nextStep, time: nextTime }
    if (ctx) playStep(nextStep, nextTime, level)
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
  /** Start the track; a replay starts mid-run, so bars stay in step with the game. */
  start(fromStep = 0) {
    ensure()
    if (ctx?.state === 'suspended') void ctx.resume()
    fallbackStart = performance.now()
    running = true
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
    if (timer) clearInterval(timer)
    timer = null
    void ctx?.suspend()
  },
  resume() {
    if (running) return
    fallbackStart += performance.now() - fallbackPausedAt
    running = true
    void ctx?.resume()
    timer ??= setInterval(schedule, 25)
  },
  stop() {
    running = false
    if (timer) clearInterval(timer)
    timer = null
    queue.length = 0
    // Let scheduled notes ring out instead of cutting them.
    if (ctx?.state === 'suspended') void ctx.resume()
  },
}

/* ─── Game sounds ────────────────────────────────────────────────────── */

function sfx(play: (t: number, bus: AudioNode) => void, delay = 0) {
  if (!ensure() || !ctx) return
  play(ctx.currentTime + delay, sfxBus)
}

export const sound = {
  /** Schedule the laser's zap at the exact time of its beat. */
  zapAt: (time: number) => ctx && zap(time, sfxBus),
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
