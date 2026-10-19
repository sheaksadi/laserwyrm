<script setup lang="ts">
/**
 * The top of the HUD's middle. From rules revision 7: the energy bar, with a
 * notch per dash it holds; Space (or a click) dashes. Before that: the
 * power-ups the snake is carrying, oldest first, and Space uses the oldest.
 * It reacts on pointer down, like the touch pad. On desktop it is the same
 * height as the HUD chips beside it.
 */
import { computed } from 'vue'
import { demo, ENERGY, heldSlots, itemInfo, state, useItem } from '../game'
import { pad, padInUse } from '../gamepad'
import { keyFor } from '../keys'
import PadGlyph from './PadGlyph.vue'
import PowerIcon from './PowerIcon.vue'

/** What is held: nothing while the start screen's backdrop game plays. */
const held = computed(() => (demo.on ? [] : state.held))
/** Energy as a share, and the dashes it holds. */
const fill = computed(() => state.energy / ENERGY.max)
const dashes = computed(() => Math.floor(state.energy / ENERGY.dash))
const notches = Array.from({ length: Math.floor(ENERGY.max / ENERGY.dash) }, (_, i) => ((i + 1) * ENERGY.dash) / ENERGY.max)
const tooltip = computed(
  () => held.value.map((kind) => `${itemInfo(kind).name}: ${itemInfo(kind).blurb}`).join('\n') || 'Pick up power-ups to hold them here',
)
</script>

<template>
  <button
    v-if="state.rev >= 7"
    class="held energy"
    :class="{ ready: dashes > 0 }"
    :disabled="state.status !== 'running' || demo.on || !dashes"
    :aria-label="`Energy ${Math.round(state.energy)} of ${ENERGY.max}: ${dashes} dash${dashes === 1 ? '' : 'es'} (${keyFor('use')})`"
    title="Energy: fruit and time fill it; a dash costs one notch"
    @pointerdown.prevent="useItem()"
    @touchstart.stop
    @touchmove.stop
    @contextmenu.prevent
  >
    <svg class="bolt" viewBox="0 0 12 16" aria-hidden="true"><path d="M7 0 0 9h5l-1 7 8-10H7z" /></svg>
    <span class="meter">
      <span class="meter-fill" :style="{ transform: `scaleX(${fill})` }"></span>
      <span v-for="n in notches" :key="n" class="notch" :style="{ left: `${n * 100}%` }"></span>
    </span>
    <span v-if="padInUse" class="hint pad"><PadGlyph button="a" /> to dash</span>
    <span v-else class="hint">{{ keyFor('use') }} to dash</span>
  </button>
  <button
    v-else
    class="held"
    :disabled="!held.length || state.status !== 'running' || demo.on"
    :aria-label="held.length ? `Use ${itemInfo(held[0]!).name}: ${itemInfo(held[0]!).blurb} (Space)` : 'No power-ups held'"
    :title="tooltip"
    @pointerdown.prevent="useItem()"
    @touchstart.stop
    @touchmove.stop
    @contextmenu.prevent
  >
    <span v-for="i in heldSlots()" :key="i" class="slot" :class="{ next: i === 1 && held.length }">
      <svg v-if="held[i - 1]" viewBox="-0.5 -0.5 1 1"><PowerIcon :kind="held[i - 1]!" /></svg>
    </span>
    <span v-if="padInUse" class="hint pad"><PadGlyph button="a" /> to use</span>
    <span v-else class="hint">{{ keyFor('use') }} to use</span>
  </button>
</template>

<style scoped>
.held {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border: 3px solid var(--sky);
  background: var(--bg);
  box-shadow: 4px 4px 0 var(--border);
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
}
.held:disabled { cursor: default; }
.held:not(:disabled):active { transform: translate(4px, 4px); box-shadow: none; }
.slot {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  background: var(--bg-off);
  outline: 1px dashed var(--border);
}
.slot svg { width: 24px; height: 24px; }
.slot.next { outline: 2px solid var(--text-dim); }
/* Energy: a bolt and a bar, notched where each dash is paid for. */
.energy { gap: 8px; }
.bolt { width: 14px; height: 20px; fill: var(--text-muted); transition: fill 0.15s; }
.energy.ready .bolt { fill: var(--sun); }
.meter {
  position: relative;
  width: 140px;
  height: 14px;
  background: var(--bg-off);
  outline: 1px solid var(--border);
  overflow: hidden;
}
.meter-fill {
  position: absolute;
  inset: 0;
  transform-origin: left;
  background: var(--text-muted);
  transition: transform 0.12s linear, background 0.15s;
}
.energy.ready .meter-fill { background: linear-gradient(90deg, var(--sun), var(--peach)); }
.notch { position: absolute; top: 0; bottom: 0; width: 2px; translate: -1px 0; background: var(--bg); }
/* Small print under the box, clear of its drop shadow; it takes no room in the bar. */
.hint {
  position: absolute;
  top: calc(100% + 12px);
  left: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 16px;
  translate: -50% 0;
  font-size: 14px;
  line-height: 16px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  white-space: nowrap;
  color: var(--text-muted);
}
.held:disabled .hint { opacity: 0.6; }
.hint.pad :deep(svg) { width: 16px; height: 16px; }

@media (pointer: coarse) {
  .hint:not(.pad) { display: none; }
  /* Thumb-sized, stacked like an arcade action button. */
  .held { flex-direction: column; padding: 6px; }
  .slot { width: 50px; height: 50px; }
  .slot svg { width: 38px; height: 38px; }
  .meter { width: 110px; }
  /* Landscape: a row under the pad, which fills the side column's height. */
  .held.side { flex-direction: row; }
}
</style>
