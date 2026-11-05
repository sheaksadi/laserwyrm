/**
 * The creatures' art, shared by both boards so they draw the same picture:
 * what a Warden grows as the game goes on, its tentacles, little Wardens and
 * humans. Everything is in cells, around (0, 0) for a Warden and in the
 * cell's own 0–1 box for a human.
 */
import type { Person } from '../game'

export const BOSS_HULL = 'M-1 -1.45H1L1.45 -1V1L1 1.45H-1L-1.45 1V-1Z'
export const BOSS_PLATE = 'M-1.45 -0.45V-1H-1L-0.45 -1.45H-0.2L-0.2 -1.05H-0.75L-1.05 -0.75V-0.2H-1.45Z'

/** A ring of `n` spikes as one path: each a thin triangle from `r` out to `tip`. */
function ring(n: number, r: number, tip: number, width: number, turn = 0) {
  let d = ''
  for (let i = 0; i < n; i++) {
    const a = turn + (i / n) * Math.PI * 2
    const p = (rad: number, off: number) => `${(Math.cos(a + off) * rad).toFixed(3)} ${(Math.sin(a + off) * rad).toFixed(3)}`
    d += `M${p(r, -width)}L${p(tip, 0)}L${p(r, width)}Z`
  }
  return d
}

/** Two great horns over the shell. */
const HORNS = 'M-0.95 -1.4Q-1.5 -2.3 -0.75 -3.1Q-0.95 -2.3 -0.3 -1.45ZM0.95 -1.4Q1.5 -2.3 0.75 -3.1Q0.95 -2.3 0.3 -1.45Z'

/** What a Warden looks like at a stage: each one adds to the last. Only looks: it still fills three by three cells. */
export function bossLook(stage: number) {
  return {
    tentacles: stage < 2 ? 0 : Math.min(8, (stage - 1) * 2),
    reach: 2.4 + stage * 0.5,
    spikes: stage >= 2 ? ring(4 + stage * 2, 1.5, 1.95 + stage * 0.06, 0.13, 0.2) : '',
    teeth: stage >= 3 ? ring(10, 0.98, 0.68, 0.2) : '',
    horns: stage >= 4 ? HORNS : '',
    /** A slit for a pupil, on a burning iris. */
    slit: stage >= 3,
    /** Small eyes on the shell. */
    eyes: stage >= 5 ? [[-0.95, 0.95], [0.95, 0.95], [-0.95, -0.95], [0.95, -0.95]].slice(0, stage >= 6 ? 4 : 2) : [],
    shards: 2 + stage,
    /** Rings of menace around it. */
    aura: stage >= 6 ? 2 : stage >= 4 ? 1 : 0,
  }
}

/** One tentacle at time `t` (ms), as a tapering outline of x, y pairs. They grow from both sides, fanned out. */
export function tentacle(i: number, count: number, reach: number, t: number): number[] {
  const pairs = count / 2
  const fan = (Math.floor(i / 2) - (pairs - 1) / 2) * 0.62
  const a = (i % 2 ? Math.PI - fan : fan)
  const cx = Math.cos(a)
  const cy = Math.sin(a)
  const left: number[][] = []
  const right: number[][] = []
  const parts = 12
  for (let k = 0; k <= parts; k++) {
    const u = k / parts
    const along = 1.3 + u * reach
    const sway = Math.sin(t * 0.0032 + u * 4.2 + i * 1.7) * u * 0.95
    const x = cx * along - cy * sway
    const y = cy * along + cx * sway
    const w = 0.3 * (1 - u) + 0.03
    left.push([x - cy * w, y + cx * w])
    right.unshift([x + cy * w, y - cx * w])
  }
  return [...left, ...right].flat()
}

/** A little Warden's shape, inside one cell around (0, 0). */
export const MINI_SCALE = 0.3

export interface Block { x: number; y: number; w: number; h: number; c: string }

const SHIRTS = ['#3FA9FF', '#FF9966', '#B26BFF', '#FFE14D', '#5CFF5C']
const SKINS = ['#F2C9A1', '#C68642', '#8D5524']

/** A human as little blocks: mid-stride on odd steps, dressed for their trick. */
export function personBlocks(p: Person, step: number): Block[] {
  const stride = step % 2 ? 0.1 : -0.1
  const skin = SKINS[p.id % 3]!
  if (p.disguised) {
    // Fruit with feet: nearly an apple, if you do not look down.
    return [
      { x: 0.25, y: 0.22, w: 0.5, h: 0.46, c: '#FF3355' },
      { x: 0.46, y: 0.08, w: 0.08, h: 0.16, c: '#5CFF5C' },
      { x: 0.32, y: 0.68, w: 0.1, h: 0.2, c: skin },
      { x: 0.58, y: 0.68, w: 0.1, h: 0.2, c: skin },
    ]
  }
  const shirt = p.fake ? '#B08A5A' : SHIRTS[p.id % 5]!
  const face = p.fake ? '#C9A274' : skin
  const out: Block[] = [
    { x: 0.36, y: 0.06, w: 0.28, h: 0.28, c: face },
    { x: 0.3, y: 0.34, w: 0.4, h: 0.32, c: shirt },
    { x: 0.34 + (p.fake ? 0 : stride), y: 0.66, w: 0.12, h: 0.26, c: p.fake ? shirt : '#22224A' },
    { x: 0.54 - (p.fake ? 0 : stride), y: 0.66, w: 0.12, h: 0.26, c: p.fake ? shirt : '#22224A' },
  ]
  if (p.fake) return out
  // Arms up in panic.
  out.push({ x: 0.16, y: 0.16 + stride, w: 0.12, h: 0.26, c: skin }, { x: 0.72, y: 0.16 - stride, w: 0.12, h: 0.26, c: skin })
  // Eyes, looking where they run.
  out.push({ x: p.facing > 0 ? 0.52 : 0.4, y: 0.14, w: 0.08, h: 0.08, c: '#000000' })
  if (p.tactic === 'skate') out.push({ x: 0.14, y: 0.9, w: 0.72, h: 0.07, c: '#FF9966' })
  if (p.tactic === 'jetpack') out.push({ x: p.facing > 0 ? 0.14 : 0.7, y: 0.36, w: 0.16, h: 0.3, c: '#8888AA' })
  if (p.tactic === 'jetpack' && p.flame > step) out.push({ x: p.facing > 0 ? 0.16 : 0.72, y: 0.66, w: 0.12, h: 0.3, c: '#FFE14D' })
  return out
}
