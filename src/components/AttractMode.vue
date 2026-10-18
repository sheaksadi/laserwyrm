<script setup lang="ts">
/**
 * The start screen's backdrop: a faint snake wandering on its own, eating
 * what spawns around it, a laser now and then. Its own little toy, apart
 * from the real game (which stays seeded and replayable): one canvas, drawn
 * only while the start screen shows.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'

const canvas = ref<HTMLCanvasElement | null>(null)

const CELL = 30
const STEP_MS = 120
const MAX_ITEMS = 6
const MAX_LENGTH = 34

type Cell = { x: number; y: number }
type Item = { x: number; y: number; kind: 'fruit' | 'star' | 'cookie' | 'heart'; born: number }
type Pop = { x: number; y: number; at: number; color: string }
type Beam = { row: number; vertical: boolean; at: number }

const DIRS: Cell[] = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }]
const KINDS: Item['kind'][] = ['fruit', 'fruit', 'fruit', 'cookie', 'star', 'heart']

let cols = 0
let rows = 0
let snake: Cell[] = []
let dir = 0
let grow = 0
let items: Item[] = []
let pops: Pop[] = []
let beams: Beam[] = []
let lastStep = 0
let nextSpawn = 0
let nextBeam = 0
let frame = 0
let colors: Record<string, string> = {}

const rand = (n: number) => Math.floor(Math.random() * n)
const wrap = (v: number, n: number) => ((v % n) + n) % n
/** Distance the short way round, the board wrapping at its edges. */
const gap = (a: number, b: number, n: number) => Math.min(Math.abs(a - b), n - Math.abs(a - b))

function fresh() {
  const x = rand(cols)
  const y = rand(rows)
  dir = rand(4)
  snake = Array.from({ length: 6 }, (_, i) => ({ x: wrap(x - DIRS[dir]!.x * i, cols), y: wrap(y - DIRS[dir]!.y * i, rows) }))
  grow = 0
}

function spawn(now: number) {
  for (let tries = 0; tries < 20; tries++) {
    const x = rand(cols)
    const y = rand(rows)
    if (snake.some((c) => c.x === x && c.y === y) || items.some((i) => i.x === x && i.y === y)) continue
    items.push({ x, y, kind: KINDS[rand(KINDS.length)]!, born: now })
    return
  }
}

/** One move: toward the nearest item, never into itself, a little wander so it looks alive. */
function step(now: number) {
  const head = snake[0]!
  const target = items.reduce<Item | null>((best, i) => {
    const d = gap(i.x, head.x, cols) + gap(i.y, head.y, rows)
    return !best || d < gap(best.x, head.x, cols) + gap(best.y, head.y, rows) ? i : best
  }, null)
  const choices = [dir, (dir + 1) % 4, (dir + 3) % 4]
    .map((d) => {
      const next = { x: wrap(head.x + DIRS[d]!.x, cols), y: wrap(head.y + DIRS[d]!.y, rows) }
      // The tail moves on this step, so its cell is free.
      const blocked = snake.slice(0, -1).some((c) => c.x === next.x && c.y === next.y)
      const dist = target ? gap(next.x, target.x, cols) + gap(next.y, target.y, rows) : 0
      return { d, next, blocked, score: dist + Math.random() * 1.6 + (d === dir ? -0.3 : 0) }
    })
    .filter((c) => !c.blocked)
    .sort((a, b) => a.score - b.score)
  const pick = choices[0]
  if (!pick) return fresh()
  dir = pick.d
  snake.unshift(pick.next)
  const eaten = items.findIndex((i) => i.x === pick.next.x && i.y === pick.next.y)
  if (eaten >= 0) {
    const item = items.splice(eaten, 1)[0]!
    pops.push({ x: item.x, y: item.y, at: now, color: colorOf(item.kind) })
    grow += item.kind === 'cookie' ? 2 : item.kind === 'star' ? 3 : 1
  }
  if (grow > 0 && snake.length < MAX_LENGTH) grow--
  else snake.pop()
}

function colorOf(kind: Item['kind']) {
  return kind === 'fruit' ? colors.coral! : kind === 'star' ? colors.sun! : kind === 'cookie' ? '#C98A4B' : colors.rose!
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const rr = i % 2 ? r * 0.45 : r
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
  }
  ctx.closePath()
  ctx.fill()
}

function draw(now: number) {
  const el = canvas.value
  const ctx = el?.getContext('2d')
  if (!el || !ctx) return
  const dpr = window.devicePixelRatio || 1
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, el.width, el.height)
  const t = Math.min(1, (now - lastStep) / STEP_MS)
  const center = (c: Cell) => [c.x * CELL + CELL / 2, c.y * CELL + CELL / 2] as const

  // Lasers: a beam across a row or column that flashes and fades.
  for (const b of beams) {
    const age = (now - b.at) / 900
    ctx.globalAlpha = Math.max(0, 1 - age) * 0.8
    ctx.fillStyle = colors.coral!
    if (b.vertical) ctx.fillRect(b.row * CELL + CELL * 0.3, 0, CELL * 0.4, rows * CELL)
    else ctx.fillRect(0, b.row * CELL + CELL * 0.3, cols * CELL, CELL * 0.4)
  }
  ctx.globalAlpha = 1

  // Items: they pop in, then bob.
  for (const i of items) {
    const [x, y] = center(i)
    const s = Math.min(1, (now - i.born) / 250) * (1 + Math.sin(now / 300 + i.x) * 0.06)
    ctx.fillStyle = colorOf(i.kind)
    if (i.kind === 'star') star(ctx, x, y, CELL * 0.4 * s)
    else if (i.kind === 'heart') {
      const r = CELL * 0.2 * s
      ctx.beginPath()
      ctx.arc(x - r * 0.9, y - r * 0.3, r, Math.PI, 0)
      ctx.arc(x + r * 0.9, y - r * 0.3, r, Math.PI, 0)
      ctx.lineTo(x, y + r * 1.9)
      ctx.closePath()
      ctx.fill()
    } else {
      ctx.beginPath()
      ctx.arc(x, y, CELL * (i.kind === 'cookie' ? 0.36 : 0.32) * s, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // Snake: a thick line through its cells, the head eased toward its next cell, broken where it wraps.
  const points: [number, number][] = snake.map((c) => [...center(c)])
  if (snake.length > 1) {
    const [hx, hy] = points[0]!
    const [nx, ny] = points[1]!
    if (Math.abs(hx - nx) <= CELL && Math.abs(hy - ny) <= CELL) points[0] = [nx + (hx - nx) * t, ny + (hy - ny) * t]
  }
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = colors.sage!
  ctx.lineWidth = CELL * 0.62
  ctx.beginPath()
  points.forEach(([x, y], i) => {
    const prev = points[i - 1]
    if (!prev || Math.abs(prev[0] - x) > CELL * 1.5 || Math.abs(prev[1] - y) > CELL * 1.5) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.stroke()
  const [hx, hy] = points[0]!
  const d = DIRS[dir]!
  ctx.fillStyle = colors.ink!
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.arc(hx + d.x * 4 + d.y * side * 6, hy + d.y * 4 - d.x * side * 6, 2.6, 0, Math.PI * 2)
    ctx.fill()
  }

  // Pops: a ring where something was eaten.
  for (const p of pops) {
    const age = (now - p.at) / 500
    if (age > 1) continue
    const [x, y] = center(p)
    ctx.globalAlpha = 1 - age
    ctx.strokeStyle = p.color
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(x, y, CELL * (0.3 + age * 0.9), 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

function tick(now: number) {
  frame = requestAnimationFrame(tick)
  if (!cols) return
  // A long gap (a hidden tab) skips ahead rather than racing to catch up.
  if (now - lastStep > STEP_MS * 10) lastStep = now - STEP_MS
  while (now - lastStep >= STEP_MS) {
    lastStep += STEP_MS
    step(lastStep)
  }
  if (now >= nextSpawn) {
    if (items.length < MAX_ITEMS) spawn(now)
    nextSpawn = now + 700 + Math.random() * 1400
  }
  if (now >= nextBeam) {
    const vertical = Math.random() < 0.5
    beams.push({ row: rand(vertical ? cols : rows), vertical, at: now })
    nextBeam = now + 2500 + Math.random() * 4000
  }
  beams = beams.filter((b) => now - b.at < 900)
  pops = pops.filter((p) => now - p.at < 500)
  draw(now)
}

function fit() {
  const el = canvas.value
  if (!el) return
  const dpr = window.devicePixelRatio || 1
  const { width, height } = el.getBoundingClientRect()
  el.width = Math.round(width * dpr)
  el.height = Math.round(height * dpr)
  const next = [Math.max(8, Math.ceil(width / CELL)), Math.max(6, Math.ceil(height / CELL))] as const
  if (next[0] !== cols || next[1] !== rows) {
    ;[cols, rows] = next
    items = items.filter((i) => i.x < cols && i.y < rows)
    fresh()
  }
}

let observer: ResizeObserver | null = null
onMounted(() => {
  const style = getComputedStyle(document.documentElement)
  for (const name of ['coral', 'sun', 'rose', 'sage', 'ink']) colors[name] = style.getPropertyValue(`--${name}`).trim()
  fit()
  observer = new ResizeObserver(fit)
  if (canvas.value) observer.observe(canvas.value)
  // Still for anyone who asks for less motion: one frame, no loop.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    for (let i = 0; i < 4; i++) spawn(0)
    return draw(0)
  }
  lastStep = performance.now()
  frame = requestAnimationFrame(tick)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  observer?.disconnect()
})
</script>

<template>
  <canvas ref="canvas" class="attract" aria-hidden="true"></canvas>
</template>

<style scoped>
.attract {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0.28;
  pointer-events: none;
}
</style>
