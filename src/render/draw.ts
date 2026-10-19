/**
 * The canvas board's drawing: the same picture as Board.vue, made by hand
 * every frame. Everything the SVG board animates with CSS is worked out
 * here from the time since it appeared, so the canvas needs no DOM per
 * thing on the board.
 *
 * Units: after `toCells`, one unit is one cell, as in the SVG's viewBox.
 * Widths the SVG gives in screen px (non-scaling strokes) go through `px`.
 */
import { toRaw } from 'vue'
import { HEART_PATH, isActive, match, state as live, TONE_COLOR, type Beam, type Laser, type LaserKind } from '../game'
import { shown } from '../looks'
import { colorOf, mp, playerName } from '../multiplayer'
import { drawIcon, HAT_BOX, ITEM_BOX } from './icons'

/**
 * The game state, read raw: drawing happens every frame anyway, so going
 * through Vue's reactive proxies for every cell and laser is pure cost.
 */
let state = toRaw(live)

/* ─── Colours and timing ─── */

let vars: Record<string, string> = {}
/** `var(--coral)` → its colour; anything else as it is. */
export function col(c: string) {
  const m = c.match(/^var\((--[\w-]+)\)$/)
  if (!m) return c
  return (vars[m[1]!] ??= getComputedStyle(document.documentElement).getPropertyValue(m[1]!).trim() || '#000')
}
export function resetColors() {
  vars = {}
  rgbs.clear()
}

/** cubic-bezier(0.22, 1, 0.36, 1): the game's --ease-out. */
function bezier(x1: number, y1: number, x2: number, y2: number) {
  const f = (a: number, b: number, t: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3
  return (x: number) => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    let lo = 0
    let hi = 1
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2
      if (f(x1, x2, mid) < x) lo = mid
      else hi = mid
    }
    return f(y1, y2, (lo + hi) / 2)
  }
}
const easeOut = bezier(0.22, 1, 0.36, 1)
const easeInOut = bezier(0.42, 0, 0.58, 1)
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

const rgbs = new Map<string, number[]>()
function rgb(c: string) {
  let v = rgbs.get(c)
  if (!v) {
    const h = col(c).replace('#', '')
    rgbs.set(c, (v = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))))
  }
  return v
}
function mix(a: string, b: string, t: number) {
  const [x, y] = [rgb(a), rgb(b)]
  return `rgb(${x.map((v, i) => Math.round(lerp(v, y[i]!, t))).join(',')})`
}

/* ─── What the board remembers between frames ─── */

/** When each thing first showed (animation time, ms), by kind and id. */
const seen = new Map<string, number>()
function since(key: string, now: number) {
  let t = seen.get(key)
  if (t === undefined) seen.set(key, (t = now))
  return now - t
}
/** Forget things that are gone, now and then. */
export function sweep(keep: Set<string>) {
  for (const k of seen.keys()) if (!keep.has(k)) seen.delete(k)
}

export interface Puff { id: number; x: number; y: number; dx: number; dy: number; color: string; spin: number; at: number }

export interface Frame {
  ctx: CanvasRenderingContext2D
  /** Device pixels per cell, and where cell (0, 0) sits. */
  s: number
  ox: number
  oy: number
  dpr: number
  /** Animation time in ms (it stands still while the game is paused). */
  now: number
  /** The world's animation time: as `now`, but at half speed during slow-mo (lasers, items, the snipper). */
  world: number
  /** Wall-clock ms, for the trail puffs, which are timed that way. */
  wall: number
  beatAt: number
  downbeat: boolean
  puffs: Puff[]
}

/* ─── Shapes ─── */

const LASER_COLOR: Record<LaserKind, string> = {
  red: 'var(--coral)', blue: 'var(--sky)', purple: 'var(--lavender)', white: '#FFFFFF', green: 'var(--sage)', gold: 'var(--sun)', prism: 'prism',
}
const PRISM = ['#FF3355', '#FFE14D', '#5CFF5C', '#3FA9FF', '#B26BFF']
/** A fill for a laser part: its colour, or for a prism the rainbow across the part's box (as the SVG's gradient does). */
function laserFill(ctx: CanvasRenderingContext2D, kind: LaserKind, x: number, y: number, w: number, h: number) {
  if (kind !== 'prism') return col(LASER_COLOR[kind])
  const g = ctx.createLinearGradient(x, y, x + w, y + h)
  PRISM.forEach((c, i) => g.addColorStop(i / 4, c))
  return g
}
const half = (beam: Beam) => (beam.width - 1) / 2
const emitterSize = (beam: Beam) => (beam.width === 3 ? 1.6 : 0.7)

/** Warning stripes, one tile per colour and size, laid at 45° like the SVG's pattern. */
const hatches = new Map<string, CanvasPattern>()
function hatch(ctx: CanvasRenderingContext2D, color: string, s: number) {
  const key = `${color}@${s.toFixed(2)}`
  let pat = hatches.get(key)
  if (pat) return pat
  const size = Math.max(2, Math.round(0.5 * s))
  const tile = document.createElement('canvas')
  tile.width = size
  tile.height = size
  const t = tile.getContext('2d')!
  t.fillStyle = color
  t.fillRect(0, 0, Math.round(0.22 * s), size)
  pat = ctx.createPattern(tile, 'repeat')!
  hatches.set(key, pat)
  return pat
}

/** A strike's bolt, made into a path once (it never changes after the strike). */
const bolts = new WeakMap<Beam, Path2D>()
function bolt(beam: Beam) {
  let path = bolts.get(beam)
  if (!path) {
    const nums = beam.bolt.split(/[\s,]+/).filter(Boolean).map(Number)
    path = new Path2D()
    for (let i = 0; i < nums.length; i += 2) {
      if (i === 0) path.moveTo(nums[i]!, nums[i + 1]!)
      else path.lineTo(nums[i]!, nums[i + 1]!)
    }
    bolts.set(beam, path)
  }
  return path
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r
    const a = (i * Math.PI) / 5 - Math.PI / 2
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
  }
  ctx.closePath()
}
const heart = new Path2D(HEART_PATH)

/* ─── The still layer: grid, frame, walls ─── */

export function drawBack(ctx: CanvasRenderingContext2D, f: Pick<Frame, 's' | 'ox' | 'oy' | 'dpr'>) {
  state = toRaw(live)
  const { s, ox, oy, dpr } = f
  const { cols, rows } = state
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  // The grid: each cell's top and left edge, one screen pixel, snapped to the pixel grid.
  // Faint, as the SVG board's pattern comes out.
  ctx.fillStyle = col('var(--border)')
  ctx.globalAlpha = 0.35
  const line = Math.max(1, Math.round(dpr))
  for (let x = 0; x < cols; x++) ctx.fillRect(Math.round(ox + x * s), Math.round(oy), line, Math.round(rows * s))
  for (let y = 0; y < rows; y++) ctx.fillRect(Math.round(ox), Math.round(oy + y * s), Math.round(cols * s), line)
  ctx.globalAlpha = 1
  // The frame and its glow.
  for (const [w, a] of [[10, 0.08], [6, 0.16], [3, 1]] as const) {
    ctx.strokeStyle = col('var(--sky)')
    ctx.globalAlpha = a
    ctx.lineWidth = w * dpr
    ctx.strokeRect(ox, oy, cols * s, rows * s)
  }
  ctx.globalAlpha = 1
  // Walls: solid blocks with a lit top edge.
  toCells(ctx, f)
  for (const i of state.walls) {
    const x = i % cols
    const y = Math.floor(i / cols)
    ctx.fillStyle = '#2A2350'
    ctx.fillRect(x + 0.04, y + 0.04, 0.92, 0.92)
    ctx.strokeStyle = col('var(--lavender)')
    ctx.lineWidth = 0.06
    ctx.strokeRect(x + 0.04, y + 0.04, 0.92, 0.92)
    ctx.globalAlpha = 0.45
    ctx.fillStyle = col('var(--lavender)')
    ctx.fillRect(x + 0.14, y + 0.14, 0.72, 0.12)
    ctx.globalAlpha = 1
  }
}

export function toCells(ctx: CanvasRenderingContext2D, f: Pick<Frame, 's' | 'ox' | 'oy'>) {
  ctx.setTransform(f.s, 0, 0, f.s, f.ox, f.oy)
}

/* ─── The moving layer ─── */

export function drawFront(f: Frame, keep: Set<string>) {
  state = toRaw(live)
  const { ctx, s, dpr, now } = f
  const px = (n: number) => (n * dpr) / s
  const { cols, rows } = state
  toCells(ctx, f)

  // Beat pulse: the frame flashes on every beat, stronger on the one.
  const pulse = 1 - easeOut(clamp01((f.wall - f.beatAt) / 260))
  if (pulse > 0) {
    ctx.globalAlpha = (f.downbeat ? 0.55 : 0.3) * pulse
    ctx.strokeStyle = col('var(--mint)')
    ctx.lineWidth = px(8)
    ctx.strokeRect(0, 0, cols, rows)
    ctx.globalAlpha = 1
  }

  for (const laser of state.lasers) if (!laser.struck) drawWarning(f, laser, keep)

  for (const item of state.items) {
    const key = `i${item.id}`
    keep.add(key)
    const age = since(key, f.world)
    const pop = easeOut(clamp01(age / 300))
    let alpha = pop
    if (item.until !== null && item.until - state.step <= 8 && (f.world % 250) >= 125) alpha *= 0.25
    let scale = 0.95 + 0.05 * pop
    let spin = 0
    if (item.kind === 'star') spin = ((f.world % 3000) / 3000) * Math.PI * 2
    if ((item.kind === 'heart' || item.kind === 'wizard' || item.kind === 'totem') && f.world % 600 >= 300) scale *= 1.25
    ctx.save()
    ctx.translate(item.x + 0.5, item.y + 0.5)
    ctx.rotate(spin)
    ctx.scale(scale, scale)
    ctx.globalAlpha = alpha
    drawIcon(ctx, `item:${item.kind}`, ITEM_BOX, s)
    ctx.restore()
  }

  // A starry cookie bursts into stars.
  for (const b of state.bursts) {
    const key = `b${b.id}`
    keep.add(key)
    const e = easeOut(clamp01(since(key, now) / 900))
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2
      const d = 1.3 + (i % 3) * 0.45
      ctx.save()
      ctx.translate(b.x + 0.5 + Math.cos(a) * d * e, b.y + 0.5 + Math.sin(a) * d * e)
      ctx.rotate(((i % 2 ? 1 : -1) * 220 * e * Math.PI) / 180)
      ctx.scale(lerp(1.2, 0.3, e), lerp(1.2, 0.3, e))
      ctx.globalAlpha = 1 - e
      ctx.fillStyle = col('var(--sun)')
      star(ctx, 0, 0, 0.22)
      ctx.fill()
      ctx.restore()
    }
  }

  for (const piece of state.debris) drawDebris(f, piece, keep)
  drawHolograms(f)
  drawPuffs(f)
  drawSnake(f)
  drawSnipper(f, keep)
  for (const laser of state.lasers) if (laser.struck) drawStrike(f, laser, keep)

  // Floating numbers: rise in eight steps and fade.
  for (const p of state.popups) {
    const key = `p${p.id}`
    keep.add(key)
    const t = Math.min(1, Math.floor(clamp01(since(key, now) / 1000) * 8) / 8)
    ctx.globalAlpha = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8
    text(f, p.text, p.x + 0.5, p.y + lerp(0.2, -1.2, t), 0.6, col(TONE_COLOR[p.tone]), 0.16)
  }
  ctx.globalAlpha = 1
}

/** Text in the pixel font, `size` cells tall, centred on x; drawn in screen pixels (canvas text at fractions of a pixel is unreliable). */
function text(f: Frame, str: string, x: number, y: number, size: number, fill: string, outline = 0) {
  const { ctx, s, ox, oy } = f
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.font = `${size * s}px ${col('var(--font-pixel)')}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  const X = ox + x * s
  const Y = oy + y * s
  if (outline) {
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#000'
    ctx.lineWidth = outline * s
    ctx.strokeText(str, X, Y)
  }
  ctx.fillStyle = fill
  ctx.fillText(str, X, Y)
  ctx.restore()
}

function drawWarning(f: Frame, laser: Laser, keep: Set<string>) {
  const { ctx, s, now } = f
  const { cols, rows } = state
  const key = `w${laser.id}`
  keep.add(key)
  const age = since(key, f.world)
  const p = clamp01(age / laser.warnMs)
  // The stripes breathe: 0.14 to 0.36, there and back every 0.8 s.
  const phase = (age % 800) / 400
  const breathe = easeInOut(phase <= 1 ? phase : 2 - phase)
  for (const beam of laser.beams) {
    const row = beam.axis === 'row'
    const x = row ? 0 : beam.index - half(beam)
    const y = row ? beam.index - half(beam) : 0
    const w = row ? cols : beam.width
    const h = row ? beam.width : rows
    ctx.globalAlpha = lerp(0.14, 0.36, breathe)
    const pat = hatch(ctx, laser.kind === 'prism' ? '#FFE14D' : col(LASER_COLOR[laser.kind]), s)
    // The stripes run in board space, tilted 45°, like the SVG's pattern.
    pat.setTransform(new DOMMatrix().rotate(45).scale(1 / s))
    ctx.fillStyle = pat
    ctx.fillRect(x, y, w, h)
    // The fuse burns along the line to the strike.
    ctx.globalAlpha = lerp(0.25, 0.95, p)
    const fx = row ? (laser.from === 'start' ? 0 : cols * (1 - p)) : beam.index + 0.4
    const fy = row ? beam.index + 0.4 : laser.from === 'start' ? 0 : rows * (1 - p)
    const fw = row ? cols * p : 0.2
    const fh = row ? 0.2 : rows * p
    ctx.fillStyle = laserFill(ctx, laser.kind, fx, fy, fw, fh)
    ctx.fillRect(fx, fy, fw, fh)
    // Emitters at both ends charge from pale to the laser's colour.
    ctx.globalAlpha = 1
    const e = emitterSize(beam)
    for (const end of [0, 1]) {
      const ex = row ? (end ? cols - e / 2 : -e / 2) : beam.index + 0.5 - e / 2
      const ey = row ? beam.index + 0.5 - e / 2 : end ? rows - e / 2 : -e / 2
      ctx.fillStyle =
        laser.kind === 'prism' ? (p < 0.5 ? col('var(--text)') : laserFill(ctx, 'prism', ex, ey, e, e)) : mix('var(--text)', LASER_COLOR[laser.kind], p)
      ctx.fillRect(ex, ey, e, e)
    }
  }
  ctx.globalAlpha = 1
}

function drawStrike(f: Frame, laser: Laser, keep: Set<string>) {
  const { ctx, s, dpr, now } = f
  const { cols, rows } = state
  const key = `s${laser.id}`
  keep.add(key)
  const t = clamp01(since(key, now) / 320)
  // 0–30 %: the beam shoots across; 30–100 %: it fades.
  const grow = t < 0.3 ? easeOut(t / 0.3) : 1
  const alpha = t < 0.3 ? 1 : 1 - easeOut((t - 0.3) / 0.7)
  if (alpha <= 0) return
  for (const beam of laser.beams) {
    const row = beam.axis === 'row'
    ctx.save()
    ctx.globalAlpha = alpha
    // Scale from the end the laser comes from.
    const ax = row ? (laser.from === 'start' ? -0.25 : cols + 0.25) : 0
    const ay = row ? 0 : laser.from === 'start' ? -0.25 : rows + 0.25
    ctx.translate(ax, ay)
    ctx.scale(row ? grow : 1, row ? 1 : grow)
    ctx.translate(-ax, -ay)
    const bx = row ? -0.25 : beam.index - half(beam) + 0.22
    const by = row ? beam.index - half(beam) + 0.22 : -0.25
    const bw = row ? cols + 0.5 : beam.width - 0.44
    const bh = row ? beam.width - 0.44 : rows + 0.5
    ctx.fillStyle = laserFill(ctx, laser.kind, bx, by, bw, bh)
    ctx.fillRect(bx, by, bw, bh)
    ctx.strokeStyle = col(laser.kind === 'gold' || laser.kind === 'white' ? 'var(--coral)' : 'var(--sun)')
    ctx.lineWidth = (3 * dpr) / s
    ctx.lineJoin = 'round'
    ctx.stroke(bolt(beam))
    ctx.fillStyle = '#fff'
    if (row) ctx.fillRect(-0.25, beam.index + 0.44, cols + 0.5, 0.12)
    else ctx.fillRect(beam.index + 0.44, -0.25, 0.12, rows + 0.5)
    ctx.restore()
  }
}

const SPARK_COLORS = ['var(--coral)', 'var(--sun)', 'var(--peach)']
const SPARKS = Array.from({ length: 6 }, (_, i) => {
  const a = (i / 6) * Math.PI * 2 + 0.3
  return [Math.cos(a) * 0.9, Math.sin(a) * 0.9] as const
})

function drawDebris(f: Frame, piece: (typeof state.debris)[number], keep: Set<string>) {
  const { ctx, s, dpr, now } = f
  const key = `d${piece.id}`
  keep.add(key)
  const age = since(key, now)
  piece.cells.forEach((cell, i) => {
    const popAt = piece.holdMs + i * piece.gapMs
    const t = age - popAt
    ctx.save()
    ctx.translate(cell.x + 0.5, cell.y + 0.5)
    // The cell: shivers while it lies there, then swells, flashes gold and pops.
    const b = clamp01(t / 280)
    if (b < 1) {
      let scale = 1
      let fill = col('var(--peach)')
      if (t > 0) {
        const e = easeOut(b < 0.45 ? b / 0.45 : (b - 0.45) / 0.55)
        scale = b < 0.45 ? lerp(1, 1.35, e) : lerp(1.35, 0, e)
        fill = b < 0.45 ? mix('var(--peach)', 'var(--sun)', e) : col('var(--sun)')
        ctx.globalAlpha = b < 0.45 ? 1 : 1 - e
      }
      const shiver = Math.floor(now / 80) % 2 ? 1 : -1
      ctx.save()
      ctx.translate(0.03 * shiver, -0.02 * shiver)
      ctx.scale(scale, scale)
      ctx.fillStyle = fill
      ctx.fillRect(-0.38, -0.38, 0.76, 0.76)
      ctx.strokeStyle = '#000'
      ctx.lineWidth = (2 * dpr) / s / scale || 0
      if (scale > 0.01) ctx.strokeRect(-0.38, -0.38, 0.76, 0.76)
      ctx.restore()
      ctx.globalAlpha = 1
    }
    // A ring spreads out, and six sparks fly.
    const r = clamp01(t / 450)
    if (r < 1) {
      const e = easeOut(r)
      ctx.globalAlpha = lerp(0.9, 0, e)
      ctx.beginPath()
      ctx.arc(0, 0, 0.45 * lerp(0.4, 1.9, e), 0, Math.PI * 2)
      ctx.strokeStyle = col('var(--coral)')
      ctx.lineWidth = (2 * dpr) / s
      ctx.stroke()
    }
    const sp = clamp01(t / 500)
    if (sp < 1) {
      const e = easeOut(sp)
      ctx.globalAlpha = 1 - e
      SPARKS.forEach(([dx, dy], k) => {
        ctx.beginPath()
        ctx.arc(dx * e, dy * e, 0.09 * lerp(1, 0.2, e), 0, Math.PI * 2)
        ctx.fillStyle = col(SPARK_COLORS[(i + k) % 3]!)
        ctx.fill()
      })
    }
    ctx.restore()
  })
  ctx.globalAlpha = 1
}

/** The snake as runs of touching cells: the line breaks where it wraps through an edge. */
function runs(cells: { x: number; y: number }[]) {
  const out: { x: number; y: number }[][] = []
  let run: { x: number; y: number }[] = []
  cells.forEach((c, i) => {
    const prev = cells[i - 1]
    if (prev && Math.abs(prev.x - c.x) + Math.abs(prev.y - c.y) > 1) {
      out.push(run)
      run = []
    }
    run.push(c)
  })
  out.push(run)
  return out
}
function tube(ctx: CanvasRenderingContext2D, run: { x: number; y: number }[]) {
  ctx.beginPath()
  run.forEach((c, i) => (i ? ctx.lineTo(c.x + 0.5, c.y + 0.5) : ctx.moveTo(c.x + 0.5, c.y + 0.5)))
}

const RAINBOW = ['#FF3355', '#FF9966', '#FFE14D', '#5CFF5C', '#3FA9FF', '#B26BFF']

function drawSnake(f: Frame) {
  const { ctx, s, dpr, now } = f
  const snake = state.snake
  if (!snake.length) return
  const rainbow = shown.value.color.id === 'rainbow' && !isActive('double')
  const body = isActive('double') ? col('var(--sun)') : rainbow ? '#FFFFFF' : col(shown.value.color.value)
  const headColor = shown.value.color.id === 'green' ? col('var(--mint)') : shown.value.color.id === 'rainbow' ? col('var(--sun)') : col(shown.value.color.value)
  ctx.lineCap = 'square'
  ctx.lineJoin = 'miter'
  const parts = runs(snake)
  for (const [w, c] of [[0.84, '#000'], [0.7, body]] as const) {
    ctx.strokeStyle = c
    ctx.lineWidth = w
    for (const run of parts) {
      tube(ctx, run)
      ctx.stroke()
    }
  }
  if (rainbow) for (let i = 1; i < snake.length; i++) {
    ctx.fillStyle = RAINBOW[(i - 1) % RAINBOW.length]!
    ctx.fillRect(snake[i]!.x + 0.15, snake[i]!.y + 0.15, 0.7, 0.7)
  }
  ctx.globalAlpha = 0.45
  ctx.fillStyle = '#000'
  for (let i = 1; i < snake.length; i += 2) ctx.fillRect(snake[i]!.x + 0.38, snake[i]!.y + 0.38, 0.24, 0.24)
  ctx.globalAlpha = 1
  const head = snake[0]!
  if (isActive('shield')) {
    ctx.save()
    ctx.translate(head.x + 0.5, head.y + 0.5)
    ctx.rotate(((now % 2000) / 2000) * Math.PI * 2)
    ctx.setLineDash([(5 * dpr) / s, (4 * dpr) / s])
    ctx.beginPath()
    ctx.arc(0, 0, 0.72, 0, Math.PI * 2)
    ctx.strokeStyle = col('var(--sky)')
    ctx.lineWidth = (3 * dpr) / s
    ctx.stroke()
    ctx.restore()
  }
  ctx.fillStyle = headColor
  ctx.fillRect(head.x + 0.06, head.y + 0.06, 0.88, 0.88)
  ctx.strokeStyle = '#000'
  ctx.lineWidth = (2 * dpr) / s
  ctx.strokeRect(head.x + 0.06, head.y + 0.06, 0.88, 0.88)
  const { x: dx, y: dy } = state.direction
  ctx.fillStyle = '#000'
  for (const sgn of [1, -1]) {
    ctx.beginPath()
    ctx.arc(head.x + 0.5 + dx * 0.14 - sgn * dy * 0.18, head.y + 0.5 + dy * 0.14 + sgn * dx * 0.18, 0.08, 0, Math.PI * 2)
    ctx.fill()
  }
  if (shown.value.hat !== 'none') {
    ctx.save()
    ctx.translate(head.x + 0.5, head.y + 0.5)
    drawIcon(ctx, `hat:${shown.value.hat}`, HAT_BOX, s)
    ctx.restore()
  }
  if (match.on) nameTag(f, playerName(), head, shown.value.hat !== 'none', col('var(--sage)'))
}

function nameTag(f: Frame, name: string, head: { x: number; y: number }, hat: boolean, color: string) {
  const a = f.ctx.globalAlpha
  f.ctx.globalAlpha = a * 0.9
  text(f, name, head.x + 0.5, head.y - (hat ? 1.2 : 0.35), 0.55, color)
  f.ctx.globalAlpha = a
}

function drawHolograms(f: Frame) {
  const { ctx, s, dpr, now } = f
  for (const p of Object.values(mp.peers)) {
    if (!p.snake.length) continue
    const color = colorOf(p.index)
    const flicker = (now % 3200) / 3200
    ctx.save()
    ctx.globalAlpha = !p.alive ? 0.25 : flicker < 0.43 ? 0.85 : flicker < 0.46 ? 0.55 : flicker < 0.78 ? 0.9 : 0.7
    ctx.lineCap = 'square'
    ctx.lineJoin = 'miter'
    const parts = runs(p.snake)
    const base = ctx.globalAlpha
    for (const run of parts) {
      ctx.globalAlpha = base * 0.28
      ctx.strokeStyle = color
      ctx.lineWidth = 0.7
      tube(ctx, run)
      ctx.stroke()
      ctx.globalAlpha = base * 0.8
      ctx.lineWidth = 0.12
      ctx.lineCap = 'butt'
      ctx.setLineDash([0.3, 0.2])
      tube(ctx, run)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.lineCap = 'square'
    }
    const head = p.snake[0]!
    ctx.globalAlpha = base * 0.8
    ctx.lineWidth = (2 * dpr) / s
    ctx.strokeRect(head.x + 0.12, head.y + 0.12, 0.76, 0.76)
    const hat = mp.players.find((q) => q.index === p.index)?.look?.hat ?? 'none'
    if (hat !== 'none') {
      ctx.save()
      ctx.translate(head.x + 0.5, head.y + 0.5)
      drawIcon(ctx, `hat:${hat}:${color}`, HAT_BOX, s)
      ctx.restore()
    }
    ctx.globalAlpha = base
    nameTag(f, p.name, head, hat !== 'none', color)
    ctx.restore()
  }
}

function drawPuffs(f: Frame) {
  const { ctx } = f
  const trail = shown.value.trail
  for (const p of f.puffs) {
    const e = easeOut(clamp01((f.wall - p.at) / 750))
    if (e >= 1) continue
    ctx.save()
    ctx.translate(p.x + p.dx * e, p.y + p.dy * e)
    ctx.rotate((p.spin * e * Math.PI) / 180)
    ctx.scale(lerp(1, 0.3, e), lerp(1, 0.3, e))
    ctx.globalAlpha = lerp(0.9, 0, e)
    ctx.fillStyle = col(p.color)
    if (trail === 'hearts') {
      ctx.scale(0.07, 0.07)
      ctx.translate(-3.5, -3)
      ctx.fill(heart)
    } else if (trail === 'stars') {
      star(ctx, 0, 0, 0.2)
      ctx.fill()
    } else if (trail === 'confetti') ctx.fillRect(-0.1, -0.05, 0.2, 0.1)
    else if (trail === 'rainbow') {
      ctx.beginPath()
      ctx.arc(0, 0, 0.16, 0, Math.PI * 2)
      ctx.fill()
    } else ctx.fillRect(-0.08, -0.08, 0.16, 0.16)
    ctx.restore()
  }
}

/* The snipper, from the SVG board's paths. */
const LEGS = new Path2D('M -0.1 -0.32 L -0.2 -0.46 M 0.05 -0.32 L 0 -0.47 M -0.1 0.32 L -0.2 0.46 M 0.05 0.32 L 0 0.47')
const SPINE = new Path2D('M -0.08 -0.3 L -0.08 0.3')
const PINCER_TOP = new Path2D('M 0.18 -0.12 Q 0.48 -0.2 0.5 0.02 Q 0.36 -0.06 0.22 -0.02 Z')
const PINCER_BOTTOM = new Path2D('M 0.18 0.12 Q 0.48 0.2 0.5 -0.02 Q 0.36 0.06 0.22 0.02 Z')

function drawSnipper(f: Frame, keep: Set<string>) {
  const { ctx, s, dpr } = f
  const now = f.world
  const sn = state.snipper
  if (!sn.active) return
  const key = 'snipper'
  keep.add(key)
  const pop = easeOut(clamp01(since(key, now) / 300))
  const line = (w: number) => (w * dpr) / s / 1.3
  ctx.save()
  ctx.translate(sn.x + 0.5, sn.y + 0.5)
  ctx.rotate(Math.atan2(sn.facing.y, sn.facing.x))
  ctx.scale(1.3, 1.3)
  ctx.globalAlpha = pop * (sn.resting ? 0.6 : 1)
  ctx.scale(0.95 + 0.05 * pop, 0.95 + 0.05 * pop)
  ctx.strokeStyle = '#000'
  ctx.lineCap = 'round'
  ctx.lineWidth = line(1.5)
  ctx.stroke(LEGS)
  ctx.beginPath()
  ctx.ellipse(-0.08, 0, 0.3, 0.32, 0, 0, Math.PI * 2)
  ctx.fillStyle = col('var(--lavender)')
  ctx.fill()
  ctx.lineWidth = line(2)
  ctx.stroke()
  ctx.lineWidth = line(1.5)
  ctx.stroke(SPINE)
  // Pincers snap, hinged at their back edge (0.35 s each way).
  const k = sn.resting ? 0.5 : easeInOut(((now % 700) / 350 <= 1 ? (now % 700) / 350 : 2 - (now % 700) / 350))
  for (const [path, hingeY, dir] of [[PINCER_TOP, -0.07, 1], [PINCER_BOTTOM, 0.07, -1]] as const) {
    const angle = sn.resting ? 0 : ((dir > 0 ? lerp(-12, 10, k) : lerp(10, -12, k)) * Math.PI) / 180
    ctx.save()
    ctx.translate(0.18, hingeY)
    ctx.rotate(angle)
    ctx.translate(-0.18, -hingeY)
    ctx.fillStyle = col('var(--coral)')
    ctx.fill(path)
    ctx.stroke(path)
    ctx.restore()
  }
  ctx.fillStyle = '#000'
  for (const y of [-0.1, 0.1]) {
    ctx.beginPath()
    ctx.arc(0.12, y, 0.05, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}
