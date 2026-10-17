<script setup lang="ts">
/**
 * The one button for phones, bottom right: an arcade button. In play it uses
 * the oldest held power-up (shown on its face, with the next one above);
 * otherwise it starts or resumes. It reacts on touch, not on release.
 */
import { ref } from 'vue'
import { play, POWERS, state, useItem } from '../game'
import PowerIcon from './PowerIcon.vue'

const pressed = ref(false)

function press() {
  pressed.value = true
  if (state.status === 'running') useItem()
  else play()
}
</script>

<template>
  <div class="action" @touchstart.stop @touchmove.stop>
    <!-- The second held power-up waits above -->
    <span class="next-slot" :class="{ filled: state.held[1] }">
      <svg v-if="state.held[1]" viewBox="-0.5 -0.5 1 1" width="26" height="26"><PowerIcon :kind="state.held[1]" /></svg>
    </span>
    <button
      class="big"
      :class="{ pressed, ready: state.status === 'running' && state.held.length }"
      :aria-label="state.status !== 'running' ? 'Play' : state.held[0] ? `Use ${POWERS[state.held[0]].name}` : 'No power-up held'"
      @pointerdown.prevent="press"
      @pointerup="pressed = false"
      @pointercancel="pressed = false"
      @pointerleave="pressed = false"
      @contextmenu.prevent
    >
      <svg v-if="state.status !== 'running'" viewBox="0 0 24 24" width="34" height="34" fill="currentColor"><path d="M7 4v16l13-8z" /></svg>
      <svg v-else-if="state.held[0]" viewBox="-0.5 -0.5 1 1" width="44" height="44"><PowerIcon :kind="state.held[0]" /></svg>
      <span v-else class="empty">A</span>
    </button>
  </div>
</template>

<style scoped>
.action {
  position: absolute;
  right: calc(26px + env(safe-area-inset-right));
  bottom: calc(26px + env(safe-area-inset-bottom));
  z-index: 5;
  display: grid;
  justify-items: center;
  gap: 10px;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
.next-slot {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border: 2px dashed var(--border);
  background: rgba(0, 0, 0, 0.6);
}
.next-slot.filled { border: 2px solid var(--text-dim); }
.big {
  display: grid;
  place-items: center;
  width: 104px;
  height: 104px;
  border: 3px solid var(--ink);
  border-radius: 999px;
  background: radial-gradient(circle at 35% 30%, #FF6A82, var(--coral) 55%, #B81C3A);
  box-shadow: inset 0 -6px 0 rgba(0, 0, 0, 0.3), 0 5px 0 var(--ink), 0 0 0 4px var(--border);
  color: var(--ink);
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
}
/* Holding a power-up: the button glows, ready to fire. */
.big.ready { box-shadow: inset 0 -6px 0 rgba(0, 0, 0, 0.3), 0 5px 0 var(--ink), 0 0 0 4px var(--sun); }
.big.pressed { translate: 0 4px; box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.3), 0 1px 0 var(--ink), 0 0 0 4px var(--border); }
.empty { font-family: var(--font-pixel); font-size: 22px; opacity: 0.55; }
</style>
