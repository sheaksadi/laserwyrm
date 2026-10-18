<script setup lang="ts">
/**
 * The workshop's art view: draw sprites for your home-made items. On top,
 * your sprites (pick one, + for a new one, its name, 16 or 32 colours); in
 * the middle the 16 × 16 canvas (drag to draw); below, the palette; on the
 * right, the tools (pen, eraser, fill, picker, mirror) and a preview.
 * Undo and redo work here too.
 */
import { computed, ref } from 'vue'
import { blankSprite, design, PALETTE, PIXEL_CHARS, SPRITE_SIZE, type Sprite } from '../design'
import { spriteUrl } from '../sprites'

const N = SPRITE_SIZE
const selected = ref(design.sprites[0]?.id ?? null)
const sprite = computed<Sprite | undefined>(() => design.sprites.find((s) => s.id === selected.value))
const colorCount = computed(() => sprite.value?.colors ?? 16)
/** The colour drawing: a palette index; -1 erases. */
const color = ref(4)

function newSprite() {
  if (design.sprites.length >= 32) return
  const n = design.sprites.reduce((m, s) => Math.max(m, Number(s.id.slice(1))), 0) + 1
  const s = blankSprite(`s${n}`, n)
  design.sprites.push(s)
  selected.value = s.id
}
const confirmDelete = ref(false)
function removeSprite() {
  if (!confirmDelete.value) {
    confirmDelete.value = true
    setTimeout(() => (confirmDelete.value = false), 2500)
    return
  }
  confirmDelete.value = false
  const id = selected.value
  design.sprites = design.sprites.filter((s) => s.id !== id)
  // Items that used it go back to a plain shape.
  for (const c of design.custom) if (c.sprite === id) {
    c.shape = c.kind === 'fruit' ? 'fruit' : 'gem'
    delete c.sprite
  }
  selected.value = design.sprites[0]?.id ?? null
}
function setColors(n: 16 | 32) {
  const s = sprite.value
  if (!s) return
  s.colors = n
  // Going down to 16: pixels in the extra colours are cleared.
  if (n === 16) s.pixels = [...s.pixels].map((c) => (PIXEL_CHARS.indexOf(c) >= 16 ? '.' : c)).join('')
  if (color.value >= n) color.value = 4
}

/* ─── Drawing ─── */

type Tool = 'pen' | 'erase' | 'fill' | 'pick'
const TOOLS: { id: Tool; name: string }[] = [
  { id: 'pen', name: 'Pen' },
  { id: 'erase', name: 'Eraser' },
  { id: 'fill', name: 'Fill' },
  { id: 'pick', name: 'Picker' },
]
const tool = ref<Tool>('pen')
const mirror = ref(false)
const canvas = ref<SVGSVGElement | null>(null)
let drawing = false

const charFor = () => (tool.value === 'erase' || color.value < 0 ? '.' : PIXEL_CHARS[color.value]!)
function cellAt(event: PointerEvent): number | null {
  const box = canvas.value!.getBoundingClientRect()
  const size = Math.min(box.width, box.height)
  const x = Math.floor(((event.clientX - box.left - (box.width - size) / 2) / size) * N)
  const y = Math.floor(((event.clientY - box.top - (box.height - size) / 2) / size) * N)
  return x >= 0 && y >= 0 && x < N && y < N ? y * N + x : null
}
function paint(at: number) {
  const s = sprite.value!
  const px = [...s.pixels]
  const c = charFor()
  px[at] = c
  if (mirror.value) px[Math.floor(at / N) * N + (N - 1 - (at % N))] = c
  s.pixels = px.join('')
}
function fill(at: number) {
  const s = sprite.value!
  const px = [...s.pixels]
  const from = px[at]!
  const to = charFor()
  if (from === to) return
  const stack = [at]
  while (stack.length) {
    const i = stack.pop()!
    if (px[i] !== from) continue
    px[i] = to
    const x = i % N
    if (x > 0) stack.push(i - 1)
    if (x < N - 1) stack.push(i + 1)
    if (i >= N) stack.push(i - N)
    if (i < N * (N - 1)) stack.push(i + N)
  }
  s.pixels = px.join('')
}
function down(event: PointerEvent) {
  if (!sprite.value) return
  const at = cellAt(event)
  if (at === null) return
  canvas.value!.setPointerCapture(event.pointerId)
  if (tool.value === 'pick') {
    const c = PIXEL_CHARS.indexOf(sprite.value.pixels[at]!)
    color.value = c
    tool.value = c < 0 ? 'erase' : 'pen'
    return
  }
  if (tool.value === 'fill') return fill(at)
  drawing = true
  paint(at)
}
function move(event: PointerEvent) {
  if (!drawing) return
  const at = cellAt(event)
  if (at !== null) paint(at)
}
const up = () => (drawing = false)
function clear() {
  if (sprite.value) sprite.value.pixels = '.'.repeat(N * N)
}

const cells = computed(() => {
  const s = sprite.value
  if (!s) return []
  return [...s.pixels].flatMap((c, i) => {
    const k = PIXEL_CHARS.indexOf(c)
    return k < 0 ? [] : [{ i, x: i % N, y: Math.floor(i / N), fill: PALETTE[k]! }]
  })
})
const usedBy = computed(() => design.custom.filter((c) => c.sprite === selected.value).map((c) => c.name))
</script>

<template>
  <Teleport defer to="#ws-top">
    <div class="top">
      <div class="sprites">
        <button v-for="s in design.sprites" :key="s.id" class="sprite-chip" :class="{ on: s.id === selected }" :title="s.name" @click="selected = s.id">
          <img :src="spriteUrl(s)" alt="" width="24" height="24" />
          <span>{{ s.name }}</span>
        </button>
        <button class="sprite-chip add" :disabled="design.sprites.length >= 32" @click="newSprite">+ New sprite</button>
      </div>
      <div v-if="sprite" class="meta">
        <input v-model="sprite.name" class="name" maxlength="24" aria-label="Sprite name" />
        <div class="colors" role="radiogroup" aria-label="Colours">
          <button class="opt" role="radio" :aria-checked="sprite.colors === 16" :class="{ on: sprite.colors === 16 }" @click="setColors(16)">16 colours</button>
          <button class="opt" role="radio" :aria-checked="sprite.colors === 32" :class="{ on: sprite.colors === 32 }" @click="setColors(32)">32 colours</button>
        </div>
        <span class="used">{{ usedBy.length ? `used by ${usedBy.join(', ')}` : 'pick it as the look of an item (Levels → Items)' }}</span>
      </div>
    </div>
  </Teleport>

  <!-- The canvas -->
  <p v-if="!sprite" class="empty">Draw pixel art for your home-made items. Make a sprite to start.</p>
  <svg
    v-else
    ref="canvas"
    class="canvas"
    :viewBox="`0 0 ${N} ${N}`"
    role="img"
    aria-label="Sprite canvas: drag to draw"
    @pointerdown="down"
    @pointermove="move"
    @pointerup="up"
    @pointercancel="up"
  >
    <defs>
      <pattern id="checker" width="2" height="2" patternUnits="userSpaceOnUse">
        <rect width="2" height="2" fill="#15152A" />
        <rect width="1" height="1" fill="#1D1D38" />
        <rect x="1" y="1" width="1" height="1" fill="#1D1D38" />
      </pattern>
    </defs>
    <rect :width="N" :height="N" fill="url(#checker)" />
    <rect v-for="c in cells" :key="c.i" :x="c.x" :y="c.y" width="1" height="1" :fill="c.fill" />
    <line v-if="mirror" :x1="N / 2" :x2="N / 2" y1="0" :y2="N" class="axis" />
  </svg>

  <!-- The palette -->
  <Teleport defer to="#ws-bottom">
    <div v-if="sprite" class="palette">
      <button class="swatch clear" :class="{ on: color < 0 }" aria-label="See-through" title="See-through" @click="(color = -1), (tool = 'erase')">∅</button>
      <button
        v-for="(hex, i) in PALETTE.slice(0, colorCount)"
        :key="hex"
        class="swatch"
        :class="{ on: color === i }"
        :style="{ background: hex }"
        :aria-label="`Colour ${hex}`"
        :title="hex"
        @click="(color = i), tool === 'erase' || tool === 'pick' ? (tool = 'pen') : null"
      ></button>
    </div>
  </Teleport>

  <Teleport defer to="#ws-side">
    <template v-if="sprite">
      <button v-for="t in TOOLS" :key="t.id" class="side" :class="{ on: tool === t.id }" @click="tool = t.id">{{ t.name }}</button>
      <span class="side-gap"></span>
      <button class="side" :class="{ on: mirror }" @click="mirror = !mirror">Mirror ⇆</button>
      <button class="side" @click="clear">Clear</button>
      <button class="side danger" @click="removeSprite">{{ confirmDelete ? 'Sure?' : 'Delete' }}</button>
      <span class="side-gap"></span>
      <div class="preview" aria-label="Preview">
        <img :src="spriteUrl(sprite)" alt="" width="16" height="16" />
        <img :src="spriteUrl(sprite)" alt="" width="32" height="32" />
        <img :src="spriteUrl(sprite)" alt="" width="64" height="64" />
      </div>
    </template>
  </Teleport>
</template>

<style scoped>
.top { display: grid; gap: 6px; }
.sprites { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding: 2px; }
.sprite-chip { flex: none; display: flex; align-items: center; gap: 6px; padding: 3px 10px 3px 4px; border: 2px solid var(--border); border-radius: 8px; background: var(--bg-off); font-size: 14px; text-transform: uppercase; color: var(--text-dim); }
.sprite-chip img { image-rendering: pixelated; background: #15152A; border-radius: 4px; }
.sprite-chip.on { border-color: var(--mint); color: var(--text); }
.sprite-chip.add { padding: 6px 12px; border-style: dashed; color: var(--sage); }
.meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.name { flex: 0 1 14rem; padding: 4px 10px; border: 2px solid var(--border); border-radius: 8px; background: var(--bg-warm); color: var(--text); font: inherit; font-size: 16px; }
.name:focus { outline: none; border-color: var(--mint); }
.colors { display: flex; gap: 4px; }
.opt { padding: 4px 10px; border: 2px solid var(--border); border-radius: 8px; background: var(--bg-off); font-size: 14px; text-transform: uppercase; color: var(--text-muted); }
.opt.on { border-color: var(--sage); color: var(--sage); }
.used { font-size: 13px; text-transform: uppercase; color: var(--text-muted); }
.empty { margin: auto; font-size: 16px; color: var(--text-muted); }
.canvas { flex: 1; width: 100%; min-height: 0; touch-action: none; cursor: crosshair; shape-rendering: crispEdges; }
.axis { stroke: var(--sun); stroke-width: 0.05; stroke-dasharray: 0.3 0.3; }
.palette { display: flex; flex-wrap: wrap; gap: 5px; }
.swatch { width: 28px; height: 28px; border: 2px solid var(--ink); border-radius: 6px; }
.swatch.on { outline: 3px solid var(--text); outline-offset: 1px; }
.swatch.clear { background: repeating-conic-gradient(#15152A 0 25%, #2A2A48 0 50%) 0 0 / 10px 10px; color: var(--text-muted); font-size: 14px; }
/* Buttons floating off the card's right side. */
.side { padding: 7px 8px; border: 3px solid var(--ink); background: var(--bg); box-shadow: 0 0 0 2px var(--border), 4px 4px 0 2px var(--ink); font-size: 14px; text-transform: uppercase; color: var(--text-dim); text-align: left; }
.side:hover { color: var(--text); box-shadow: 0 0 0 2px var(--sage), 4px 4px 0 2px var(--ink); }
.side.on { background: var(--sun); color: var(--ink); }
.side.danger:hover { box-shadow: 0 0 0 2px var(--coral), 4px 4px 0 2px var(--ink); }
.side-gap { height: 8px; flex: none; }
.preview { display: grid; justify-items: center; gap: 6px; padding: 6px; border-radius: 8px; background: #15152A; }
.preview img { image-rendering: pixelated; }
@media (max-height: 560px), (max-width: 760px) {
  .side { padding: 4px 5px; font-size: 10px; border-width: 2px; box-shadow: 0 0 0 1px var(--border), 2px 2px 0 1px var(--ink); }
  .swatch { width: 22px; height: 22px; }
  .preview img:last-child { display: none; }
}
.sprite-chip:focus-visible, .opt:focus-visible, .swatch:focus-visible, .side:focus-visible { outline: 3px solid var(--sun); outline-offset: 2px; }
</style>
