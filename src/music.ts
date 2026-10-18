/**
 * Levels with their own music, written in Strudel (https://strudel.cc).
 *
 * Every level starts with the stock track written out as Strudel code: its
 * arrangement (key, chords, bass, drums, arpeggio) and the parts that come in
 * as levels climb. Edit it, or replace it, and that level plays your code.
 * One cycle is one bar; the tempo is the level's, so the music and the
 * lasers stay on the same beat.
 *
 * Strudel is loaded only when a level has its own music (or the editor
 * needs it). Code is compiled once into a pattern; the game's conductor then
 * asks the pattern for each 16th's notes as it schedules the beat, so the
 * music follows pause, replays and tempo exactly, and plays through the
 * game's music volume. Strudel is AGPL-3.0, and so is this game.
 */
import { musicOutput, setCustomMusic, VARIANTS, type Variant } from './audio'
import { tierOf } from './game'

/* ─── The stock track, as Strudel code ───────────────────────────────── */

const NAMES = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b']
const noteName = (midi: number) => `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`
const ARRANGEMENT_NAMES = [
  'Red: A minor, four on the floor',
  'Blue: D minor, rolling offbeat bass, rising arpeggio',
  'Purple: E phrygian, half-time and heavy',
  'White: C major, bright and quick',
  'Green: acid in A, one chord, a busy squelchy bass',
  'Gold: F major anthem, big chords',
  'Combos: F minor breakbeat',
  'Prism: everything, climbing a semitone every bar of four',
]

/** 16 steps as mini-notation: what each step plays, or ~ for a rest. */
const steps = (at: (s: number) => string | null) => Array.from({ length: 16 }, (_, s) => at(s) ?? '~').join(' ')
/** Four bars, one chord each, as <[bar] [bar] [bar] [bar]>. */
const bars = (bar: (chord: number) => string) => `<${[0, 1, 2, 3].map((c) => `[${bar(c)}]`).join(' ')}>`

/** The stock track for a level, written out as Strudel code. */
export function stockMusic(level: number): string {
  const variant = tierOf(level)
  const v: Variant = VARIANTS[variant]!
  const parts: string[] = []
  const hasKick = (s: number) => v.kickSteps.has(s) || (level >= 4 && s === 14)
  parts.push(`  // kick\n  s("${steps((s) => (hasKick(s) ? 'sbd' : null))}").gain(1.1)`)
  parts.push(
    `  // bass: the root of each bar's chord\n  note("${bars((c) => steps((s) => (v.bassSteps.has(s) ? noteName(v.roots[c]! + (s === 14 ? 12 : 0)) : null)))}")\n    .s("sawtooth").lpf(900).lpq(6).decay(0.18).sustain(0).gain(0.55)`,
  )
  if (level >= 1)
    parts.push(`  // open hats\n  s("${steps((s) => (s % 4 === 2 ? 'white' : null))}").hpf(7500).decay(0.12).sustain(0).gain(0.22)`)
  if (level >= 3)
    parts.push(`  // closed hats\n  s("${steps((s) => (s % 2 === 1 ? 'white' : null))}").hpf(8000).decay(0.03).sustain(0).gain(0.14)`)
  if (level >= 2)
    parts.push(`  // claps\n  s("${steps((s) => (v.clapSteps.has(s) ? 'pink' : null))}").bpf(1400).decay(0.14).sustain(0).gain(0.5)`)
  if (level >= 2) {
    const arpNote = (c: number, s: number) => {
      if (level < 3 && s % 2) return null
      const pick = v.arp[s % 8]!
      const chord = v.chords[c]!
      const base = pick === 3 ? chord[0]! + 12 : chord[pick]!
      return noteName(base + 12 + v.lift + (level >= 5 && s >= 8 ? 12 : 0) - (v.lift && level >= 5 ? 12 : 0))
    }
    parts.push(
      `  // arpeggio over the chords\n  note("${bars((c) => steps((s) => arpNote(c, s)))}")\n    .s("${v.lead}").lpf(3200).decay(0.16).sustain(0).gain(${v.lead === 'sine' || v.lead === 'triangle' ? 0.4 : 0.25})`,
    )
  }
  if (level >= 4) {
    const chord = (c: number) => `[${v.chords[c]!.map(noteName).join(',')}]`
    parts.push(
      `  // chord stabs\n  note("${bars((c) => steps((s) => (s === 0 || s === 6 ? chord(c) : null)))}")\n    .s("sawtooth").lpf(2400).decay(0.45).sustain(0).gain(0.15)`,
    )
  }
  return [
    `// Level ${level + 1}: ${ARRANGEMENT_NAMES[variant]}`,
    '// One cycle is one bar. The tempo is the level\'s own, so this stays on the beat.',
    'stack(',
    parts.join(',\n'),
    ')',
    '',
  ].join('\n')
}

/* ─── Strudel, loaded on demand ──────────────────────────────────────── */

type StrudelWeb = typeof import('@strudel/web')
interface Pattern {
  queryArc: (begin: number, end: number, state?: object) => {
    whole?: { begin: { valueOf(): number }; end: { valueOf(): number } }
    hasOnset: () => boolean
    duration: { valueOf(): number }
    value: unknown
  }[]
}
interface Repl {
  /** The pattern, or nothing when the code failed (the reason is in `state.evalError`). */
  evaluate: (code: string, autostart?: boolean) => Promise<Pattern | undefined>
  state: { evalError?: Error }
  scheduler: { stop: () => void; setCps: (cps: number) => void }
  start: () => void
  stop: () => void
}

let loading: Promise<{ web: StrudelWeb; repl: Repl }> | null = null

/** Load Strudel, on the game's audio context, playing into its music bus. */
export function loadStrudel() {
  loading ??= (async () => {
    const out = musicOutput()
    if (!out) throw new Error('this browser has no Web Audio')
    const web = await import('@strudel/web')
    web.setAudioContext(out.ctx)
    const repl = (await web.initStrudel()) as unknown as Repl
    await web.initAudio().catch(() => {})
    // Send Strudel's sound through the game's music bus: its volume, mute and tape stops apply.
    const output = (web.getSuperdoughAudioController() as unknown as { output: { destinationGain: GainNode } }).output
    output.destinationGain.disconnect()
    output.destinationGain.connect(out.bus)
    return { web, repl }
  })()
  return loading
}

/** Compiled code, by its text: a pattern, or what went wrong. */
const compiled = new Map<string, Pattern | Error>()
/** One at a time: Strudel's evaluation sets shared state. */
let compiling: Promise<unknown> = Promise.resolve()

export function compile(code: string): Promise<Pattern | Error> {
  const done = compiled.get(code)
  if (done) return Promise.resolve(done)
  const run = compiling.then(async () => {
    const { repl } = await loadStrudel()
    try {
      repl.scheduler.stop()
      const pattern = await repl.evaluate(code, false)
      if (!pattern) throw repl.state.evalError ?? new Error('the code made no pattern')
      // Ask it for a bar now, so mistakes that only show when playing show here.
      pattern.queryArc(0, 1, { _cps: 0.5 })
      compiled.set(code, pattern)
      return pattern
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      compiled.set(code, error)
      return error
    }
  })
  compiling = run.catch(() => {})
  return run
}

/** The compile result if it is ready, without waiting. */
export const compiledNow = (code: string) => compiled.get(code)

function asMusic(pattern: Pattern, web: StrudelWeb, from: number) {
  return {
    from,
    notes: (begin: number, end: number, cps: number) =>
      pattern
        .queryArc(begin, end, { _cps: cps })
        .filter((hap) => hap.hasOnset() && hap.whole)
        .map((hap) => ({
          at: hap.whole!.begin.valueOf(),
          length: hap.duration.valueOf(),
          play: (t: number, length: number, cps: number) =>
            void web.superdough(hap.value as Record<string, unknown>, t, length, cps, hap.whole!.begin.valueOf()),
        })),
  }
}

let web: StrudelWeb | null = null
/** The code playing now, to switch only when it changes. */
let playing: string | null = null

/**
 * The game reached a level: play its own music if it has some (from this
 * step, so its bars line up with the level's), or the stock track. Code that
 * is still compiling, or does not compile, leaves the stock track on.
 */
export function musicForLevel(code: string | undefined, fromStep: number) {
  if (!code) {
    playing = null
    setCustomMusic(null)
    return
  }
  if (code === playing) return
  playing = code
  const ready = compiled.get(code)
  if (ready && web) {
    setCustomMusic(ready instanceof Error ? null : asMusic(ready, web, fromStep))
    return
  }
  setCustomMusic(null)
  void compile(code).then(async (pattern) => {
    web ??= (await loadStrudel()).web
    if (playing === code && !(pattern instanceof Error)) setCustomMusic(asMusic(pattern, web, fromStep))
  })
}

/** Get a game's music ready before it is needed. */
export function warmUp(codes: string[]) {
  if (!codes.length) return
  void loadStrudel().then(({ web: w }) => {
    web = w
    for (const code of codes) void compile(code)
  })
}

/* ─── What a pattern plays, for the editor's block view ──────────────── */

export interface Block {
  /** Cycle (bar) it starts in, and how long, in cycles. */
  begin: number
  length: number
  /** Which row: the sound it plays. */
  lane: string
  /** A pitch for synth notes, to shade them; null for drums and noise. */
  pitch: number | null
}

const NOTE_NAMES: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }
function pitchOf(note: unknown): number | null {
  if (typeof note === 'number') return note
  if (typeof note !== 'string') return null
  const m = note.toLowerCase().match(/^([a-g])(#|b|s)?(-?\d)?$/)
  if (!m) return null
  return NOTE_NAMES[m[1]!]! + (m[2] === '#' || m[2] === 's' ? 1 : m[2] === 'b' ? -1 : 0) + 12 * (Number(m[3] ?? 3) + 1)
}

/** The notes a piece of code plays over its first `cycles` bars, as blocks; or what went wrong. */
export async function patternBlocks(code: string, cycles = 4): Promise<Block[] | Error> {
  const pattern = await compile(code)
  if (pattern instanceof Error) return pattern
  try {
    return pattern
      .queryArc(0, cycles, { _cps: 0.5 })
      .filter((hap) => hap.hasOnset() && hap.whole)
      .map((hap) => {
        const v = (hap.value ?? {}) as Record<string, unknown>
        return {
          begin: hap.whole!.begin.valueOf(),
          length: hap.duration.valueOf(),
          lane: String(v.s ?? (v.note !== undefined || v.n !== undefined ? 'triangle' : 'sound')),
          pitch: pitchOf(v.note ?? v.n),
        }
      })
  } catch (err) {
    return err instanceof Error ? err : new Error(String(err))
  }
}

/* ─── Previewing in the editor ───────────────────────────────────────── */

let previewing = false
/** Where the preview is, in cycles (bars) since it started; null when not playing. */
export function previewNow(): number | null {
  if (!previewing || !loading) return null
  const sched = (lastRepl as (Repl & { scheduler: { now: () => number } }) | null)?.scheduler
  return sched ? sched.now() : null
}
let lastRepl: Repl | null = null


/** Play code on its own (the game is paused), at a tempo; null stops. */
export async function preview(code: string | null, bpm = 120): Promise<Error | null> {
  const { repl } = await loadStrudel()
  lastRepl = repl
  repl.stop()
  previewing = false
  if (code === null) return null
  const out = musicOutput()
  if (out?.ctx.state === 'suspended') await out.ctx.resume()
  try {
    if (!(await repl.evaluate(code, false))) throw repl.state.evalError ?? new Error('the code made no pattern')
    repl.scheduler.setCps(bpm / 240)
    repl.start()
    previewing = true
    return null
  } catch (err) {
    return err instanceof Error ? err : new Error(String(err))
  }
}
