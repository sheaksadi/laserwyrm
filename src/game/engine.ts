/**
 * The engine's heart: setting up a run, and what happens on every step,
 * beat and bar (moving, eating, dropping items, sending lasers), driven by
 * the conductor's clock.
 */
import { watch } from 'vue'
import { conductor, now, queue } from '../audio'
import { musicForLevel, warmUp } from '../music'
import { design, isStock, itemsStock, live, snapshot } from '../design'
import { DIRS, ENERGY, HEART_CHANCE, ITEMS_REV, powerKinds, revision, TOTEM_CHANCE, tierOf, usesEnergy, type Mode, type Vec } from './catalog'
import { addItem, clearWalls, isWall, setWalls } from './board'
import { armedFor, backgroundFor, gameRules, intensity, lasersFor, levelAtBar, lifeOf, maxHearts, musicFor, rateOf, snipperFor, tempoFor } from './curve'
import { demoFrame } from './demo'
import { die } from './hits'
import { dropWeighted, eat, gainEnergy, pullFruit } from './items'
import { spawnLaser, strike, trackLasers } from './lasers'
import { fitGrid } from './layout'
import { applyLevel, edgesFor, enterLevel, endIntro, multiplier } from './levels'
import { forgetTimes } from './replay'
import { pick, random, reseed } from './rng'
import { eatSnipper, moveSnipper, spawnSnipper } from './snipper'
import { worldSlowed, cheats, demo, isActive, match, replay, run, same, sound, state, timers, clock } from './state'

export function reset(from?: { seed: number; cols: number; rows: number; mode?: Mode; rev?: number }) {
  conductor.stop()
  forgetTimes()
  if (from) {
    state.cols = from.cols
    state.rows = from.rows
  } else {
    fitGrid()
  }
  const seed = from?.seed ?? (Math.floor(Math.random() * 2 ** 32) >>> 0)
  reseed(seed)
  state.mode = from ? (from.mode ?? 'normal') : run.mode
  revision.rev = from ? (from.rev ?? 1) : ITEMS_REV
  run.recording = { v: 1, mode: state.mode, seed, cols: state.cols, rows: state.rows, steps: 0, events: [], rev: revision.rev }
  if (!isStock(live())) run.recording.design = snapshot(live())
  conductor.setStyle(0, 'play', 0)
  run.stepsDone = 0
  const cx = Math.floor(state.cols / 2) - 3
  const cy = Math.floor(state.rows / 2)
  const rules = gameRules()
  Object.assign(state, {
    snake: Array.from({ length: rules.length }, (_, i) => ({ x: cx - i, y: cy })),
    direction: { ...DIRS.right },
    queue: [],
    grow: 0,
    score: 0,
    hearts: rules.hearts,
    longest: rules.length,
    status: 'ready',
    reason: '',
    level: 0,
    bpm: tempoFor(0),
    step: 0,
    items: [],
    effects: { shield: 0, double: 0, slow: 0, magnet: 0, ghost: 0 },
    held: [],
    totem: false,
    energy: ENERGY.start,
    rev: revision.rev,
    notice: null,
    newBest: false,
    levelOffset: 0,
    pausedBars: 0,
    intro: null,
    calmUntil: 0,
    cheated: cheats.god || cheats.noLasers || !isStock(live()),
    usedCheats: cheats.god || cheats.noLasers,
    lasers: [],
    debris: [],
    popups: [],
    bursts: [],
    wizardUntil: 0,
    tierNote: null,
    banner: null,
    stats: { eaten: 0, lost: 0, cuts: 0, snippers: 0, blocked: 0 },
  })
  state.snipper.active = false
  state.snipper.until = 0
  timers.length = 0
  conductor.setLevel(0, state.bpm)
  clearWalls()
  setWalls(0)
  const d = live()
  warmUp([d.music, d.background, ...d.levels.flatMap((l) => [l.music, l.background])].filter((c): c is string => !!c))
  musicForLevel(musicFor(0), 0, backgroundFor(0))
  // A game that starts further in: its first level's tempo, walls, music and arrangement.
  if (rules.startLevel > 0) {
    state.levelOffset = rules.startLevel
    applyLevel(rules.startLevel)
    setWalls(rules.startLevel)
    conductor.setStyle(tierOf(rules.startLevel), 'play', 0)
  }
  addItem('apple', null)
}

export function onBar(bar: number) {
  if (state.intro) return
  const level = state.levelOffset + levelAtBar(bar - state.pausedBars)
  if (level !== state.level && enterLevel(level)) return

  // Bonus fruit and pills, at most two extras at a time.
  const extras = state.items.filter((i) => i.kind !== 'apple').length
  const stockItems = itemsStock(live())
  if (extras < 2 && bar > 0) {
    const roll = random()
    if (!stockItems) dropWeighted(roll, level)
    else if (roll < 0.3) addItem('cherry', 48)
    else if (roll < 0.4 && level >= 1) addItem('star', 32)
    else if (roll < 0.62 && level >= 1) addItem(pick(powerKinds()), 48)
    // The cookies (item table 2): plain ones often, the wizard now and then, the starry one rarely but for longer.
    else if (revision.rev < 2) {
      /* the first table stops here */
    } else if (roll < 0.72) addItem('cookie', 48)
    else if (roll < 0.76 && level >= 1) addItem('wizard', 32)
    else if (roll < 0.78 && level >= 2) addItem('starry', 96)
  }
  const totemOut = state.items.some((i) => i.kind === 'totem')
  if (level >= 1 && !state.totem && !totemOut && random() < TOTEM_CHANCE * rateOf('totem', level)) addItem('totem', lifeOf('totem', 32))
  const heartOut = state.items.some((i) => i.kind === 'heart')
  if (bar > 0 && !heartOut && state.hearts < maxHearts() && random() < HEART_CHANCE * rateOf('heart', level))
    addItem('heart', lifeOf('heart', 40))
}

export function onBeat(step: number) {
  if (state.intro) return
  state.beat++
  state.score += multiplier()
  const bar = Math.floor(step / 16)
  if (bar < 1 || cheats.noLasers || match.calm) return // one bar of intro; none at all in a laser-free match
  // Slow-mo (revision 6): the world's beat comes half as often.
  if (worldSlowed() && (step / 4) % 2 === 1) return

  trackLasers()

  // More lasers per bar, and more armed at once, as the intensity climbs.
  // A wizard cookie keeps the lasers away for a moment.
  if (step < state.wizardUntil) return
  const i = intensity(state.level)
  const perBar = lasersFor(state.level)
  const armedCap = armedFor(state.level)
  const armed = state.lasers.filter((l) => !l.struck).length
  if (armed >= armedCap) return
  // Just after an intro, the new lasers come gently.
  const chance = (perBar / 4) * (step < state.calmUntil ? 0.35 : 1)
  let count = Math.floor(chance) + (random() < chance % 1 ? 1 : 0)
  while (count-- > 0) {
    const placed = spawnLaser()
    // Past the first few levels a laser sometimes brings a crossing partner.
    if (placed && i >= 3 && random() < 0.25) {
      const head = state.snake[0]!
      spawnLaser(placed.axis === 'row' ? { axis: 'col', index: head.x } : { axis: 'row', index: head.y })
    }
  }
}

export function tick() {
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
    // Normal mode wraps to the other side; hardcore walls kill.
    if (edgesFor(state.level) === 'kill' && !cheats.god) return die('hit the wall')
    next.x = (next.x + state.cols) % state.cols
    next.y = (next.y + state.rows) % state.rows
  }
  if (isWall(next) && !isActive('ghost') && !cheats.god) return die('hit a wall')
  // The tail moves out of the way this tick, unless the snake is growing.
  const body = state.grow > 0 ? state.snake : state.snake.slice(0, -1)
  if (!isActive('ghost') && !cheats.god && body.some((cell) => same(cell, next))) return die('bit itself')

  state.snake.unshift(next)
  if (state.grow > 0) state.grow--
  else state.snake.pop()

  arrive(next)
}

/** The head has moved onto `cell`: eat what is there. */
export function arrive(cell: Vec) {
  const item = state.items.find((i) => same(i, cell))
  if (item) eat(item)
  state.longest = Math.max(state.longest, state.snake.length)

  const s = state.snipper
  if (s.active && same(s, cell)) eatSnipper()
}

export function onStep(step: number) {
  state.step = step
  run.stepsDone = step + 1
  if (state.intro && step >= state.intro.until) endIntro(step)
  // Intro pause: time passes, play does not.
  if (state.intro) return
  if (step % 16 === 0) onBar(step / 16)
  if (step % 4 === 0) onBeat(step)
  if (usesEnergy() && step % ENERGY.regenSteps === 0) gainEnergy(1)

  // Slow-mo: before revision 6 the snake moved on 8ths instead of 16ths. From 6 the snake keeps
  // its pace and the world holds still every other step: its clocks wait a step.
  const slowWorld = worldSlowed()
  if (slowWorld && step % 2 === 1) holdWorld(step)
  if (slowWorld || !isActive('slow') || step % 2 === 0) tick()
  if (state.status !== 'running' || replay.ended) return
  if (isActive('magnet') && step % 2 === 0) pullFruit()

  for (const laser of state.lasers) if (!laser.struck && laser.strikeStep <= step) strike(laser)

  const s = state.snipper
  if (s.active && step % (slowWorld ? 4 : 2) === 0) moveSnipper()
  if (!s.active && snipperFor(state.level) > 0 && (state.level >= 1 || state.snake.length >= 8) && state.step >= s.until) spawnSnipper()
  if (s.active && s.resting && state.step >= s.until) s.resting = false

  state.items = state.items.filter((i) => i.until === null || i.until > step)
}

/** One step the world sits out (slow-mo): every clock that times the world moves on by a step. */
function holdWorld(step: number) {
  for (const laser of state.lasers) if (!laser.struck) laser.strikeStep++
  for (const item of state.items) if (item.until !== null) item.until++
  state.snipper.until++
  if (state.calmUntil > step) state.calmUntil++
}

/* ─── The frame loop ──────────────────────────────────────────────────── */

export function frame() {
  if (demo.on) demoFrame()
  if (state.status === 'running' || replay.active) {
    const t = now()
    while (!replay.active && queue.length && queue[0]!.time <= t && state.status === 'running') onStep(queue.shift()!.step)
    const ms = clock()
    for (let i = timers.length - 1; i >= 0; i--) {
      if (ms >= timers[i]!.at) timers.splice(i, 1)[0]!.run()
    }
  }
  requestAnimationFrame(frame)
}

/**
 * Start the engine, once: book zaps into the track, run the frame loop,
 * follow design changes, and set up the first game.
 */
export function startEngine() {
  // Zaps are booked into the track ahead of time, so they land on the beat.
  conductor.onSchedule(({ step, time }) => {
    if (state.lasers.some((l) => !l.struck && l.strikeStep === step)) sound.zapAt(time)
  })

  requestAnimationFrame(frame)

  /**
   * Changing the design mid-run plays on with it: the run counts as cheated,
   * and its replay keeps the latest design. Before the first move, the game
   * starts over instead, so the board shows the change (a level's walls).
   */
  watch(
    design,
    (d) => {
      forgetTimes()
      if (replay.active || live() !== design) return
      if (state.status === 'ready') return reset()
      if (!isStock(d)) state.cheated = true
      run.recording.design = isStock(d) ? undefined : snapshot(d)
      setWalls(state.level)
    },
    { deep: true },
  )
  reset()
}
