<script setup lang="ts">
/**
 * The power-ups the snake is carrying, oldest first. Space or a tap uses the
 * oldest one. It reacts on pointer down, like the touch pad, so a shield goes
 * up the instant the thumb lands. On desktop it is the same height as the HUD
 * chips beside it; names and what they do show in the notice and tooltip.
 */
import { computed } from 'vue'
import { demo, heldSlots, itemInfo, state, useItem } from '../game'
import { pad } from '../gamepad'
import PadGlyph from './PadGlyph.vue'
import PowerIcon from './PowerIcon.vue'

/** What is held: nothing while the start screen's backdrop game plays. */
const held = computed(() => (demo.on ? [] : state.held))
const tooltip = computed(
  () => held.value.map((kind) => `${itemInfo(kind).name}: ${itemInfo(kind).blurb}`).join('\n') || 'Pick up power-ups to hold them here',
)
</script>

<template>
  <button
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
    <span v-if="pad.connected" class="hint pad"><PadGlyph button="a" /> to use</span>
    <span v-else class="hint">space to use</span>
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
  /* Landscape: a row under the pad, which fills the side column's height. */
  .held.side { flex-direction: row; }
}
</style>
