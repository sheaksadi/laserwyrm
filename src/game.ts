/**
 * The game engine.
 *
 * Classic snake, set to music. The conductor in `audio.ts` is the clock: the
 * snake moves on every 16th note, and lasers arm on a beat and strike on a
 * later one, right on the zap in the track. Every eight bars the level goes
 * up: the tempo rises, the track fills out, and more lasers come, with less
 * warning.
 *
 * A laser never kills. It slices the snake where it crosses: the head side
 * lives on, and the rest lies there for a moment, then pops cell by cell.
 * Those cells are points lost. Only walls and biting yourself end the game.
 */
import { reactive } from 'vue'
import { conductor, now, queue, sound, stepSeconds } from './audio'

export interface Vec { x: number; y: number }
export type DirName = 'up' | 'down' | 'left' | 'right'
export type Tone = 'mint' | 'coral' | 'sun' | 'lavender' | 'sky'

export const DIRS: Record<DirName, Vec> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

export interface Laser {
  id: number
  axis: 'row' | 'col'
  index: number
  /** Step it fires on; the warning lasts from now until then. */
  strikeStep: number
  /** Warning length in ms, for the fuse animation. */
  warnMs: number
  struck: boolean
  from: 'start' | 'end'
  /** Jagged bolt drawn when it fires, as SVG points. */
  bolt: string
}

export type ItemKind = 'apple' | 'cherry' | 'star' | 'shield' | 'double' | 'slow'
export interface Item { id: number; kind: ItemKind; x: number; y: number; until: number | null }

export const ITEM_INFO: Record<ItemKind, { points: number; grow: number; label: string }> = {
  apple: { points: 1, grow: 1, label: '+1' },
  cherry: { points: 3, grow: 2, label: '+3' },
  star: { points: 5, grow: 3, label: '+5' },
  shield: { points: 0, grow: 0, label: 'shield' },
  double: { points: 0, grow: 0, label: '×2 points' },
  slow: { points: 0, grow: 0, label: 'slow-mo' },
}

export interface Debris {
  id: number
  cells: Vec[]
  /** How long the piece lies still before it starts popping. */
  holdMs: number
  gapMs: number
}
export interface Popup { id: number; x: number; y: number; text: string; tone: Tone }

/** A severed piece lies still this long, then pops one cell every `POP_GAP_MS`. */
const HOLD_MS = 700
const POP_GAP_MS = 45
const POPUP_MS = 1000
const BOLT_MS = 320
const BARS_PER_LEVEL = 8
const SNIPPER_RESPAWN_MS = 9000
const SNIPPER_REST_MS = 2600

const BEST_KEY = 'snake-best'

function readBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0
  } catch {
    return 0
  }
}

function saveBest(value: number) {
  try {
    localStorage.setItem(BEST_KEY, String(value))
  } catch {
    /* storage blocked: the best score lasts for this visit */
  }
}

const same = (a: Vec, b: Vec) => a.x === b.x && a.y === b.y
const rand = (n: number) => Math.floor(Math.random() * n)
const pick = <T>(list: readonly T[]) => list[rand(list.length)]!
const onLine = (cell: Vec, laser: Pick<Laser, 'axis' | 'index'>) =>
  laser.axis === 'row' ? cell.y === laser.index : cell.x === laser.index
const tempoFor = (level: number) => Math.min(172, 108 + level * 8)

let uid = 0

export const state = reactive({
  cols: 30,
  rows: 20,
  snake: [] as Vec[],
  direction: { ...DIRS.right } as Vec,
  queue: [] as Vec[],
  grow: 0,
  score: 0,
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
  effects: { shield: 0, double: 0, slow: 0 },
  lasers: [] as Laser[],
  debris: [] as Debris[],
  popups: [] as Popup[],
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
  /** Bumped on every hit, so the view can shake once. */
  shake: 0,
})

export const isActive = (effect: keyof typeof state.effects) => state.effects[effect] > state.step

/* ─── Game-clock timers ──────────────────────────────────────────────── */

const clock = () => now() * 1000
const timers: { at: number; run: () => void }[] = []
function later(ms: number, run: () => void) {
  timers.push({ at: clock() + ms, run })
}

/* ─── Setup ──────────────────────────────────────────────────────────── */

/** Phones and tablets get on-screen controls, so the board makes room for them. */
export const isTouch = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window)

/**
 * Where the board sits, in px from each window edge. The HUD band is on top;
 * on touch screens the control pad takes the bottom (portrait) or the right
 * side (landscape). App.vue places the board and the pad from these numbers.
 */
export function arenaInsets() {
  const w = window.innerWidth
  const h = window.innerHeight
  if (!isTouch()) return { top: 72, right: 12, bottom: 12, left: 12, pad: 'none' as const }
  if (w > h) return { top: 64, right: 200, bottom: 8, left: 8, pad: 'side' as const }
  return { top: 64, right: 8, bottom: 196, left: 8, pad: 'bottom' as const }
}

export const layout = reactive(arenaInsets())

/** Keep the board and pad placement in step with the window. */
export function fitLayout() {
  Object.assign(layout, arenaInsets())
}

/** Fit the grid to the board area: bigger cells on big screens, never tiny ones. */
export function fitGrid() {
  fitLayout()
  const w = window.innerWidth - layout.left - layout.right
  const h = window.innerHeight - layout.top - layout.bottom
  const cell = w < 640 ? 22 : w < 1200 ? 28 : 32
  state.cols = Math.max(12, Math.floor(w / cell))
  state.rows = Math.max(12, Math.floor(h / cell))
}

function freeCell(): Vec {
  const taken = (x: number, y: number) =>
    state.snake.some((c) => c.x === x && c.y === y) ||
    state.items.some((i) => i.x === x && i.y === y) ||
    (state.snipper.active && state.snipper.x === x && state.snipper.y === y)
  const free: Vec[] = []
  for (let y = 1; y < state.rows - 1; y++)
    for (let x = 1; x < state.cols - 1; x++) if (!taken(x, y)) free.push({ x, y })
  return pick(free)
}

function addItem(kind: ItemKind, lifeSteps: number | null) {
  const cell = freeCell()
  state.items.push({ id: ++uid, kind, ...cell, until: lifeSteps === null ? null : state.step + lifeSteps })
}

export function reset() {
  conductor.stop()
  fitGrid()
  const cx = Math.floor(state.cols / 2) - 3
  const cy = Math.floor(state.rows / 2)
  Object.assign(state, {
    snake: [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }],
    direction: { ...DIRS.right },
    queue: [],
    grow: 0,
    score: 0,
    longest: 3,
    status: 'ready',
    reason: '',
    level: 0,
    bpm: tempoFor(0),
    step: 0,
    items: [],
    effects: { shield: 0, double: 0, slow: 0 },
    lasers: [],
    debris: [],
    popups: [],
    banner: null,
    stats: { eaten: 0, lost: 0, cuts: 0, snippers: 0, blocked: 0 },
  })
  state.snipper.active = false
  state.snipper.until = 0
  timers.length = 0
  conductor.setLevel(0, state.bpm)
  addItem('apple', null)
}

/* ─── Effects ────────────────────────────────────────────────────────── */

function popup(cell: Vec, text: string, tone: Tone) {
  const id = ++uid
  state.popups.push({ id, x: cell.x, y: cell.y, text, tone })
  later(POPUP_MS, () => (state.popups = state.popups.filter((p) => p.id !== id)))
}

function banner(title: string, sub: string) {
  const id = ++uid
  state.banner = { id, title, sub }
  later(1800, () => {
    if (state.banner?.id === id) state.banner = null
  })
}

function die(reason: string) {
  state.status = 'over'
  state.reason = reason
  state.shake++
  conductor.stop()
  sound.die()
  if (state.score > state.best) {
    state.best = state.score
    saveBest(state.best)
  }
}

/** Slice the snake at `index`: the head side lives, the rest lies there, then pops. */
function cut(index: number) {
  const lost = state.snake.splice(index)
  if (!lost.length) return
  state.grow = 0
  const id = ++uid
  state.debris.push({ id, cells: lost, holdMs: HOLD_MS, gapMs: POP_GAP_MS })
  later(HOLD_MS + lost.length * POP_GAP_MS + 700, () => (state.debris = state.debris.filter((d) => d.id !== id)))
  state.score = Math.max(0, state.score - lost.length)
  state.stats.lost += lost.length
  state.stats.cuts++
  state.shake++
  popup(lost[0]!, `−${lost.length}`, 'coral')
  sound.cut()
  sound.pops(lost.length, HOLD_MS / 1000, POP_GAP_MS / 1000)
}

/* ─── Lasers ─────────────────────────────────────────────────────────── */

function warnSteps() {
  return state.level < 2 ? 16 : state.level < 4 ? 12 : 8
}

function spawnLaser(forced?: Pick<Laser, 'axis' | 'index'>) {
  const head = state.snake[0]!
  const body = state.snake.slice(2)
  const busy = (axis: Laser['axis'], index: number) =>
    state.lasers.some((l) => !l.struck && l.axis === axis && l.index === index)

  // Half the time the laser runs along the line the snake travels on: turn
  // off it in time and only the tail still on it gets sliced. Otherwise it
  // crosses the body somewhere, or lands anywhere.
  for (let attempt = 0; attempt < 12; attempt++) {
    let axis: Laser['axis']
    let index: number
    const roll = Math.random()
    if (forced && attempt === 0) {
      axis = forced.axis
      index = forced.index
    } else if (roll < 0.5 && attempt === 0) {
      axis = state.direction.x ? 'row' : 'col'
      index = axis === 'row' ? head.y : head.x
    } else if (roll < 0.85 && body.length) {
      const target = pick(body)
      axis = Math.random() < 0.5 ? 'row' : 'col'
      index = axis === 'row' ? target.y : target.x
    } else {
      axis = Math.random() < 0.5 ? 'row' : 'col'
      index = rand(axis === 'row' ? state.rows : state.cols)
    }
    if (busy(axis, index)) continue
    const steps = warnSteps()
    const warnSec = steps * stepSeconds()
    state.lasers.push({
      id: ++uid,
      axis,
      index,
      strikeStep: state.step + steps,
      warnMs: warnSec * 1000,
      struck: false,
      from: Math.random() < 0.5 ? 'start' : 'end',
      bolt: '',
    })
    sound.riser(warnSec)
    return { axis, index }
  }
  return null
}

function boltPoints(laser: Laser): string {
  const length = laser.axis === 'row' ? state.cols : state.rows
  const points: string[] = []
  for (let i = 0; i <= length; i += 0.5) {
    const jitter = i === 0 || i >= length ? 0 : (Math.random() - 0.5) * 0.7
    const across = laser.index + 0.5 + jitter
    points.push(laser.axis === 'row' ? `${i},${across}` : `${across},${i}`)
  }
  return points.join(' ')
}

function strike(laser: Laser) {
  laser.struck = true
  laser.bolt = boltPoints(laser)
  later(BOLT_MS, () => (state.lasers = state.lasers.filter((l) => l.id !== laser.id)))

  const s = state.snipper
  if (s.active && onLine(s, laser)) {
    s.active = false
    s.until = clock() + SNIPPER_RESPAWN_MS
    state.score += 2
    popup(s, '+2 zapped', 'lavender')
  }

  const index = state.snake.findIndex((cell) => onLine(cell, laser))
  if (index < 0) return
  if (isActive('shield')) {
    state.effects.shield = 0
    state.stats.blocked++
    sound.shield()
    popup(state.snake[0]!, 'blocked', 'sky')
    return
  }
  // A hit on the head slices right behind it: the head always survives.
  cut(Math.max(1, index))
}

/* ─── The snipper ────────────────────────────────────────────────────── */

function spawnSnipper() {
  const s = state.snipper
  const side = rand(4)
  s.x = side === 0 ? 0 : side === 1 ? state.cols - 1 : rand(state.cols)
  s.y = side === 2 ? 0 : side === 3 ? state.rows - 1 : rand(state.rows)
  s.active = true
  s.resting = false
  popup(s, 'snipper!', 'lavender')
}

function moveSnipper() {
  const s = state.snipper
  const head = state.snake[0]!
  let target: Vec
  if (s.resting || state.snake.length < 4) {
    target = { x: s.x + Math.sign(s.x - head.x || 1) * 5, y: s.y + Math.sign(s.y - head.y || 1) * 5 }
  } else {
    target = state.snake[Math.floor(state.snake.length / 2)]!
  }
  const dx = target.x - s.x
  const dy = target.y - s.y
  const options: Vec[] = []
  if (dx) options.push({ x: Math.sign(dx), y: 0 })
  if (dy) options.push({ x: 0, y: Math.sign(dy) })
  if (Math.abs(dy) > Math.abs(dx)) options.reverse()
  if (Math.random() < 0.2) options.reverse()
  const step = options.find((d) => {
    const nx = s.x + d.x
    const ny = s.y + d.y
    return nx >= 0 && ny >= 0 && nx < state.cols && ny < state.rows
  })
  if (!step) return
  s.x += step.x
  s.y += step.y
  s.facing = step

  if (same(s, head)) return eatSnipper()
  const index = state.snake.findIndex((cell) => same(cell, s))
  if (index > 0) {
    cut(index)
    sound.snip()
    s.resting = true
    s.until = clock() + SNIPPER_REST_MS
  }
}

function eatSnipper() {
  const s = state.snipper
  s.active = false
  s.until = clock() + SNIPPER_RESPAWN_MS
  const points = 3 * (isActive('double') ? 2 : 1)
  state.score += points
  state.stats.snippers++
  sound.bonus()
  popup(s, `+${points} crunch`, 'sun')
}

/* ─── Eating ─────────────────────────────────────────────────────────── */

function eat(item: Item) {
  state.items = state.items.filter((i) => i.id !== item.id)
  const info = ITEM_INFO[item.kind]
  if (item.kind === 'shield' || item.kind === 'double' || item.kind === 'slow') {
    const bars = item.kind === 'shield' ? 8 : item.kind === 'double' ? 4 : 2
    state.effects[item.kind] = state.step + bars * 16
    sound.pill()
    popup(item, info.label, item.kind === 'shield' ? 'sky' : item.kind === 'double' ? 'sun' : 'lavender')
    return
  }
  const points = info.points * (isActive('double') ? 2 : 1)
  state.score += points
  state.grow += info.grow
  state.stats.eaten++
  sound.eat(item.kind === 'apple' ? 0 : item.kind === 'cherry' ? 1 : 2)
  popup(item, `+${points}`, item.kind === 'star' ? 'sun' : 'mint')
  if (item.kind === 'apple') addItem('apple', null)
}

/* ─── The beat ───────────────────────────────────────────────────────── */

function onBar(bar: number) {
  const level = Math.floor(bar / BARS_PER_LEVEL)
  if (level !== state.level) {
    state.level = level
    state.bpm = tempoFor(level)
    conductor.setLevel(level, state.bpm)
    sound.level()
    banner(`Level ${level + 1}`, `${state.bpm} bpm · more lasers`)
  }

  // Bonus fruit and pills, at most two extras at a time.
  const extras = state.items.filter((i) => i.kind !== 'apple').length
  if (extras < 2 && bar > 0) {
    const roll = Math.random()
    if (roll < 0.3) addItem('cherry', 48)
    else if (roll < 0.4 && level >= 1) addItem('star', 32)
    else if (roll < 0.62 && level >= 1) addItem(pick(['shield', 'double', 'slow'] as const), 48)
  }
}

function onBeat(step: number) {
  state.beat++
  const bar = Math.floor(step / 16)
  if (bar < 1) return // one bar of intro

  // More lasers per bar as the level climbs: 1, 2, 3, ... up to 6.
  const perBar = Math.min(6, 1 + state.level)
  const armed = state.lasers.filter((l) => !l.struck).length
  if (armed >= 2 + state.level) return
  const chance = perBar / 4
  let count = Math.floor(chance) + (Math.random() < chance % 1 ? 1 : 0)
  while (count-- > 0) {
    const placed = spawnLaser()
    // From level 3 a laser sometimes brings a crossing partner.
    if (placed && state.level >= 3 && Math.random() < 0.25) {
      const head = state.snake[0]!
      spawnLaser(placed.axis === 'row' ? { axis: 'col', index: head.x } : { axis: 'row', index: head.y })
    }
  }
}

function tick() {
  while (state.queue.length) {
    const wanted = state.queue.shift()!
    if (wanted.x !== -state.direction.x || wanted.y !== -state.direction.y) {
      state.direction = wanted
      break
    }
  }

  const head = state.snake[0]!
  const next = { x: head.x + state.direction.x, y: head.y + state.direction.y }
  if (next.x < 0 || next.y < 0 || next.x >= state.cols || next.y >= state.rows) {
    return die('hit the wall')
  }
  // The tail moves out of the way this tick, unless the snake is growing.
  const body = state.grow > 0 ? state.snake : state.snake.slice(0, -1)
  if (body.some((cell) => same(cell, next))) return die('bit itself')

  state.snake.unshift(next)
  if (state.grow > 0) state.grow--
  else state.snake.pop()

  const item = state.items.find((i) => same(i, next))
  if (item) eat(item)
  state.longest = Math.max(state.longest, state.snake.length)

  const s = state.snipper
  if (s.active && same(s, next)) eatSnipper()
}

function onStep(step: number) {
  state.step = step
  if (step % 16 === 0) onBar(step / 16)
  if (step % 4 === 0) onBeat(step)

  // Slow-mo: the snake moves on 8ths instead of 16ths.
  if (!isActive('slow') || step % 2 === 0) tick()
  if (state.status !== 'running') return

  for (const laser of state.lasers) if (!laser.struck && laser.strikeStep <= step) strike(laser)

  const s = state.snipper
  if (s.active && step % 2 === 0) moveSnipper()
  if (!s.active && (state.level >= 1 || state.score >= 8) && clock() >= s.until) spawnSnipper()
  if (s.active && s.resting && clock() >= s.until) s.resting = false

  state.items = state.items.filter((i) => i.until === null || i.until > step)
}

// Zaps are booked into the track ahead of time, so they land on the beat.
conductor.onSchedule(({ step, time }) => {
  if (state.lasers.some((l) => !l.struck && l.strikeStep === step)) sound.zapAt(time)
})

/* ─── Loop and controls ──────────────────────────────────────────────── */

function frame() {
  if (state.status === 'running') {
    const t = now()
    while (queue.length && queue[0]!.time <= t && state.status === 'running') onStep(queue.shift()!.step)
    const ms = clock()
    for (let i = timers.length - 1; i >= 0; i--) {
      if (ms >= timers[i]!.at) timers.splice(i, 1)[0]!.run()
    }
  }
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

export function play() {
  if (state.status === 'running') return
  if (state.status === 'over') reset()
  if (state.status === 'paused') conductor.resume()
  else conductor.start()
  state.status = 'running'
}

export function pause() {
  if (state.status !== 'running') return
  state.status = 'paused'
  conductor.pause()
}

export function toggle() {
  if (state.status === 'running') pause()
  else play()
}

export function turn(name: DirName) {
  if (state.status === 'over') return
  const wanted = DIRS[name]
  const lastQueued = state.queue[state.queue.length - 1] ?? state.direction
  if (same(wanted, lastQueued) || state.queue.length >= 3) return
  state.queue.push({ ...wanted })
  sound.turn()
  if (state.status === 'ready' || state.status === 'paused') play()
}

/** Share of an effect still left, 0 to 1, for the HUD. */
export function effectLeft(effect: keyof typeof state.effects): number {
  const total = effect === 'shield' ? 128 : effect === 'double' ? 64 : 32
  return Math.max(0, Math.min(1, (state.effects[effect] - state.step) / total))
}

reset()
