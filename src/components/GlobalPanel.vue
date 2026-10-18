<script setup lang="ts">
/**
 * The global tab: the whole game's feel at once. A chart of every level, one
 * bar each, to drag up (harder) or down (easier), with the resulting curve
 * drawn over it next to the stock one. Under it, the knobs: overall, how the
 * start ramps, how the middle climbs, how hard the end bites, lasers,
 * warning, tempo and level length. Changes apply at once; a level's own
 * settings (in the levels tab) still win over these.
 */
import { computed, ref } from 'vue'
import { LASER_TIERS, levelPlan, state } from '../game'
import { design, GLOBAL_RANGE, LEVEL_RANGE, STOCK_GLOBAL, type Global } from '../design'

type Knob = keyof Global
const KNOBS: { key: Knob; name: string; hint: string; show: (v: number) => string }[] = [
  { key: 'overall', name: 'Overall', hint: 'how hard every level plays', show: (v) => `×${v.toFixed(2)}` },
  { key: 'start', name: 'Start feel', hint: 'levels 1–10: gentle ← → steep', show: (v) => v.toFixed(2) },
  { key: 'climb', name: 'Middle climb', hint: 'steady rise from level 11', show: (v) => v.toFixed(2) },
  { key: 'end', name: 'End feel', hint: 'late levels: flat ← → brutal', show: (v) => v.toFixed(3) },
  { key: 'lasers', name: 'Lasers', hint: 'how many come', show: (v) => `×${v.toFixed(2)}` },
  { key: 'warn', name: 'Warning', hint: 'time before a laser strikes', show: (v) => `×${v.toFixed(2)}` },
  { key: 'tempoStart', name: 'Start tempo', hint: 'bpm at level 1', show: (v) => `${v}` },
  { key: 'tempoMax', name: 'Top tempo', hint: 'the fastest it gets', show: (v) => `${v}` },
  { key: 'barsPerLevel', name: 'Level length', hint: 'bars before the next level', show: (v) => `${v} bars` },
]

/** The knobs being edited; a pasted code swaps in a new object, so always read it fresh. */
const t = computed(() => design.global)
const changed = (key: Knob) => t.value[key] !== STOCK_GLOBAL[key]
const LEVELS = computed(() => design.levels.length)
const difficulty = (l: number) => design.levels[l]?.difficulty ?? 1
function setDifficulty(l: number, v: number) {
  const edit = design.levels[l]
  if (!edit) return
  if (v === 1) delete edit.difficulty
  else edit.difficulty = v
}

/* ─── The chart ─── */

const H = 50
const TIER_COLOR = { red: 'var(--coral)', blue: 'var(--sky)', purple: 'var(--lavender)', white: '#FFFFFF', green: 'var(--sage)', gold: 'var(--sun)', prism: 'var(--rose)' } as const

/** Stock intensity per level, for comparison. */
const STOCK = computed(() => Array.from({ length: LEVELS.value }, (_, l) => (l < 10 ? l * 0.65 : 6.5 + (l - 10) * 0.4 + (l - 10) ** 2 * 0.012)))
const tuned = computed(() => Array.from({ length: LEVELS.value }, (_, l) => levelPlan(l).intensity))
const top = computed(() => Math.max(1, ...STOCK.value, ...tuned.value))
const line = (values: number[]) => values.map((v, l) => `${l + 0.5},${H - (v / top.value) * (H - 2)}`).join(' ')

const focus = ref(0)
const feel = computed(() => levelPlan(focus.value))

const chart = ref<SVGSVGElement | null>(null)
let painting = false
let lastLevel = -1
let lastValue = 1

function at(event: PointerEvent): [level: number, value: number] {
  const box = chart.value!.getBoundingClientRect()
  const n = LEVELS.value
  const level = Math.max(0, Math.min(n - 1, Math.floor(((event.clientX - box.left) / box.width) * n)))
  const [min, max] = LEVEL_RANGE.difficulty
  let value = (1 - (event.clientY - box.top) / box.height) * max
  value = Math.max(min, Math.min(max, value))
  // Snap to ×1 near the middle, so levels go back to stock easily.
  if (Math.abs(value - 1) < 0.05) value = 1
  return [level, Math.round(value * 100) / 100]
}

/** Set the levels from the last point to this one, so a quick drag leaves no gaps. */
function paint(level: number, value: number) {
  const from = lastLevel < 0 ? level : lastLevel
  const steps = Math.abs(level - from)
  for (let i = 0; i <= steps; i++) {
    const l = from + Math.sign(level - from) * i
    const share = steps ? i / steps : 1
    setDifficulty(l, Math.round((lastLevel < 0 ? value : lastValue + (value - lastValue) * share) * 100) / 100)
  }
  lastLevel = level
  lastValue = value
  focus.value = level
}

function down(event: PointerEvent) {
  painting = true
  chart.value!.setPointerCapture(event.pointerId)
  lastLevel = -1
  paint(...at(event))
}
function move(event: PointerEvent) {
  const [level, value] = at(event)
  if (painting) paint(level, value)
  else focus.value = level
}
function up() {
  painting = false
  lastLevel = -1
}

function flatten() {
  for (let l = 0; l < LEVELS.value; l++) setDifficulty(l, 1)
}
/** Soften sharp jumps: each level moves toward its neighbours. */
function smooth() {
  const v = Array.from({ length: LEVELS.value }, (_, l) => difficulty(l))
  v.forEach((x, i) => setDifficulty(i, Math.round(((v[i - 1] ?? x) + x * 2 + (v[i + 1] ?? x)) * 25) / 100))
}
function resetGlobal() {
  Object.assign(t.value, JSON.parse(JSON.stringify(STOCK_GLOBAL)))
  flatten()
}
</script>

<template>
  <div class="tuning">
    <section>
      <div class="chart-head">
        <h3>Every level, harder or easier</h3>
        <span class="legend"><i class="sw tuned"></i>yours <i class="sw stock"></i>stock</span>
      </div>
      <svg
        ref="chart"
        class="chart"
        :viewBox="`0 0 ${LEVELS} ${H}`"
        preserveAspectRatio="none"
        role="img"
        aria-label="Difficulty of each level: drag up for harder, down for easier"
        @pointerdown="down"
        @pointermove="move"
        @pointerup="up"
        @pointercancel="up"
      >
        <line x1="0" :x2="LEVELS" :y1="H / 2" :y2="H / 2" class="mid" />
        <line
          v-for="tier in LASER_TIERS.slice(1)"
          :key="tier.level"
          :x1="tier.level" :x2="tier.level" y1="0" :y2="H"
          :stroke="TIER_COLOR[tier.kind]" class="tier-line"
        />
        <rect
          v-for="l in LEVELS"
          :key="l"
          :x="l - 1 + 0.12" :y="H - (difficulty(l - 1) / 2) * H" width="0.76" :height="(difficulty(l - 1) / 2) * H"
          :class="{ off: difficulty(l - 1) !== 1, focus: l - 1 === focus }"
          class="bar"
        />
        <polyline :points="line(STOCK)" class="curve stock" />
        <polyline :points="line(tuned)" class="curve tuned" />
      </svg>
      <p class="readout">
        <b>Level {{ focus + 1 }}</b>
        <span>×{{ difficulty(focus).toFixed(2) }}</span>
        <span>{{ feel.bpm }} bpm</span>
        <span>{{ feel.lasers.toFixed(1) }} lasers / bar</span>
        <span>{{ (feel.warn / 4).toFixed(1) }} beats warning</span>
        <span v-if="state.level === focus" class="now">playing</span>
      </p>
      <div class="chart-tools">
        <button class="tool" @click="smooth">Smooth</button>
        <button class="tool" @click="flatten">Flatten</button>
      </div>
    </section>

    <section>
      <h3>The whole game</h3>
      <label v-for="k in KNOBS" :key="k.key" class="knob">
        <span class="knob-name"><b>{{ k.name }}</b> {{ k.hint }}</span>
        <button
          class="knob-value"
          type="button"
          :class="{ changed: changed(k.key) }"
          :title="changed(k.key) ? 'Back to stock' : 'Stock'"
          @click.prevent="t[k.key] = STOCK_GLOBAL[k.key]"
        >{{ k.show(t[k.key]) }}</button>
        <input
          v-model.number="t[k.key]"
          class="slider"
          type="range"
          :min="GLOBAL_RANGE[k.key][0]"
          :max="GLOBAL_RANGE[k.key][1]"
          :step="GLOBAL_RANGE[k.key][2]"
          :aria-label="k.name"
        />
      </label>
      <button class="tool wide" @click="resetGlobal">Put the global feel back to stock</button>
    </section>
  </div>
</template>

<style scoped>
.tuning { display: grid; gap: 1.1rem; }
section { display: grid; gap: 8px; }
h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-muted);
}
.chart-head { display: flex; justify-content: space-between; align-items: baseline; }
.legend { display: flex; align-items: center; gap: 6px; font-size: 14px; text-transform: uppercase; color: var(--text-muted); }
.sw { display: inline-block; width: 14px; height: 3px; }
.sw.tuned { background: var(--mint); }
.sw.stock { background: var(--text-muted); }
.chart {
  width: 100%;
  height: 150px;
  border: 2px solid var(--border);
  border-radius: 10px;
  background: var(--bg-off);
  touch-action: none;
  cursor: ns-resize;
}
.mid { stroke: var(--border); stroke-width: 0.3; stroke-dasharray: 1 1; }
.tier-line { stroke-width: 0.25; opacity: 0.6; }
.bar { fill: var(--border); }
.bar.off { fill: #4A3D80; }
.bar.focus { fill: var(--sun); }
.curve { fill: none; stroke-width: 1.4; vector-effect: non-scaling-stroke; stroke-linejoin: round; }
.curve.stock { stroke: var(--text-muted); stroke-dasharray: 4 3; }
.curve.tuned { stroke: var(--mint); stroke-width: 2; }
.readout {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin: 0;
  font-size: 16px;
  text-transform: uppercase;
  color: var(--text-dim);
}
.readout b { font-weight: 400; color: var(--sun); }
.readout .now { color: var(--sage); }
.chart-tools { display: flex; gap: 6px; }
.tool {
  padding: 6px 12px;
  border: 2px solid var(--border);
  border-radius: 8px;
  background: var(--bg-off);
  font-size: 15px;
  text-transform: uppercase;
  color: var(--text-dim);
}
.tool:hover { border-color: var(--sage); color: var(--text); }
.tool.wide { width: 100%; margin-top: 4px; }
.knob {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 2px 10px;
  padding: 6px 10px 8px;
  border-radius: 10px;
  background: var(--bg-warm);
}
.knob-name { font-size: 15px; text-transform: uppercase; color: var(--text-muted); }
.knob-name b { margin-right: 6px; font-weight: 400; color: var(--text); }
.knob-value {
  padding: 0;
  border: 0;
  background: none;
  font-family: var(--font-pixel);
  font-size: 10px;
  color: var(--text-muted);
}
.knob-value.changed { color: var(--sun); cursor: pointer; }
.slider { grid-column: 1 / -1; width: 100%; accent-color: var(--sage); }
.tool:focus-visible, .knob-value:focus-visible { outline: 3px solid var(--sun); outline-offset: 2px; }
</style>
