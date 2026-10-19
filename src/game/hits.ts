/**
 * Getting hurt: a cut through the body, death (or the totem, or a respawn
 * in a match).
 */
import { conductor } from '../audio'
import { DIRS, HOLD_MS, POP_GAP_MS } from './catalog'
import { banner, popup } from './board'
import { gameRules } from './curve'
import { feel, later, mark, match, replay, run, saveBest, sound, state } from './state'

export function die(reason: string) {
  if (state.totem) return revive(reason)
  if (match.respawn && !replay.active) return respawn(reason)
  state.reason = reason
  state.shake++
  if (replay.active) {
    replay.ended = true
    mark('die')
    return
  }
  state.status = 'over'
  conductor.stop()
  sound.die()
  feel('die', state.snake.length)
  mark('die')
  state.newBest = !state.cheated && state.score > state.best
  if (state.newBest) {
    state.best = state.score
    saveBest(state.best)
  }
}

/** The totem crumbles and the snake lives: one heart, a turn away from the wall, two bars of cover. */
export function revive(reason: string) {
  state.totem = false
  state.hearts = Math.max(1, state.hearts)
  state.queue = []
  if (reason === 'hit the wall' || reason === 'hit a wall') {
    state.snake.reverse()
    const [head, neck] = state.snake
    state.direction = neck ? { x: head!.x - neck.x, y: head!.y - neck.y } : { x: -state.direction.x, y: -state.direction.y }
  }
  const cover = state.step + 32
  state.effects.shield = Math.max(state.effects.shield, cover)
  state.effects.ghost = Math.max(state.effects.ghost, cover)
  state.shake++
  sound.level()
  feel('revive')
  mark('totem')
  banner('Undying!', 'the totem crumbles')
  popup(state.snake[0]!, 'saved', 'sun')
}

/**
 * Multiplayer with respawns: the snake starts again from the middle at its
 * first length, with full hearts and two bars of cover, and keeps its score.
 */
export function respawn(reason: string) {
  const rules = gameRules()
  const lost = state.snake.slice(1)
  if (lost.length) {
    const id = ++run.uid
    state.debris.push({ id, cells: lost, holdMs: HOLD_MS, gapMs: POP_GAP_MS })
    later(HOLD_MS + lost.length * POP_GAP_MS + 700, () => (state.debris = state.debris.filter((d) => d.id !== id)))
  }
  const cx = Math.floor(state.cols / 2) - 3
  const cy = Math.floor(state.rows / 2)
  state.snake = Array.from({ length: rules.length }, (_, i) => ({ x: cx - i, y: cy }))
  state.direction = { ...DIRS.right }
  state.queue = []
  state.grow = 0
  state.hearts = rules.hearts
  const cover = state.step + 32
  state.effects.shield = Math.max(state.effects.shield, cover)
  state.effects.ghost = Math.max(state.effects.ghost, cover)
  state.stats.lost += lost.length
  match.respawns++
  state.shake++
  sound.die()
  feel('die', lost.length + 1)
  banner('Respawn', `the snake ${reason}`)
}

/** Slice the snake at `index`: the head side lives, the rest lies there, then pops. */
export function cut(index: number) {
  const lost = state.snake.splice(index)
  if (!lost.length) return
  state.grow = 0
  const id = ++run.uid
  state.debris.push({ id, cells: lost, holdMs: HOLD_MS, gapMs: POP_GAP_MS })
  later(HOLD_MS + lost.length * POP_GAP_MS + 700, () => (state.debris = state.debris.filter((d) => d.id !== id)))
  state.stats.lost += lost.length
  state.stats.cuts++
  state.shake++
  popup(lost[0]!, `−${lost.length}`, 'coral')
  sound.cut()
  sound.pops(lost.length, HOLD_MS / 1000, POP_GAP_MS / 1000)
  feel('cut', lost.length)
  mark('cut')
}
