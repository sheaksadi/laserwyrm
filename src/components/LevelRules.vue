<script setup lang="ts">
/**
 * One level's pacing or feel. Every setting shows what the level plays with
 * now; moving it gives the level its own value, "auto" hands it back to the
 * curve (or to stock).
 *
 * Pacing: how hard (× on the curve), tempo, lasers per bar, most armed at
 * once, warning, length, and which laser tricks turn up.
 * Feel: the board's edges, the snipper, hearts back on arrival, an intro
 * pause, a calm stretch, and × on points.
 */
import { computed } from 'vue'
import { LASER_TRAITS, levelPlan, state, type LaserTrait } from '../game'
import { design, LEVEL_RANGE, TRAITS, type Edges, type LevelEdit } from '../design'
import AutoSlider from './AutoSlider.vue'

const props = defineProps<{ level: number; section: 'pacing' | 'feel' }>()

const edit = computed(() => design.levels[props.level]!)
const plan = computed(() => levelPlan(props.level))

type NumberKey = 'difficulty' | 'bpm' | 'lasers' | 'armed' | 'warn' | 'bars' | 'snipper' | 'heal' | 'calm' | 'score'
function set(key: NumberKey, value: number | undefined) {
  if (value === undefined) delete edit.value[key]
  else edit.value[key] = value
}
function setValue<K extends keyof LevelEdit>(key: K, value: LevelEdit[K] | undefined) {
  if (value === undefined) delete edit.value[key]
  else edit.value[key] = value
}

const PACING: { key: NumberKey; name: string; hint: string; value: () => number; show: (v: number) => string }[] = [
  { key: 'difficulty', name: 'How hard', hint: '× on the curve', value: () => edit.value.difficulty ?? 1, show: (v) => `×${v.toFixed(2)}` },
  { key: 'bpm', name: 'Tempo', hint: 'beats a minute', value: () => plan.value.bpm, show: (v) => `${v} bpm` },
  { key: 'lasers', name: 'Lasers', hint: 'a bar, on average', value: () => plan.value.lasers, show: (v) => `${v.toFixed(1)} / bar` },
  { key: 'armed', name: 'At once', hint: 'most lasers armed together', value: () => plan.value.armed, show: (v) => `${v}` },
  { key: 'warn', name: 'Warning', hint: 'before a laser strikes', value: () => plan.value.warn, show: (v) => `${(v / 4).toFixed(2)} beats` },
  { key: 'bars', name: 'Length', hint: 'before the next level', value: () => plan.value.bars, show: (v) => `${v} bars` },
]
const FEEL: { key: NumberKey; name: string; hint: string; value: () => number; show: (v: number) => string }[] = [
  { key: 'snipper', name: 'Snipper', hint: 'how often it hunts you', value: () => plan.value.snipper, show: (v) => (v ? `×${v.toFixed(2)}` : 'never') },
  { key: 'heal', name: 'Hearts back', hint: 'on reaching this level', value: () => edit.value.heal ?? plan.value.heal, show: (v) => `+${v}` },
  { key: 'calm', name: 'Calm', hint: 'bars of fewer lasers at the start', value: () => plan.value.calm, show: (v) => `${v} bars` },
  { key: 'score', name: 'Points', hint: '× on scoring', value: () => plan.value.score, show: (v) => `×${v.toFixed(1)}` },
]

const TRAIT_INFO: Record<LaserTrait, { name: string; color: string }> = {
  wide: { name: 'Wide', color: 'var(--sky)' },
  cross: { name: 'Cross', color: 'var(--lavender)' },
  fast: { name: 'Fast', color: '#FFFFFF' },
  track: { name: 'Tracking', color: 'var(--sage)' },
  repeat: { name: 'Double', color: 'var(--sun)' },
}
function toggleTrait(trait: LaserTrait) {
  const now = plan.value.traits
  setValue('traits', now.includes(trait) ? now.filter((t) => t !== trait) : TRAITS.filter((t) => t === trait || now.includes(t)))
}

const EDGES: { value: Edges | undefined; name: string }[] = [
  { value: undefined, name: 'Auto' },
  { value: 'wrap', name: 'Wrap round' },
  { value: 'kill', name: 'Walls kill' },
]
const INTRO: { value: boolean | undefined; name: string }[] = [
  { value: undefined, name: 'Auto' },
  { value: true, name: 'Pause to show it' },
  { value: false, name: 'No pause' },
]
</script>

<template>
  <div class="rules">
    <template v-if="section === 'pacing'">
      <div class="grid">
        <AutoSlider
          v-for="k in PACING"
          :key="k.key"
          :name="k.name"
          :hint="k.hint"
          :value="k.value()"
          :own="edit[k.key] !== undefined"
          :range="LEVEL_RANGE[k.key]"
          :show="k.show"
          @set="set(k.key, $event)"
        />
      </div>
      <div class="row-label">
        <span class="label">Laser kinds</span>
        <button v-if="edit.traits" class="auto" @click="setValue('traits', undefined)">auto</button>
      </div>
      <div class="chips">
        <span class="chip locked" title="Plain lasers always come"><i class="sw" style="background: var(--coral)"></i>Plain</span>
        <button
          v-for="tr in TRAITS"
          :key="tr"
          class="chip"
          role="switch"
          :aria-checked="plan.traits.includes(tr)"
          :class="{ on: plan.traits.includes(tr), own: !!edit.traits }"
          :title="`Stock: from level ${LASER_TRAITS[tr].unlock + 1}`"
          @click="toggleTrait(tr)"
        >
          <i class="sw" :style="{ background: TRAIT_INFO[tr].color }"></i>{{ TRAIT_INFO[tr].name }}
        </button>
      </div>
    </template>

    <template v-else>
      <div class="row-label"><span class="label">Edges of the board</span></div>
      <div class="chips">
        <button
          v-for="o in EDGES"
          :key="o.name"
          class="chip"
          :class="{ on: edit.edges === o.value, own: o.value !== undefined }"
          @click="setValue('edges', o.value)"
        >
          {{ o.name }}<template v-if="o.value === undefined"> ({{ state.mode === 'hardcore' ? 'kill' : 'wrap' }})</template>
        </button>
      </div>
      <div class="row-label"><span class="label">Intro</span></div>
      <div class="chips">
        <button
          v-for="o in INTRO"
          :key="o.name"
          class="chip"
          :class="{ on: edit.intro === o.value, own: o.value !== undefined }"
          @click="setValue('intro', o.value)"
        >
          {{ o.name }}<template v-if="o.value === undefined"> ({{ plan.intro ? 'pause' : 'none' }})</template>
        </button>
      </div>
      <div class="grid">
        <AutoSlider
          v-for="k in FEEL"
          :key="k.key"
          :name="k.name"
          :hint="k.hint"
          :value="k.value()"
          :own="edit[k.key] !== undefined"
          :range="LEVEL_RANGE[k.key]"
          :show="k.show"
          @set="set(k.key, $event)"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.rules { display: grid; gap: 8px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr)); gap: 6px; }
.row-label { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
.label { font-size: 15px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }
.auto {
  padding: 0 6px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: none;
  font-size: 13px;
  text-transform: uppercase;
  color: var(--text-muted);
}
.auto:hover { border-color: var(--sage); color: var(--text); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 2px solid var(--border);
  border-radius: 8px;
  background: var(--bg-off);
  font-size: 15px;
  text-transform: uppercase;
  color: var(--text-muted);
}
.chip.on { border-color: var(--text-dim); color: var(--text); }
.chip.on.own { border-color: var(--sun); }
.chip.locked { opacity: 0.7; }
.chip:not(.locked):hover { border-color: var(--sage); }
.sw { display: inline-block; width: 10px; height: 10px; border: 1px solid var(--ink); }
.chip:not(.on):not(.locked) .sw { opacity: 0.35; }
.chip:focus-visible, .auto:focus-visible { outline: 3px solid var(--sun); outline-offset: 2px; }
</style>
