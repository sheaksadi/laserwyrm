/**
 * Items: eating fruit and picking up power-ups, using them (effects, dash,
 * magnet), and which bonus item drops when a game's items are changed.
 */
import { live, type Stack } from '../design'
import { revision, customItem, DASH_CELLS, FRUIT_GROW, isCustom, isPower, POWER_KINDS, POWERS, TOTEM, type CustomId, type Holdable, type Item, type ItemKind, type Vec } from './catalog'
import { addItem, isWall, notice, popup } from './board'
import { heldSlots, lifeOf, maxHearts, rateOf } from './curve'
import { edgesFor } from './levels'
import { arrive } from './engine'
import { feel, later, mark, run, same, sound, state } from './state'

/* ─── Eating ─────────────────────────────────────────────────────────── */

export function eat(item: Item) {
  state.items = state.items.filter((i) => i.id !== item.id)
  if (item.kind === 'heart') {
    state.hearts = Math.min(maxHearts(), state.hearts + 1)
    sound.bonus()
    popup(item, '+1 life', 'coral')
    mark('heal')
    return
  }
  if (item.kind === 'totem') {
    state.totem = true
    sound.level()
    popup(item, 'totem!', 'sun')
    notice('totem', TOTEM.name, TOTEM.blurb)
    mark('power')
    return
  }
  if (isCustom(item.kind)) return eatCustom(item, item.kind)
  if (isPower(item.kind)) {
    const power = POWERS[item.kind]
    if (state.held.length < heldSlots()) {
      state.held.push(item.kind)
      mark('power')
      sound.pill()
      popup(item, power.name, power.tone)
      notice(item.kind, `${power.name} stored`, `${power.blurb}. Space to use.`)
    } else {
      activate(item.kind, item)
    }
    return
  }
  if (item.kind === 'wizard') {
    // Every laser on the board fizzles out, and none come for a moment.
    state.lasers = state.lasers.filter((l) => l.struck)
    state.wizardUntil = Math.max(state.wizardUntil, state.step) + (live().items.wizard?.bars ?? 2) * 16
    sound.bonus()
    feel('eat', 3)
    popup(item, 'abracadabra!', 'lavender')
    state.stats.eaten++
    return
  }
  const grow = live().items[item.kind]?.grow ?? FRUIT_GROW[item.kind]
  state.grow += grow
  state.stats.eaten++
  sound.eat(item.kind === 'apple' ? 0 : item.kind === 'cherry' || item.kind === 'cookie' ? 1 : 2)
  feel('eat', grow)
  popup(item, `+${grow} ×`, item.kind === 'star' || item.kind === 'starry' ? 'sun' : 'mint')
  if (item.kind === 'starry') {
    const id = ++run.uid
    state.bursts.push({ id, x: item.x, y: item.y })
    later(900, () => (state.bursts = state.bursts.filter((b) => b.id !== id)))
  }
  if (item.kind === 'apple') addItem('apple', null)
}

/** A home-made item: a fruit grows, scores and heals; a power-up is held or goes off at once. */
export function eatCustom(item: Item, kind: CustomId) {
  const c = customItem(kind)
  if (!c) return
  if (c.kind === 'power') {
    if (c.hold && state.held.length < heldSlots()) {
      state.held.push(kind)
      mark('power')
      sound.pill()
      popup(item, c.name, 'mint')
      notice(kind, `${c.name} stored`, `${c.blurb}. Space to use.`)
    } else {
      activate(kind, item)
    }
    return
  }
  state.grow += c.grow
  state.score += c.points
  state.stats.eaten++
  if (c.hearts) {
    state.hearts = Math.min(maxHearts(), state.hearts + c.hearts)
    mark('heal')
  }
  sound.eat(c.grow >= 5 ? 2 : c.grow >= 2 ? 1 : 0)
  feel('eat', c.grow)
  const bits = [c.grow ? `+${c.grow} ×` : '', c.points ? `+${c.points}` : '', c.hearts ? `+${c.hearts} ♥` : ''].filter(Boolean)
  popup(item, bits.join(' ') || c.name, 'sun')
}

/** Start an effect for `bars`, or, if it is already running, stretch it, start it over, or leave it. */
export function applyEffect(effect: keyof typeof state.effects, bars: number, stack: Stack) {
  const until = state.effects[effect]
  const running = until > state.step
  if (stack === 'extend') state.effects[effect] = Math.max(until, state.step) + bars * 16
  else if (stack === 'refresh') state.effects[effect] = Math.max(until, state.step + bars * 16)
  else if (!running) state.effects[effect] = state.step + bars * 16
  effectSpan[effect] = Math.max(state.effects[effect] - state.step, 1)
}
/** How long each running effect was set to last, for the HUD's bars. */
export const effectSpan: Record<keyof typeof state.effects, number> = { shield: 1, double: 1, slow: 1, magnet: 1, ghost: 1 }

/** Start a power-up, or stretch its effect if it is already running. */
export function activate(kind: Holdable, at: Vec) {
  if (isCustom(kind)) {
    const c = customItem(kind)
    if (!c) return
    for (const effect of c.effects) {
      if (effect === 'dash') dash()
      else applyEffect(effect, c.bars, c.stack)
    }
    sound.pill()
    popup(at, c.name, 'mint')
    notice(kind, c.name, c.blurb)
    mark('use')
    return
  }
  const power = POWERS[kind]
  const tweak = live().items[kind] ?? {}
  if (kind === 'dash') dash()
  else applyEffect(kind, tweak.bars ?? power.bars, tweak.stack ?? 'extend')
  sound.pill()
  popup(at, power.name, power.tone)
  notice(kind, power.name, power.blurb)
  mark('use')
}

/**
 * With items changed, each bonus item has a weight: its stock share of the
 * old rolls (cherry 0.3, star 0.1, the six pills 0.22 between them), or a
 * home-made item's own rate, times the global and level ×. One roll picks
 * at most one, so the weights add up to the chance anything drops.
 */
export function dropWeighted(roll: number, level: number) {
  const options: [kind: ItemKind, weight: number, steps: number][] = [['cherry', 0.3 * rateOf('cherry', level), lifeOf('cherry', 48)]]
  if (level >= 1) {
    options.push(['star', 0.1 * rateOf('star', level), lifeOf('star', 32)])
    for (const kind of POWER_KINDS) options.push([kind, (0.22 / POWER_KINDS.length) * rateOf(kind, level), lifeOf(kind, 48)])
  }
  if (revision.rev >= 2) {
    options.push(['cookie', 0.1 * rateOf('cookie', level), lifeOf('cookie', 48)])
    if (level >= 1) options.push(['wizard', 0.04 * rateOf('wizard', level), lifeOf('wizard', 32)])
    if (level >= 2) options.push(['starry', 0.02 * rateOf('starry', level), lifeOf('starry', 96)])
  }
  for (const c of live().custom) if (level >= c.from) options.push([c.id as CustomId, c.rate * rateOf(c.id, level), c.life * 16])
  const total = options.reduce((sum, [, w]) => sum + w, 0)
  const chance = Math.min(0.95, total)
  if (roll >= chance || total <= 0) return
  let at = (roll / chance) * total
  for (const [kind, weight, steps] of options) {
    at -= weight
    if (at < 0) return addItem(kind, steps)
  }
}

/** Lunge ahead, passing over the body; through the wall in normal mode, stopping short of it in hardcore. */
export function dash() {
  for (let i = 0; i < DASH_CELLS; i++) {
    const head = state.snake[0]!
    const next = { x: head.x + state.direction.x, y: head.y + state.direction.y }
    if (next.x < 0 || next.y < 0 || next.x >= state.cols || next.y >= state.rows) {
      if (edgesFor(state.level) === 'kill') break
      next.x = (next.x + state.cols) % state.cols
      next.y = (next.y + state.rows) % state.rows
    }
    if (isWall(next)) break
    state.snake.unshift(next)
    if (state.grow > 0) state.grow--
    else state.snake.pop()
    arrive(next)
  }
  // A beat of ghost, so landing on the body is not a bite.
  state.effects.ghost = Math.max(state.effects.ghost, state.step + 4)
}

/** Fruit within reach slides one cell toward the head. */
export function pullFruit() {
  const head = state.snake[0]!
  for (const item of state.items) {
    if (!(item.kind in FRUIT_GROW)) continue
    const dx = head.x - item.x
    const dy = head.y - item.y
    if (Math.abs(dx) + Math.abs(dy) > 10) continue
    const step = Math.abs(dx) >= Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) }
    const to = { x: item.x + step.x, y: item.y + step.y }
    if (same(to, head)) {
      eat(item)
      continue
    }
    const blocked = isWall(to) || state.snake.some((c) => same(c, to)) || state.items.some((i) => i !== item && same(i, to))
    if (!blocked) Object.assign(item, to)
  }
}

/** Share of an effect still left, 0 to 1, for the HUD. */
export function effectLeft(effect: keyof typeof state.effects): number {
  const total = Math.max(effectSpan[effect], POWERS[effect].bars * 16)
  return Math.max(0, Math.min(1, (state.effects[effect] - state.step) / total))
}
