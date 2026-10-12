<script setup lang="ts">
/**
 * On-screen controls for phones and tablets: a cross of four arrow buttons
 * with play/pause in the middle. Buttons react on pointer down, not on click,
 * so a turn lands the instant the thumb touches the glass.
 */
import { ref } from 'vue'
import { state, toggle, turn, type DirName } from '../game'

defineProps<{ placement: 'bottom' | 'side' }>()

const pressed = ref<string | null>(null)

function buzz() {
  try {
    navigator.vibrate?.(8)
  } catch {
    /* vibration not allowed: the button still works */
  }
}

function press(dir: DirName) {
  pressed.value = dir
  buzz()
  turn(dir)
}

function pressCenter() {
  pressed.value = 'center'
  buzz()
  toggle()
}

const ARROWS: { dir: DirName; path: string }[] = [
  { dir: 'up', path: 'M12 6l-7 8h14z' },
  { dir: 'left', path: 'M6 12l8-7v14z' },
  { dir: 'right', path: 'M18 12l-8-7v14z' },
  { dir: 'down', path: 'M12 18l-7-8h14z' },
]
</script>

<template>
  <div
    class="pad"
    :class="placement"
    @touchstart.stop
    @touchmove.stop
    @pointerup="pressed = null"
    @pointercancel="pressed = null"
    @pointerleave="pressed = null"
  >
    <button
      v-for="arrow in ARROWS"
      :key="arrow.dir"
      class="key"
      :class="[arrow.dir, { held: pressed === arrow.dir }]"
      :aria-label="arrow.dir"
      @pointerdown.prevent="press(arrow.dir)"
      @contextmenu.prevent
    >
      <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path :d="arrow.path" /></svg>
    </button>
    <button
      class="key center"
      :class="{ held: pressed === 'center' }"
      :aria-label="state.status === 'running' ? 'Pause' : 'Play'"
      @pointerdown.prevent="pressCenter"
      @contextmenu.prevent
    >
      <svg v-if="state.status === 'running'" viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
      <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
    </button>
  </div>
</template>

<style scoped>
.pad {
  position: absolute;
  display: grid;
  grid-template-columns: repeat(3, 58px);
  grid-template-rows: repeat(3, 58px);
  gap: 6px;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}
/* Portrait: centred in the band under the board. */
.pad.bottom {
  left: 50%;
  bottom: calc(14px + env(safe-area-inset-bottom));
  translate: -50% 0;
}
/* Landscape: centred in the column right of the board. */
.pad.side {
  right: calc(13px + env(safe-area-inset-right));
  top: 50%;
  translate: 0 -40%;
}

.key {
  display: grid;
  place-items: center;
  border: 2px solid var(--text);
  border-radius: 16px;
  background: var(--bg);
  color: var(--text);
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
  transition: background 0.08s ease, transform 0.08s ease;
}
.key.held {
  background: var(--mint);
  transform: scale(0.94);
}
.key.up { grid-area: 1 / 2; }
.key.left { grid-area: 2 / 1; }
.key.right { grid-area: 2 / 3; }
.key.down { grid-area: 3 / 2; }
.key.center {
  grid-area: 2 / 2;
  border-radius: 999px;
  background: var(--text);
  color: #fff;
  margin: 8px;
}
.key.center.held { background: #333; }
</style>
