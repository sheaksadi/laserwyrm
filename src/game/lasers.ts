/**
 * Lasers: which tricks a new one gets, where it lands, green ones drifting
 * toward the head, and the strike (slicing the body, hurting the head,
 * zapping the snipper).
 */
import { stepSeconds } from '../audio'
import { editOf, live } from '../design'
import { BOLT_MS, COMBO_LEVEL, LASER_TRAITS, PRISM_LEVEL, SNIPPER_RESPAWN_STEPS, type Beam, type Laser, type LaserKind, type LaserTrait, type Vec } from './catalog'
import { popup } from './board'
import { warnFor } from './curve'
import { cut, die } from './hits'
import { pick, rand, random } from './rng'
import { cheats, feel, isActive, later, mark, run, sound, state } from './state'

export const inBeam = (cell: Vec, beam: Beam) =>
  Math.abs((beam.axis === 'row' ? cell.y : cell.x) - beam.index) <= (beam.width - 1) / 2
export const onLine = (cell: Vec, laser: Laser) => laser.beams.some((beam) => inBeam(cell, beam))
export const warnSteps = () => warnFor(state.level)

/** Which tricks a new laser gets: more of them, and more often, the higher the level. */
export function rollTraits(): LaserTrait[] {
  const level = state.level
  const own = editOf(live(), level).traits
  if (own) {
    // A level with its own pick: about two in three lasers get one of its tricks, now and then two.
    const open = own
    if (!open.length || random() > 0.65) return []
    const first = pick(open)
    const second = open.length > 1 && random() < 0.3 ? pick(open.filter((t) => t !== first)) : null
    return second ? [first, second] : [first]
  }
  const open = (Object.keys(LASER_TRAITS) as LaserTrait[]).filter((t) => LASER_TRAITS[t].unlock <= level)
  if (!open.length) return []
  const newest = open[open.length - 1]!
  const roll = random()
  let count = 0
  if (level >= PRISM_LEVEL && roll < 0.35) count = 3
  else if (level >= COMBO_LEVEL && roll < 0.45) count = 2
  else if (roll < Math.min(0.8, 0.4 + (level - 10) * 0.01)) count = 1
  const traits: LaserTrait[] = []
  // A freshly unlocked trick turns up often, so the player meets it.
  if (count && random() < 0.5) traits.push(newest)
  while (traits.length < Math.min(count, open.length)) {
    const t = pick(open)
    if (!traits.includes(t)) traits.push(t)
  }
  return traits
}

export function kindOf(traits: LaserTrait[]): LaserKind {
  if (traits.length >= 3) return 'prism'
  if (!traits.length) return 'red'
  // Two tricks wear the colour of the later one.
  const latest = traits.reduce((a, b) => (LASER_TRAITS[b].unlock > LASER_TRAITS[a].unlock ? b : a))
  return LASER_TRAITS[latest].kind
}

export function spawnLaser(forced?: Pick<Beam, 'axis' | 'index'>) {
  const head = state.snake[0]!
  const body = state.snake.slice(2)
  const busy = (axis: Beam['axis'], index: number) =>
    state.lasers.some((l) => !l.struck && l.beams.some((b) => b.axis === axis && b.index === index))

  // Half the time the laser runs along the line the snake travels on: turn
  // off it in time and only the tail still on it gets sliced. Otherwise it
  // crosses the body somewhere, or lands anywhere.
  for (let attempt = 0; attempt < 12; attempt++) {
    let axis: Beam['axis']
    let index: number
    let target: Vec = head
    const roll = random()
    if (forced && attempt === 0) {
      axis = forced.axis
      index = forced.index
    } else if (roll < 0.5 && attempt === 0) {
      axis = state.direction.x ? 'row' : 'col'
      index = axis === 'row' ? head.y : head.x
    } else if (roll < 0.85 && body.length) {
      target = pick(body)
      axis = random() < 0.5 ? 'row' : 'col'
      index = axis === 'row' ? target.y : target.x
    } else {
      axis = random() < 0.5 ? 'row' : 'col'
      index = rand(axis === 'row' ? state.rows : state.cols)
      target = { x: rand(state.cols), y: rand(state.rows) }
    }
    if (busy(axis, index)) continue

    const traits = rollTraits()
    const width = traits.includes('wide') ? 3 : 1
    const beams: Beam[] = [{ axis, index, width, bolt: '' }]
    // A cross adds the other direction through the same target.
    if (traits.includes('cross')) {
      const other = axis === 'row' ? 'col' : 'row'
      beams.push({ axis: other, index: other === 'row' ? target.y : target.x, width, bolt: '' })
    }
    const steps = traits.includes('fast') ? Math.max(4, warnSteps() / 2) : warnSteps()
    const warnSec = steps * stepSeconds()
    state.lasers.push({
      id: ++run.uid,
      kind: kindOf(traits),
      beams,
      traits,
      strikeStep: state.step + steps,
      warnMs: warnSec * 1000,
      struck: false,
      from: random() < 0.5 ? 'start' : 'end',
      echo: false,
    })
    sound.riser(warnSec)
    return { axis, index }
  }
  return null
}

/** Green lasers drift one cell toward the head each beat, until the last beat of their fuse. */
export function trackLasers() {
  const head = state.snake[0]!
  for (const laser of state.lasers) {
    if (laser.struck || !laser.traits.includes('track') || laser.strikeStep - state.step <= 4) continue
    for (const beam of laser.beams) {
      const goal = beam.axis === 'row' ? head.y : head.x
      beam.index += Math.sign(goal - beam.index)
    }
  }
}

export function boltPoints(beam: Beam): string {
  const length = beam.axis === 'row' ? state.cols : state.rows
  const points: string[] = []
  for (let i = 0; i <= length; i += 0.5) {
    const jitter = i === 0 || i >= length ? 0 : (random() - 0.5) * 0.7 * beam.width
    const across = beam.index + 0.5 + jitter
    points.push(beam.axis === 'row' ? `${i},${across}` : `${across},${i}`)
  }
  return points.join(' ')
}

export function strike(laser: Laser) {
  laser.struck = true
  for (const beam of laser.beams) beam.bolt = boltPoints(beam)
  later(BOLT_MS, () => (state.lasers = state.lasers.filter((l) => l.id !== laser.id)))

  // Gold lasers fire again on the same lines a beat later.
  if (laser.traits.includes('repeat') && !laser.echo) {
    const warnSec = 4 * stepSeconds()
    state.lasers.push({
      ...laser,
      id: ++run.uid,
      beams: laser.beams.map((b) => ({ ...b, bolt: '' })),
      strikeStep: state.step + 4,
      warnMs: warnSec * 1000,
      struck: false,
      echo: true,
    })
    sound.riser(warnSec)
  }

  const s = state.snipper
  if (s.active && onLine(s, laser)) {
    s.active = false
    s.until = state.step + SNIPPER_RESPAWN_STEPS
    state.grow += 2
    popup(s, '+2 × zapped', 'lavender')
  }

  if (cheats.god) return
  const headHit = onLine(state.snake[0]!, laser)
  const index = state.snake.findIndex((cell, i) => i > 0 && onLine(cell, laser))
  if (!headHit && index < 0) return
  if (isActive('shield')) {
    state.effects.shield = 0
    state.stats.blocked++
    sound.shield()
    feel('block')
    popup(state.snake[0]!, 'blocked', 'sky')
    return
  }
  if (index > 0) cut(index)
  // The body can be sliced freely; only the head costs a heart.
  if (headHit) {
    state.hearts--
    feel('hurt', state.hearts)
    mark('hurt')
    state.shake++
    popup(state.snake[0]!, '−1 life', 'coral')
    if (state.hearts <= 0) die('ran out of hearts')
  }
}
