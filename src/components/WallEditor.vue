<script setup lang="ts">
/**
 * Drawing a level's walls on the board, with tools: pen (drag to paint),
 * line and box (drag from corner to corner, shown before you let go), filled
 * box, and eraser. Mirrors paint the other side too. The snake's starting
 * cells stay clear. Full screen gives the board the whole window (Esc or the
 * button to come back).
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { GRID } from '../game'
import { deleteTemplate, design, history, myTemplates, packWalls, redo, saveTemplate, startCells, stockTemplates, undo, unpackWalls, type WallTemplate } from '../design'

const props = defineProps<{ level: number }>()

const cols = GRID.cols
const rows = GRID.rows
const edit = computed(() => design.levels[props.level])
const walls = computed(() => new Set(unpackWalls(edit.value?.walls, cols * rows)))
const reserved = new Set(startCells(cols, rows))
const mirrorX = ref(false)
const mirrorY = ref(false)
const full = ref(false)

type Tool = 'pen' | 'line' | 'box' | 'fill' | 'erase'
const TOOLS: { id: Tool; name: string; key: string }[] = [
  { id: 'pen', name: 'Pen', key: 'P' },
  { id: 'line', name: 'Line', key: 'L' },
  { id: 'box', name: 'Box', key: 'B' },
  { id: 'fill', name: 'Filled box', key: 'F' },
  { id: 'erase', name: 'Eraser', key: 'E' },
]
const tool = ref<Tool>('pen')

const board = ref<SVGSVGElement | null>(null)
let drawing: 'paint' | 'erase' | null = null
let last: [number, number] | null = null
/** Line and box tools: where the drag started, and the shape so far, shown until let go. */
let anchor: [number, number] | null = null
const ghost = ref<number[]>([])

/** The cell under the pointer. The board is scaled to fit its box and centred, so the drawn part may be smaller than the box. */
function cellAt(event: PointerEvent): [number, number] {
  const box = board.value!.getBoundingClientRect()
  // The drawing has a 0.2-cell margin all round, for the frame.
  const scale = Math.min(box.width / (cols + 0.4), box.height / (rows + 0.4))
  const left = box.left + (box.width - (cols + 0.4) * scale) / 2 + 0.2 * scale
  const top = box.top + (box.height - (rows + 0.4) * scale) / 2 + 0.2 * scale
  const x = Math.max(0, Math.min(cols - 1, Math.floor((event.clientX - left) / scale)))
  const y = Math.max(0, Math.min(rows - 1, Math.floor((event.clientY - top) / scale)))
  return [x, y]
}

function save(set: Set<number>) {
  if (!edit.value) return
  const packed = packWalls(set, cols, rows)
  if (packed) edit.value.walls = packed
  else delete edit.value.walls
}

/** The cells on a straight line between two cells. */
function lineCells([x1, y1]: [number, number], [x2, y2]: [number, number]): [number, number][] {
  const n = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1))
  return Array.from({ length: n + 1 }, (_, i) => [
    Math.round(x1 + ((x2 - x1) * i) / (n || 1)),
    Math.round(y1 + ((y2 - y1) * i) / (n || 1)),
  ])
}
/** The cells of a box between two corners: its outline, or all of it. */
function boxCells([x1, y1]: [number, number], [x2, y2]: [number, number], filled: boolean): [number, number][] {
  const out: [number, number][] = []
  for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++)
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++)
      if (filled || x === x1 || x === x2 || y === y1 || y === y2) out.push([x, y])
  return out
}
/** Cells with their mirrors, as board indexes, leaving the start clear. */
function withMirrors(cells: [number, number][]): number[] {
  const out = new Set<number>()
  for (const [x, y] of cells) {
    const xs = mirrorX.value ? [x, cols - 1 - x] : [x]
    const ys = mirrorY.value ? [y, rows - 1 - y] : [y]
    for (const mx of xs) for (const my of ys) out.add(my * cols + mx)
  }
  return [...out].filter((at) => !reserved.has(at))
}
function apply(cells: number[], how: 'paint' | 'erase') {
  const set = new Set(walls.value)
  for (const at of cells) {
    if (how === 'paint') set.add(at)
    else set.delete(at)
  }
  save(set)
}
/** The shape the line and box tools would draw from the anchor to here. */
function shape(to: [number, number]) {
  if (!anchor) return []
  if (tool.value === 'line') return withMirrors(lineCells(anchor, to))
  return withMirrors(boxCells(anchor, to, tool.value === 'fill'))
}

function down(event: PointerEvent) {
  board.value!.setPointerCapture(event.pointerId)
  const at = cellAt(event)
  if (tool.value === 'pen' || tool.value === 'erase') {
    drawing = tool.value === 'pen' ? 'paint' : 'erase'
    last = at
    apply(withMirrors([at]), drawing)
    return
  }
  anchor = at
  ghost.value = shape(at)
}
function move(event: PointerEvent) {
  const at = cellAt(event)
  if (drawing) {
    apply(withMirrors(lineCells(last ?? at, at)), drawing)
    last = at
  } else if (anchor) {
    ghost.value = shape(at)
  }
}
function up(event: PointerEvent) {
  if (anchor) apply(shape(cellAt(event)), 'paint')
  drawing = null
  last = null
  anchor = null
  ghost.value = []
}

function clearWalls() {
  save(new Set())
}
/** The border goes on, or, if it is all there already, comes off. */
function border() {
  const edge: number[] = []
  for (let x = 0; x < cols; x++) edge.push(x, (rows - 1) * cols + x)
  for (let y = 0; y < rows; y++) edge.push(y * cols, y * cols + cols - 1)
  const cells = edge.filter((c) => !reserved.has(c))
  const set = new Set(walls.value)
  const on = cells.every((c) => set.has(c))
  for (const c of cells) {
    if (on) set.delete(c)
    else set.add(c)
  }
  save(set)
}
const hasBorder = computed(() => {
  for (let x = 0; x < cols; x++) if (!walls.value.has(x) && !reserved.has(x)) return false
  return true
})

/* ─── Templates: layouts to add to or take from any level ─── */
const showTemplates = ref(false)
const templates = computed(() => [...stockTemplates(cols, rows), ...myTemplates.value])
const templateCells = (t: WallTemplate) => unpackWalls(t.walls, cols * rows)
function addTemplate(t: WallTemplate) {
  const set = new Set(walls.value)
  for (const c of templateCells(t)) if (!reserved.has(c)) set.add(c)
  save(set)
}
function removeTemplate(t: WallTemplate) {
  const set = new Set(walls.value)
  for (const c of templateCells(t)) set.delete(c)
  save(set)
}
const newName = ref('')
function saveCurrent() {
  if (!walls.value.size) return
  saveTemplate(newName.value || `Level ${props.level + 1} walls`, packWalls(walls.value, cols, rows))
  newName.value = ''
}
/** Copy the walls of the level before this one. */
function copyPrevious() {
  const before = design.levels[props.level - 1]
  if (!edit.value || !before) return
  if (before.walls) edit.value.walls = before.walls
  else delete edit.value.walls
}

// Full screen: Esc comes back here, before the menu sees it; tool keys work there too.
function onKey(event: KeyboardEvent) {
  const picked = TOOLS.find((t) => t.key === event.key.toUpperCase())
  if (picked) tool.value = picked.id
  else if (event.key !== 'Escape') return
  else full.value = false
  event.stopImmediatePropagation()
  event.preventDefault()
}
watch(full, (on) => {
  if (on) window.addEventListener('keydown', onKey, { capture: true })
  else window.removeEventListener('keydown', onKey, { capture: true })
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, { capture: true }))

// The tools live outside the card (the workshop's right side); they work this editor through these.
defineExpose({ TOOLS, tool, mirrorX, mirrorY, showTemplates, full, hasBorder, count: computed(() => walls.value.size), border, clearWalls, copyPrevious })
</script>

<template>
  <div class="walls-editor" :class="{ full }">
    <!-- Full screen only: the tools come along (normally they float beside the card) -->
    <div v-if="full" class="draw-tools">
      <div class="tools" role="radiogroup" aria-label="Drawing tool">
        <button
          v-for="t in TOOLS"
          :key="t.id"
          class="tool pick"
          role="radio"
          :aria-checked="tool === t.id"
          :class="{ on: tool === t.id }"
          :title="full ? `${t.name} (${t.key})` : t.name"
          @click="tool = t.id"
        >
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path v-if="t.id === 'pen'" d="M11 1l4 4-9 9H2v-4z M10 2l4 4" fill="none" stroke="currentColor" stroke-width="1.6" />
            <path v-else-if="t.id === 'line'" d="M2 14L14 2" stroke="currentColor" stroke-width="2.2" stroke-linecap="square" />
            <rect v-else-if="t.id === 'box'" x="2" y="3" width="12" height="10" fill="none" stroke="currentColor" stroke-width="2" />
            <rect v-else-if="t.id === 'fill'" x="2" y="3" width="12" height="10" fill="currentColor" />
            <path v-else d="M6 14h8 M2 10l6-7 6 5-5 6H6z" fill="none" stroke="currentColor" stroke-width="1.6" />
          </svg>
          <span>{{ t.name }}</span>
        </button>
      </div>
      <button class="tool" role="switch" :aria-checked="mirrorX" :class="{ on: mirrorX }" @click="mirrorX = !mirrorX">Mirror ⇆</button>
      <button class="tool" role="switch" :aria-checked="mirrorY" :class="{ on: mirrorY }" @click="mirrorY = !mirrorY">Mirror ⇅</button>
      <button class="tool" role="switch" :aria-checked="hasBorder" :class="{ on: hasBorder }" @click="border">Border</button>
      <button class="tool" :class="{ on: showTemplates }" @click="showTemplates = !showTemplates">Templates</button>
      <button class="tool" :disabled="level === 0" title="Copy the walls of the level before" @click="copyPrevious">Copy walls of {{ level ? `level ${level}` : "previous" }}</button>
      <button class="tool" @click="clearWalls">Clear</button>
      <span class="count">{{ walls.size }} walls</span>
      <button class="tool" :disabled="!history.canUndo" title="Undo (Ctrl+Z)" aria-label="Undo" @click="undo">↶</button>
      <button class="tool" :disabled="!history.canRedo" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" @click="redo">↷</button>
      <button class="tool" :aria-pressed="full" @click="full = !full">{{ full ? 'Done' : 'Full screen' }}</button>
    </div>
    <!-- Templates: built in, or saved from any level; add them to this level's walls or take them away -->
    <div v-if="showTemplates && !full" class="templates">
      <div v-for="t in templates" :key="t.id" class="template">
        <svg :viewBox="`0 0 ${cols} ${rows}`" class="mini" aria-hidden="true">
          <rect v-for="c in templateCells(t)" :key="c" :x="c % cols" :y="Math.floor(c / cols)" width="1" height="1" />
        </svg>
        <span class="t-name">{{ t.name }}</span>
        <div class="t-buttons">
          <button class="tool" :title="`Add ${t.name} to these walls`" @click="addTemplate(t)">+ Add</button>
          <button class="tool" :title="`Take ${t.name} away from these walls`" @click="removeTemplate(t)">− Remove</button>
          <button v-if="!t.stock" class="tool danger" :aria-label="`Delete template ${t.name}`" @click="deleteTemplate(t.id)">✕</button>
        </div>
      </div>
      <div class="template save">
        <input v-model="newName" class="t-input" maxlength="24" :placeholder="`Level ${level + 1} walls`" aria-label="Template name" />
        <button class="tool" :disabled="!walls.size" @click="saveCurrent">Save these walls as a template</button>
      </div>
    </div>
    <svg
      v-show="!showTemplates || full"
      ref="board"
      class="wall-board"
      :viewBox="`-0.2 -0.2 ${cols + 0.4} ${rows + 0.4}`"
      role="img"
      aria-label="Level walls: drag to draw, start on a wall to erase"
      @pointerdown="down"
      @pointermove="move"
      @pointerup="up"
      @pointercancel="up"
    >
      <defs>
        <pattern id="editor-dots" width="1" height="1" patternUnits="userSpaceOnUse">
          <rect x="0.46" y="0.46" width="0.08" height="0.08" fill="var(--border)" />
        </pattern>
      </defs>
      <rect class="frame" x="-0.06" y="-0.06" :width="cols + 0.12" :height="rows + 0.12" rx="0.3" />
      <rect :width="cols" :height="rows" fill="url(#editor-dots)" />
      <rect
        v-for="i in reserved"
        :key="`r${i}`"
        :x="(i % cols) + 0.2" :y="Math.floor(i / cols) + 0.2" width="0.6" height="0.6"
        class="start"
      />
      <rect
        v-for="i in walls"
        :key="i"
        :x="(i % cols) + 0.04" :y="Math.floor(i / cols) + 0.04" width="0.92" height="0.92"
        class="wall"
      />
      <!-- The line or box being dragged, before it is drawn -->
      <rect
        v-for="i in ghost"
        :key="`g${i}`"
        :x="(i % cols) + 0.08" :y="Math.floor(i / cols) + 0.08" width="0.84" height="0.84"
        class="ghost"
      />
      <line v-if="mirrorX" :x1="cols / 2" :x2="cols / 2" y1="0" :y2="rows" class="axis" />
      <line v-if="mirrorY" x1="0" :x2="cols" :y1="rows / 2" :y2="rows / 2" class="axis" />
    </svg>
  </div>
</template>

<style scoped>
.walls-editor { flex: 1; display: flex; flex-direction: column; gap: 8px; min-height: 0; }
.walls-editor.full {
  position: fixed;
  inset: 0;
  z-index: 100;
  align-content: center;
  padding: 16px;
  background: var(--bg);
}
.full .wall-board { max-height: calc(100vh - 80px); }
.draw-tools { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.count { margin-left: auto; font-size: 14px; text-transform: uppercase; color: var(--text-muted); }
.wall-board {
  flex: 1;
  display: block;
  width: 100%;
  min-height: 0;
  touch-action: none;
  cursor: crosshair;
}
.frame { fill: var(--bg-off); stroke: var(--sky); stroke-width: 0.12; }
.wall { fill: #2A2350; stroke: var(--lavender); stroke-width: 0.08; }
.start { fill: var(--sage); opacity: 0.3; }
.ghost { fill: var(--sun); opacity: 0.45; }
.templates { flex: 1; min-height: 0; overflow: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); align-content: start; gap: 6px; }
.template { display: grid; gap: 4px; padding: 6px; border: 2px solid var(--border); border-radius: 10px; background: var(--bg-off); }
.template.save { align-content: center; }
.mini { width: 100%; aspect-ratio: 48 / 26; border-radius: 4px; background: var(--bg); fill: var(--lavender); }
.t-name { font-size: 15px; text-transform: uppercase; color: var(--text-dim); }
.t-buttons { display: flex; gap: 4px; }
.t-buttons .tool { padding: 3px 7px; font-size: 13px; }
.t-input { padding: 4px 8px; border: 2px solid var(--border); border-radius: 8px; background: var(--bg-warm); color: var(--text); font: inherit; font-size: 15px; }
.t-input:focus { outline: none; border-color: var(--mint); }
.tool.danger:hover { border-color: var(--coral); color: var(--coral); }
.tools { display: flex; gap: 2px; padding: 2px; border-radius: 10px; background: var(--bg-off); }
.tool.pick { display: flex; align-items: center; gap: 6px; border-color: transparent; }
.tool.pick.on { border-color: var(--sun); background: var(--bg-warm); color: var(--sun); }
.axis { stroke: var(--sun); stroke-width: 0.08; stroke-dasharray: 0.4 0.4; opacity: 0.6; }
.tool {
  padding: 5px 10px;
  border: 2px solid var(--border);
  border-radius: 8px;
  background: var(--bg-off);
  font-size: 15px;
  text-transform: uppercase;
  color: var(--text-dim);
}
.tool:hover:not(:disabled) { border-color: var(--sage); color: var(--text); }
.tool:disabled { opacity: 0.4; cursor: default; }
.tool.on { border-color: var(--sun); color: var(--sun); }
.tool:focus-visible { outline: 3px solid var(--sun); outline-offset: 2px; }
</style>
