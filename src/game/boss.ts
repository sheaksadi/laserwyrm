/**
 * Bosses: a Warden guards each new kind of laser, on the level before it. It
 * fires that laser's tricks in volleys, then its core lies open for two bars:
 * run into it to hurt it, or dash into it for double. The next level waits
 * until the Warden is beaten or gives up.
 */
import { BOSS, BOSS_NAMES, COMBO_LEVEL, ENERGY, laserTiers, laserTraits, PRISM_LEVEL, type Boss, type LaserTrait, type Vec } from './catalog'
import { addItem, banner, popup } from './board'
import { maxHearts } from './curve'
import { die } from './hits'
import { kindOf, spawnLaser } from './lasers'
import { spawnMini } from './people'
import { multiplier } from './levels'
import { rand, random } from './rng'
import { cheats, feel, isActive, later, mark, match, sound, spark, state, worldSlowed } from './state'

/** The cell is under the boss: three by three around its middle. */
export const onBoss = (cell: Vec, boss: Vec) => Math.abs(cell.x - boss.x) <= 1 && Math.abs(cell.y - boss.y) <= 1

/** What a level's Warden fires: the tricks arriving on the next level. */
function bossTraits(level: number): LaserTrait[] {
  const table = laserTraits()
  const own = (Object.keys(table) as LaserTrait[]).filter((t) => table[t].unlock === level + 1)
  if (own.length) return own
  if (level + 1 === COMBO_LEVEL) return ['wide', 'repeat']
  if (level + 1 === PRISM_LEVEL) return ['wide', 'cross', 'repeat']
  return []
}

/** Somewhere to go: well inside the board, and away from the head if it can be. */
function pickSpot(): Vec {
  const head = state.snake[0]!
  let spot = { x: 0, y: 0 }
  for (let i = 0; i < 6; i++) {
    spot = { x: 3 + rand(state.cols - 6), y: 3 + rand(state.rows - 6) }
    if (Math.abs(spot.x - head.x) + Math.abs(spot.y - head.y) >= 12) break
  }
  return spot
}

/** Bring on a level's Warden: it flies in on the far side from the head, and the board clears for it. */
export function startBoss(level: number) {
  const traits = bossTraits(level)
  const kind = kindOf(traits)
  // Later Wardens look far worse, but take only a little more to beat.
  const stage = Math.max(1, laserTiers().findIndex((t) => t.level === level + 1))
  const maxHp = Math.min(5, 3 + Math.floor(stage / 3))
  const head = state.snake[0]!
  const x = Math.floor(state.cols * (head.x < state.cols / 2 ? 0.75 : 0.25))
  const y = Math.floor(state.rows / 2)
  state.boss = {
    id: level + 1,
    name: BOSS_NAMES[kind],
    kind,
    traits,
    x,
    y,
    goal: { x, y },
    hp: maxHp,
    maxHp,
    phase: 'enter',
    until: state.step + BOSS.enterSteps,
    volleys: 0,
    nextShot: 0,
    round: 0,
    graceUntil: 0,
    giveUp: state.step + BOSS.maxSteps,
    hits: 0,
    stage,
  }
  state.lasers = state.lasers.filter((l) => l.struck)
  state.snipper.active = false
  state.shake++
  sound.bossEnter()
  feel('level')
  mark('boss')
}

function startAttack(boss: Boss, first: number) {
  boss.phase = 'attack'
  boss.volleys = BOSS.volleys + Math.min(2, boss.round)
  boss.nextShot = first
  boss.round++
  boss.goal = pickSpot()
  // From the third Warden on, each attack brings a little one out.
  if (boss.stage >= 3) spawnMini(boss.kind, boss)
}

/** One volley, aimed at the head: its row or its column, and later both. */
function fire(boss: Boss) {
  const head = state.snake[0]!
  const row = random() < 0.5
  spawnLaser(row ? { axis: 'row', index: head.y } : { axis: 'col', index: head.x }, boss.traits)
  if (boss.round > 1 && random() < 0.4) spawnLaser(row ? { axis: 'col', index: head.x } : { axis: 'row', index: head.y }, boss.traits)
}

/** The boss's beat: it drifts a cell toward its goal, never onto the head, and fires when a volley is due. */
export function bossBeat(step: number) {
  const boss = state.boss
  if (!boss || boss.phase !== 'attack') return
  if (worldSlowed() && (step / 4) % 2 === 1) return
  const next = { x: boss.x + Math.sign(boss.goal.x - boss.x), y: boss.y + Math.sign(boss.goal.y - boss.y) }
  if (next.x === boss.x && next.y === boss.y) boss.goal = pickSpot()
  else if (!onBoss(state.snake[0]!, next)) Object.assign(boss, next)
  if (boss.volleys <= 0 || step < boss.nextShot) return
  boss.volleys--
  boss.nextShot = step + BOSS.volleyGap
  // Wizard cookies and laser-free play spend the volley all the same, so the core still opens.
  if (step >= state.wizardUntil && !cheats.noLasers && !match.calm) fire(boss)
}

/** The boss's step: move on to its next phase when the time comes. */
export function bossStep(step: number) {
  const boss = state.boss
  if (!boss) return
  if (boss.phase === 'attack') {
    if (step >= boss.giveUp) return leave(boss, step)
    if (boss.volleys > 0 || state.lasers.some((l) => !l.struck)) return
    boss.phase = 'open'
    boss.until = step + BOSS.openSteps
    sound.bossOpen()
    popup({ x: boss.x, y: boss.y - 2 }, 'core open!', 'sun')
    return
  }
  // Coming apart: small blasts around its shell, in turn.
  if (boss.phase === 'dying' && step % 4 === 0) spark({ x: boss.x + ((step / 4) % 3) - 1, y: boss.y + ((step / 8) % 3 | 0) - 1 }, 'coral')
  if (step < boss.until) return
  if (boss.phase === 'enter') startAttack(boss, step)
  else if (boss.phase === 'open') startAttack(boss, step + BOSS.volleyGap)
  else if (boss.phase === 'dying') defeat(boss)
  else state.boss = null
}

function leave(boss: Boss, step: number) {
  boss.phase = 'leaving'
  boss.until = step + BOSS.leavingSteps
  banner(`${boss.name} leaves`, 'it will not wait forever')
}

/** The head has reached `cell`: an open core takes the hit; a closed shell hurts, unless the snake dashed in. */
export function touchBoss(cell: Vec, dashed: boolean) {
  const boss = state.boss
  if (!boss || !onBoss(cell, boss)) return
  if (boss.phase === 'open') return hitBoss(boss, cell, dashed ? BOSS.dashDamage : 1)
  if (boss.phase !== 'attack' || state.step < boss.graceUntil) return
  boss.graceUntil = state.step + BOSS.graceSteps
  if (dashed || isActive('ghost') || cheats.god) return
  if (isActive('shield')) {
    state.effects.shield = 0
    state.stats.blocked++
    sound.shield()
    feel('block')
    popup(cell, 'blocked', 'sky')
    return
  }
  state.hearts--
  state.shake++
  state.hurts++
  sound.cut()
  feel('hurt', state.hearts)
  mark('hurt')
  popup(cell, '−1 life', 'coral')
  if (state.hearts <= 0) die('ran into a Warden')
}

function hitBoss(boss: Boss, cell: Vec, damage: number) {
  boss.hp = Math.max(0, boss.hp - damage)
  boss.hits++
  state.score += multiplier() * 4
  state.shake++
  spark(cell, 'sun', true)
  sound.bossHit()
  feel('cut', 6)
  popup({ x: boss.x, y: boss.y - 2 }, damage > 1 ? 'critical!' : 'hit!', 'sun')
  if (boss.hp <= 0) {
    boss.phase = 'dying'
    boss.until = state.step + BOSS.dyingSteps
    state.lasers = state.lasers.filter((l) => l.struck)
    sound.bossDie()
    return
  }
  // Hurt, it warps away and comes back harder.
  boss.graceUntil = state.step + BOSS.graceSteps
  Object.assign(boss, pickSpot())
  startAttack(boss, state.step + BOSS.volleyGap)
}

/** The Warden comes apart: a big score, a heart, full energy and a star to eat. */
function defeat(boss: Boss) {
  state.boss = null
  state.stats.bosses++
  state.score += multiplier() * 32
  state.hearts = Math.min(maxHearts(), state.hearts + 1)
  state.energy = ENERGY.max
  state.calmUntil = state.step + 32
  state.shake++
  spark(boss, 'sun', true)
  state.bursts.push({ id: -boss.id, x: boss.x, y: boss.y })
  later(900, () => (state.bursts = state.bursts.filter((b) => b.id !== -boss.id)))
  addItem('star', 64)
  sound.level()
  feel('level')
  mark('boss')
  banner(`${boss.name} down`, '+1 heart · energy full')
}
