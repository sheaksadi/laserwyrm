/**
 * Levels in play: the rules that depend on the run (edges, hearts back,
 * intros), the score multiplier, and arriving at a level (tempo, walls,
 * music, the notice for a new kind of laser, or a two-bar intro).
 */
import { conductor } from '../audio'
import { editOf, live, type Edges } from '../design'
import { musicForLevel } from '../music'
import { CALM_STEPS, INTRO_STEPS, laserTiers, revision, TIER_NOTE_MS, tierOf } from './catalog'
import { banner, popup, setWalls } from './board'
import { armedFor, backgroundFor, barsFor, gameRules, intensity, lasersFor, maxHearts, musicFor, snipperFor, startHearts, tempoFor, traitsFor, warnFor } from './curve'
import { feel, isActive, later, mark, run, sound, state } from './state'

export const edgesFor = (level: number): Edges => editOf(live(), level).edges ?? (state.mode === 'hardcore' ? 'kill' : 'wrap')

/** Hearts back on reaching a level: normal play refills one, up to the starting three. */
export const healFor = (level: number) =>
  editOf(live(), level).heal ?? (state.mode === 'normal' && state.hearts < startHearts() ? gameRules().refill : 0)
/** Stop to introduce a level: stock does it for each new kind of laser, in normal play. */
export const isTierLevel = (level: number) => level > 0 && laserTiers().some((t) => t.level === level)
/** Stop to introduce a level: a level that asks for it; before revision 3, each new kind of laser in normal play. */
export const introFor = (level: number) =>
  editOf(live(), level).intro ?? (revision.rev < 3 && state.mode === 'normal' && isTierLevel(level))

/**
 * How a level plays by the current design, for the editor: every value, and
 * whether the level sets it itself or follows the curve.
 */
export const levelPlan = (level: number) => {
  const e = editOf(live(), level)
  return {
    intensity: intensity(level),
    bpm: tempoFor(level),
    lasers: lasersFor(level),
    armed: armedFor(level),
    warn: warnFor(level),
    bars: barsFor(level),
    traits: traitsFor(level),
    edges: edgesFor(level),
    snipper: snipperFor(level),
    heal: e.heal ?? (state.mode === 'normal' ? gameRules().refill : 0),
    intro: introFor(level),
    calm: e.calm ?? (introFor(level) ? CALM_STEPS / 16 : 0),
    score: e.score ?? 1,
  }
}
/** Older name, for the global tab. */
export const levelFeel = levelPlan

/**
 * Points scored per beat. Each cell is worth more the longer the snake is
 * (length × (1 + length / 20)), and every level adds another quarter on top,
 * so growing pays off most late in the game. The yellow pill doubles it.
 */
export const multiplier = () => {
  const length = state.snake.length
  const perLength = length * (1 + length / 20)
  const perLevel = 1 + state.level * 0.25
  const own = editOf(live(), state.level).score ?? 1
  return Math.round(perLength * perLevel * own) * (isActive('double') ? 2 : 1)
}

export function applyLevel(level: number) {
  state.level = level
  state.bpm = tempoFor(level)
  conductor.setLevel(level, state.bpm)
  musicForLevel(musicFor(level), state.step, backgroundFor(level))
}

/**
 * Arrive at a new level: tempo, walls, hearts, and for a new kind of laser
 * (or a level that asks), an intro. True when an intro started: that bar
 * then drops nothing.
 */
export function enterLevel(level: number): boolean {
  const e = editOf(live(), level)
  applyLevel(level)
  setWalls(level)
  if (snipperFor(level) === 0) state.snipper.active = false
  sound.level()
  feel('level')
  mark('level')
  const tierIndex = laserTiers().findIndex((t) => t.level === level && level > 0)
  if (introFor(level)) {
    startIntro(tierIndex > 0 ? tierIndex : tierOf(level))
    return true
  }
  // A new kind of laser, without stopping: in normal play the new arrangement builds in and the lasers ease in.
  const easeIn = tierIndex > 0 && state.mode === 'normal'
  if (tierIndex > 0) conductor.setStyle(tierIndex, easeIn ? 'build' : 'play', state.step)
  if (easeIn) state.calmUntil = state.step + CALM_STEPS
  if (e.calm !== undefined) state.calmUntil = state.step + e.calm * 16
  const heal = Math.min(healFor(level), maxHearts() - state.hearts)
  if (heal > 0) {
    state.hearts += heal
    popup(state.snake[0]!, `+${heal} ${heal === 1 ? 'life' : 'lives'}`, 'coral')
    mark('heal')
  }
  const tier = laserTiers().find((t) => t.level === level && level > 0)
  if (tierIndex > 0) {
    // Announce it the way items are announced: a notice from the top.
    const id = ++run.uid
    state.tierNote = { id, tier: tierIndex, healed: heal > 0 }
    later(TIER_NOTE_MS, () => {
      if (state.tierNote?.id === id) state.tierNote = null
    })
  }
  const sub = e.name ?? (tier ? `${tier.name}: ${tier.blurb}` : `${state.bpm} bpm · more lasers`)
  banner(`Level ${level + 1}`, heal > 0 ? `${sub} · +${heal} heart${heal === 1 ? '' : 's'}` : sub)
  return false
}

/** Freeze play and introduce a new kind of laser. Everything timed in steps waits it out. */
export function startIntro(tier: number) {
  const until = state.step + INTRO_STEPS
  const heal = Math.min(healFor(state.level), maxHearts() - state.hearts)
  const healed = heal > 0
  state.intro = { tier, until, healed }
  state.pausedBars += INTRO_STEPS / 16
  state.lasers = state.lasers.filter((l) => l.struck)
  for (const key of Object.keys(state.effects) as (keyof typeof state.effects)[]) {
    if (state.effects[key] > state.step) state.effects[key] += INTRO_STEPS
  }
  for (const item of state.items) if (item.until !== null) item.until += INTRO_STEPS
  if (state.wizardUntil > state.step) state.wizardUntil += INTRO_STEPS
  state.snipper.until += INTRO_STEPS
  state.hearts += heal
  conductor.setStyle(tier, 'intro', state.step)
  mark('level')
}

export function endIntro(step: number) {
  const tier = state.intro!.tier
  state.intro = null
  state.calmUntil = step + (editOf(live(), state.level).calm ?? CALM_STEPS / 16) * 16
  conductor.setStyle(tier, 'build', step)
}
