<script setup lang="ts">
/**
 * Phone action: the whole right half of the screen is the button. A tap
 * dashes in play (from rules revision 7; before, it used the oldest held
 * power-up), or starts and resumes otherwise; a faint ring shows where it
 * landed. The energy (or the held power-ups) sit faintly in the corner, so
 * you know what a tap will do. Everything here is see-through.
 */
import { ref } from 'vue'
import { ENERGY, heldSlots, play, state, useItem } from '../game'
import PowerIcon from './PowerIcon.vue'

const rings = ref<{ id: number; x: number; y: number }[]>([])
let next = 0

function press(event: PointerEvent) {
  if (state.status === 'running') useItem()
  else play()
  const id = ++next
  rings.value = [...rings.value, { id, x: event.clientX, y: event.clientY }]
  setTimeout(() => (rings.value = rings.value.filter((r) => r.id !== id)), 360)
}
</script>

<template>
  <div
    class="zone"
    role="button"
    :aria-label="state.status !== 'running' ? 'Play' : state.rev >= 7 ? 'Dash' : 'Use power-up'"
    @pointerdown.prevent="press"
    @touchstart.stop.prevent
    @touchmove.stop.prevent
    @contextmenu.prevent
  >
    <span v-for="r in rings" :key="r.id" class="ring" :style="{ left: `${r.x}px`, top: `${r.y}px` }"></span>
    <!-- What a tap will use: the next power-up, then the one after -->
    <div v-if="state.rev >= 7" class="energy" :class="{ ready: state.energy >= ENERGY.dash }" aria-hidden="true">
      <span class="energy-fill" :style="{ transform: `scaleY(${state.energy / ENERGY.max})` }"></span>
    </div>
    <div v-else class="held" aria-hidden="true">
      <span v-for="i in heldSlots()" :key="i" class="slot" :class="{ next: i === 1 }">
        <svg v-if="state.held[i - 1]" viewBox="-0.5 -0.5 1 1"><PowerIcon :kind="state.held[i - 1]!" /></svg>
      </span>
    </div>
  </div>
</template>

<style scoped>
.zone {
  position: fixed;
  right: 0;
  top: 56px;
  bottom: 0;
  width: 50%;
  z-index: 4;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
}
.ring {
  position: fixed;
  width: 70px;
  height: 70px;
  border: 3px solid rgba(240, 240, 255, 0.32);
  border-radius: 999px;
  translate: -50% -50%;
  pointer-events: none;
  animation: ring 0.36s ease-out both;
}
@keyframes ring {
  from { scale: 0.4; opacity: 1; }
  to { scale: 1.3; opacity: 0; }
}
.held {
  position: fixed;
  right: calc(14px + env(safe-area-inset-right));
  bottom: calc(14px + env(safe-area-inset-bottom));
  display: flex;
  align-items: flex-end;
  gap: 6px;
  opacity: 0.38;
  pointer-events: none;
}
/* Energy: an upright bar in the corner, bright when a dash is ready. */
.energy {
  position: fixed;
  right: calc(18px + env(safe-area-inset-right));
  bottom: calc(18px + env(safe-area-inset-bottom));
  width: 14px;
  height: 90px;
  border: 2px solid rgba(220, 220, 240, 0.35);
  border-radius: 6px;
  overflow: hidden;
  opacity: 0.45;
  pointer-events: none;
}
.energy.ready { opacity: 0.8; border-color: rgba(255, 225, 77, 0.7); }
.energy-fill { position: absolute; inset: 0; transform-origin: bottom; background: rgba(220, 220, 240, 0.5); transition: transform 0.12s linear; }
.energy.ready .energy-fill { background: var(--sun); }
.slot {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 2px solid rgba(220, 220, 240, 0.35);
  border-radius: 8px;
}
.slot.next { width: 42px; height: 42px; border-color: rgba(240, 240, 255, 0.6); }
.slot svg { width: 70%; height: 70%; }
</style>
