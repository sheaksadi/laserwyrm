/**
 * The board's small life (revision 9). Humans run from the snake and learn
 * new tricks as the levels climb; caught, they are worth points and a cell.
 * Minis are little glowing Wardens: they creep to the snake's middle and bite
 * through it, unless the head eats them first. Neither turns up in a match.
 */
import { MINIS, PEOPLE, QUIPS, DIRS, TACTICS, laserTiers, revision, tierOf, type Laser, type LaserKind, type Mini, type Person, type Tactic, type Vec } from './catalog'
import { freeCell, isWall, popup } from './board'
import { onBoss } from './boss'
import { cut } from './hits'
import { gainEnergy } from './items'
import { onLine } from './lasers'
import { multiplier } from './levels'
import { pick, random } from './rng'
import { feel, match, run, same, sound, spark, state, worldSlowed } from './state'

const peopleOn = () => revision.rev >= 9 && !match.on
const far = (a: Vec, b: Vec) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)

/** A human can stand here: on the board, clear of walls, the snake, the boss and other humans. */
function open(cell: Vec) {
  if (cell.x < 0 || cell.y < 0 || cell.x >= state.cols || cell.y >= state.rows || isWall(cell)) return false
  if (state.boss && onBoss(cell, state.boss)) return false
  return !state.snake.some((c) => same(c, cell)) && !state.people.some((p) => same(p, cell))
}

/* ─── Humans ─── */

/** A new human, with one of the tricks known by this level; the newest turns up most. */
function spawnPerson(level: number) {
  const known = TACTICS.filter((t) => t.level <= level).map((t) => t.tactic)
  const tactic: Tactic = random() < 0.5 ? known[known.length - 1]! : pick(known)
  state.people.push({
    id: ++run.uid,
    ...freeCell(),
    tactic,
    facing: 1,
    disguised: tactic === 'fruit',
    fake: false,
    spoke: false,
    ready: 0,
    flame: 0,
    until: state.step + PEOPLE.life,
  })
}

/** One cell away from the head, or a stroll when it is far off. */
function flee(p: Person, head: Vec) {
  const options = Object.values(DIRS)
    .map((d) => ({ x: p.x + d.x, y: p.y + d.y }))
    .filter(open)
  if (!options.length) return
  const next = far(p, head) > 10 ? (random() < 0.3 ? pick(options) : null) : options.reduce((a, b) => (far(b, head) > far(a, head) ? b : a))
  if (!next) return
  if (next.x !== p.x) p.facing = Math.sign(next.x - p.x)
  p.x = next.x
  p.y = next.y
}

/** Dive two cells to the side of the snake's way. */
function dive(p: Person) {
  const { x, y } = state.direction
  for (const side of [1, -1]) {
    const cell = { x: p.x + y * side * 2, y: p.y + x * side * 2 }
    if (!open(cell)) continue
    p.x = cell.x
    p.y = cell.y
    p.ready = state.step + 12
    spark(cell, 'white')
    return
  }
}

/** Six cells straight away from the head, on a jet of flame. */
function jetpack(p: Person, head: Vec) {
  const cell = { x: p.x + Math.sign(p.x - head.x || 1) * 6, y: p.y + Math.sign(p.y - head.y || 1) * 3 }
  p.ready = state.step + 24
  if (!open(cell)) return
  spark(p, 'sun')
  p.x = cell.x
  p.y = cell.y
  p.flame = state.step + 6
}

/** Leave a cardboard copy standing here, and keep running. */
function cutout(p: Person) {
  p.ready = state.step + 32
  state.people.push({ ...p, id: ++run.uid, fake: true, disguised: false, spoke: true, until: state.step + 96 })
}

/** Everyone takes a step, if it is their step, and uses their trick if the head is close. */
export function peopleStep(step: number) {
  if (!state.people.length && !state.minis.length) return
  state.people = state.people.filter((p) => p.until > step)
  state.minis = state.minis.filter((m) => m.until > step)
  const head = state.snake[0]!
  const slow = worldSlowed()
  for (const p of state.people) {
    if (p.fake) continue
    const near = far(p, head)
    if (near <= 6 && !p.spoke) {
      p.spoke = true
      popup(p, QUIPS[p.tactic][p.id % 3]!, 'white')
    }
    if (p.disguised) {
      if (near <= 3) p.disguised = false
      continue
    }
    const ready = step >= p.ready
    if (p.tactic === 'dive' && ready && near <= 2) dive(p)
    else if (p.tactic === 'jetpack' && ready && near <= 4) jetpack(p, head)
    else {
      if (p.tactic === 'cutout' && ready && near <= 5) cutout(p)
      const moves = p.tactic === 'skate' ? step % 3 !== 0 : step % 2 === 0
      if (moves && (!slow || step % 4 < 2)) flee(p, head)
    }
  }
}

function eatPerson(p: Person) {
  state.people = state.people.filter((q) => q.id !== p.id)
  spark(p, p.fake ? 'white' : 'rose')
  if (p.fake) {
    sound.turn()
    popup(p, 'cardboard!', 'white')
    return
  }
  state.grow += 1
  state.score += multiplier() * PEOPLE.score
  gainEnergy(PEOPLE.energy)
  sound.eat(1)
  feel('eat', 2)
  popup(p, 'chomp!', 'rose')
}

/* ─── Minis ─── */

/** Minis come on every fourth level, from the sixth. */
const miniLevel = (level: number) => level >= MINIS.firstLevel && (level - MINIS.firstLevel) % MINIS.every === 0

/** A mini, at a boss's side or anywhere free. */
export function spawnMini(kind: LaserKind, at?: Vec) {
  if (state.minis.length >= MINIS.max) return
  const cell = at ? { x: at.x, y: Math.max(0, at.y - 2) } : freeCell()
  state.minis.push({ id: ++run.uid, x: cell.x, y: cell.y, kind, until: state.step + MINIS.life })
}

/** Each beat, a mini creeps a cell toward the snake's middle; on the body, it bites through and is spent. */
export function minisBeat(step: number) {
  if (!state.minis.length || (worldSlowed() && (step / 4) % 2 === 1)) return
  const goal = state.snake[Math.floor(state.snake.length / 2)]!
  for (const m of [...state.minis]) {
    const dx = goal.x - m.x
    const dy = goal.y - m.y
    if (Math.abs(dx) >= Math.abs(dy)) m.x += Math.sign(dx)
    else m.y += Math.sign(dy)
    const index = state.snake.findIndex((c) => same(c, m))
    if (index === 0) eatMini(m)
    else if (index > 1) {
      state.minis = state.minis.filter((q) => q.id !== m.id)
      spark(m, 'coral')
      cut(index)
      sound.snip()
    }
  }
}

function eatMini(m: Mini) {
  state.minis = state.minis.filter((q) => q.id !== m.id)
  state.grow += 1
  gainEnergy(MINIS.energy)
  spark(m, 'sun')
  sound.bonus()
  feel('eat', 2)
  popup(m, 'crunch!', 'sun')
}

/* ─── Both ─── */

/** The bar's arrivals: a human now and then, more as levels pass, and minis on their levels. Never mid-boss. */
export function peopleBar(bar: number, level: number) {
  if (!peopleOn() || state.boss || bar === 0) return
  const alive = state.people.filter((p) => !p.fake).length
  if (alive < 1 + Math.min(3, Math.floor(level / 5)) && random() < 0.35) spawnPerson(level)
  if (miniLevel(level) && bar % 2 === 0) spawnMini(laserTiers()[tierOf(level)]!.kind)
}

/** The head has reached `cell`: eat whoever is there. */
export function meetCreatures(cell: Vec) {
  const person = state.people.find((p) => same(p, cell))
  if (person) eatPerson(person)
  const mini = state.minis.find((m) => same(m, cell))
  if (mini) eatMini(mini)
}

/** A strike takes anyone on its line with it. */
export function zapCreatures(laser: Laser) {
  for (const p of state.people) if (onLine(p, laser)) spark(p, 'white')
  for (const m of state.minis) if (onLine(m, laser)) spark(m, 'lavender')
  state.people = state.people.filter((p) => !onLine(p, laser))
  state.minis = state.minis.filter((m) => !onLine(m, laser))
}
