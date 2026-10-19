<script setup lang="ts">
/**
 * The board, drawn on one canvas every frame instead of as SVG elements
 * (Settings → Renderer). The still parts (grid, frame, walls) are drawn
 * once into a layer of their own; the rest is drawn by src/render/draw.ts.
 *
 * The game's SVG art (items, power-ups, hats) lives inside the canvas as
 * real elements. With HTML-in-Canvas the browser lays them out and the
 * frame is drawn in the canvas's `paint` event, where `drawElementImage`
 * paints them in; without it, they become images and the frame is drawn
 * on each animation frame.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { state, worldSlowed } from '../game'
import { shown } from '../looks'
import { colorOf, mp } from '../multiplayer'
import { htmlInCanvas } from '../renderer'
import { drawBack, drawFront, resetColors, sweep, type Puff } from '../render/draw'
import { HAT_BOX, ITEM_BOX, registerIcon, type Box } from '../render/icons'
import Hat from './Hat.vue'
import ItemArt from './ItemArt.vue'

const root = ref<HTMLDivElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)

/* ─── Size: device pixels, and where the board sits in them ─── */
const size = ref({ w: 1, h: 1, dpr: 1 })
const fit = computed(() => {
  const { w, h } = size.value
  const s = Math.min(w / (state.cols + 0.5), h / (state.rows + 0.5))
  return { s, ox: (w - s * (state.cols + 0.5)) / 2 + 0.25 * s, oy: (h - s * (state.rows + 0.5)) / 2 + 0.25 * s }
})
/** One cell in CSS pixels: the size the icon elements are laid out at. */
const cellCss = computed(() => fit.value.s / size.value.dpr)

/* ─── The icons the board needs right now ─── */
interface Icon { key: string; box: Box; kind?: string; hat?: string; mono?: string }
const icons = computed<Icon[]>(() => {
  const out = new Map<string, Icon>()
  for (const item of state.items) out.set(`item:${item.kind}`, { key: `item:${item.kind}`, box: ITEM_BOX, kind: item.kind })
  if (shown.value.hat !== 'none') out.set(`hat:${shown.value.hat}`, { key: `hat:${shown.value.hat}`, box: HAT_BOX, hat: shown.value.hat })
  for (const p of Object.values(mp.peers)) {
    const hat = mp.players.find((q) => q.index === p.index)?.look?.hat ?? 'none'
    const color = colorOf(p.index)
    if (hat !== 'none') out.set(`hat:${hat}:${color}`, { key: `hat:${hat}:${color}`, box: HAT_BOX, hat, mono: color })
  }
  return [...out.values()]
})

/* ─── The trail: a puff behind the tail each step (as on the SVG board) ─── */
const RAINBOW = ['#FF3355', '#FF9966', '#FFE14D', '#5CFF5C', '#3FA9FF', '#B26BFF']
const CONFETTI = ['var(--coral)', 'var(--sun)', 'var(--mint)', 'var(--sky)', 'var(--rose)', 'var(--lavender)']
let puffs: Puff[] = []
let puffId = 0
watch(
  () => state.step,
  () => {
    const kind = shown.value.trail
    const tail = state.snake[state.snake.length - 1]
    if (kind === 'none' || state.status !== 'running' || !tail) return
    const now = performance.now()
    const id = ++puffId
    const angle = Math.random() * Math.PI * 2
    const color =
      kind === 'sparks' ? (id % 2 ? 'var(--sun)' : 'var(--peach)')
      : kind === 'hearts' ? 'var(--rose)'
      : kind === 'stars' ? 'var(--sun)'
      : kind === 'confetti' ? CONFETTI[id % CONFETTI.length]!
      : RAINBOW[id % RAINBOW.length]!
    puffs = [
      ...puffs.filter((p) => now - p.at < 800),
      { id, x: tail.x + 0.5, y: tail.y + 0.5, dx: Math.cos(angle) * 0.7, dy: Math.sin(angle) * 0.7 - 0.3, color, spin: (Math.random() - 0.5) * 360, at: now },
    ].slice(-30)
  },
)

/* ─── One shake per hit, one pulse per beat ─── */
let beatAt = -1e9
let downbeat = false
watch(
  () => state.beat,
  (beat) => {
    beatAt = performance.now()
    downbeat = beat % 4 === 1
  },
)
watch(
  () => state.shake,
  () => {
    root.value?.animate(
      [
        { transform: 'translate(0, 0)' },
        { transform: 'translate(-7px, 3px)' },
        { transform: 'translate(6px, -4px)' },
        { transform: 'translate(-3px, 2px)' },
        { transform: 'translate(0, 0)' },
      ],
      { duration: 280, easing: 'ease-out' },
    )
  },
)

/* ─── Drawing ─── */
let ctx: CanvasRenderingContext2D | null = null
const back = document.createElement('canvas')
const backCtx = back.getContext('2d')!
/** What the still layer was drawn for; redrawn when any of it changes. */
let backFor = ''
/** Animation time: it stands still while the game is paused, as the SVG board's animations do. */
let anim = 0
/** The world's animation time: half speed during slow-mo. */
let world = 0
let lastWall = performance.now()

function render() {
  const c = canvas.value
  if (!c || !ctx) return
  const wall = performance.now()
  if (state.status !== 'paused') {
    anim += wall - lastWall
    world += (wall - lastWall) * (worldSlowed() ? 0.5 : 1)
  }
  lastWall = wall
  const { s, ox, oy } = fit.value
  const { dpr } = size.value
  const key = `${c.width}x${c.height}|${state.cols}x${state.rows}|${state.walls.length}:${state.walls[0]}:${state.walls[state.walls.length - 1]}`
  if (key !== backFor) {
    back.width = c.width
    back.height = c.height
    drawBack(backCtx, { s, ox, oy, dpr })
    backFor = key
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, c.width, c.height)
  ctx.drawImage(back, 0, 0)
  const keep = new Set<string>()
  drawFront({ ctx, s, ox, oy, dpr, now: anim, world, wall, beatAt, downbeat, puffs }, keep)
  sweep(keep)
}

let raf = 0
function loop() {
  raf = requestAnimationFrame(loop)
  const c = canvas.value as (HTMLCanvasElement & { requestPaint?: () => void }) | null
  // With HTML-in-Canvas the frame is drawn in the paint event, once the icons' snapshots are ready.
  if (htmlInCanvas && c?.requestPaint) c.requestPaint()
  else render()
}

let observer: ResizeObserver | null = null
onMounted(() => {
  const c = canvas.value!
  ctx = c.getContext('2d')
  resetColors()
  if (htmlInCanvas) c.addEventListener('paint', render)
  observer = new ResizeObserver(([entry]) => {
    const dpr = window.devicePixelRatio || 1
    const box = entry!.contentRect
    c.width = Math.max(1, Math.round(box.width * dpr))
    c.height = Math.max(1, Math.round(box.height * dpr))
    size.value = { w: c.width, h: c.height, dpr }
  })
  observer.observe(c)
  raf = requestAnimationFrame(loop)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  observer?.disconnect()
  canvas.value?.removeEventListener('paint', render)
})
</script>

<template>
  <div ref="root" class="board-stack">
    <!-- layoutsubtree (Chromium up to 156) and content="drawable" (newer) both opt the icons in to layout -->
    <canvas ref="canvas" class="board-canvas" layoutsubtree content="drawable" role="img" :aria-label="`Snake, ${state.snake.length} cells long, score ${state.score}`">
      <svg
        v-for="icon in icons"
        :key="icon.key"
        :ref="(el) => registerIcon(icon.key, el as Element | null)"
        class="icon"
        drawable
        :data-w="icon.box[2]"
        :data-h="icon.box[3]"
        :width="icon.box[2] * cellCss"
        :height="icon.box[3] * cellCss"
        :viewBox="icon.box.join(' ')"
        aria-hidden="true"
      >
        <ItemArt v-if="icon.kind" :kind="icon.kind as any" still />
        <Hat v-else-if="icon.hat" :hat="icon.hat" :mono="icon.mono" />
      </svg>
    </canvas>
  </div>
</template>

<style scoped>
.board-stack { position: relative; width: 100%; height: 100%; }
.board-canvas {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
}
/* Laid out for drawing, never shown or clicked as themselves. */
.icon { position: absolute; left: 0; top: 0; pointer-events: none; overflow: visible; }
</style>
