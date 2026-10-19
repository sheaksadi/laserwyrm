/**
 * The snipper: it hunts the middle of the snake and cuts it; bite it first
 * for +3.
 */
import { SNIPPER_REST_STEPS, SNIPPER_RESPAWN_STEPS, type Vec } from './catalog'
import { popup } from './board'
import { snipperFor } from './curve'
import { cut } from './hits'
import { rand, random } from './rng'
import { same, sound, state } from './state'

export function spawnSnipper() {
  const s = state.snipper
  const side = rand(4)
  s.x = side === 0 ? 0 : side === 1 ? state.cols - 1 : rand(state.cols)
  s.y = side === 2 ? 0 : side === 3 ? state.rows - 1 : rand(state.rows)
  s.active = true
  s.resting = false
  popup(s, 'snipper!', 'lavender')
}

export function moveSnipper() {
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
  if (random() < 0.2) options.reverse()
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
    s.until = state.step + SNIPPER_REST_STEPS
  }
}

export function eatSnipper() {
  const s = state.snipper
  s.active = false
  s.until = state.step + Math.round(SNIPPER_RESPAWN_STEPS / Math.max(0.25, snipperFor(state.level)))
  state.grow += 3
  state.stats.snippers++
  sound.bonus()
  popup(s, '+3 × crunch', 'sun')
}
