<script setup lang="ts">
/**
 * Phone steering as a D-pad in the lower left. Tap an arrow to turn; or keep
 * the thumb down and slide it across the pad, and each new direction it
 * passes turns the snake, like rolling a thumb over a real D-pad. It is
 * faint and see-through, so the board shows under it.
 */
import { ref } from 'vue'
import { turn, type DirName } from '../game'

/** Within this share of the pad's radius from the middle, nothing counts. */
const DEADZONE = 0.18

const pad = ref<HTMLElement | null>(null)
const held = ref<DirName | null>(null)
let pointer: number | null = null

function dirAt(event: PointerEvent): DirName | null {
  const box = pad.value!.getBoundingClientRect()
  const dx = (event.clientX - (box.left + box.width / 2)) / (box.width / 2)
  const dy = (event.clientY - (box.top + box.height / 2)) / (box.height / 2)
  if (Math.hypot(dx, dy) < DEADZONE) return null
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
}

function steer(event: PointerEvent) {
  const dir = dirAt(event)
  if (dir && dir !== held.value) turn(dir)
  held.value = dir
}

function down(event: PointerEvent) {
  if (pointer !== null) return
  pointer = event.pointerId
  pad.value!.setPointerCapture(event.pointerId)
  held.value = null
  steer(event)
}
function move(event: PointerEvent) {
  if (event.pointerId === pointer) steer(event)
}
function up(event: PointerEvent) {
  if (event.pointerId !== pointer) return
  pointer = null
  held.value = null
}

const ARROWS: { dir: DirName; d: string }[] = [
  { dir: 'up', d: 'M0 -0.62 L0.16 -0.4 H-0.16 Z' },
  { dir: 'down', d: 'M0 0.62 L0.16 0.4 H-0.16 Z' },
  { dir: 'left', d: 'M-0.62 0 L-0.4 0.16 V-0.16 Z' },
  { dir: 'right', d: 'M0.62 0 L0.4 0.16 V-0.16 Z' },
]
</script>

<template>
  <div
    ref="pad"
    class="dpad"
    role="application"
    aria-label="Steer: tap or slide over the arrows"
    @pointerdown.prevent="down"
    @pointermove="move"
    @pointerup="up"
    @pointercancel="up"
    @touchstart.stop.prevent
    @touchmove.stop.prevent
    @contextmenu.prevent
  >
    <svg viewBox="-1 -1 2 2" aria-hidden="true">
      <!-- The cross, then each arm lit while the thumb is on it -->
      <path class="cross" d="M-0.28 -0.92 H0.28 V-0.28 H0.92 V0.28 H0.28 V0.92 H-0.28 V0.28 H-0.92 V-0.28 H-0.28 Z" />
      <rect v-if="held === 'up'" class="lit" x="-0.28" y="-0.92" width="0.56" height="0.64" />
      <rect v-if="held === 'down'" class="lit" x="-0.28" y="0.28" width="0.56" height="0.64" />
      <rect v-if="held === 'left'" class="lit" x="-0.92" y="-0.28" width="0.64" height="0.56" />
      <rect v-if="held === 'right'" class="lit" x="0.28" y="-0.28" width="0.64" height="0.56" />
      <path v-for="a in ARROWS" :key="a.dir" :d="a.d" class="arrow" :class="{ on: held === a.dir }" />
    </svg>
  </div>
</template>

<style scoped>
.dpad {
  position: fixed;
  /* Just inside the board, clear of the HUD's gutter. */
  left: calc(58px + env(safe-area-inset-left));
  bottom: calc(14px + env(safe-area-inset-bottom));
  z-index: 4;
  width: clamp(110px, 34vh, 150px);
  aspect-ratio: 1;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
}
.dpad svg { width: 100%; height: 100%; overflow: visible; }
/* Faint, so the board shows through. */
.cross { fill: rgba(200, 200, 225, 0.07); stroke: rgba(220, 220, 240, 0.28); stroke-width: 0.03; stroke-linejoin: round; }
.lit { fill: rgba(220, 220, 240, 0.16); }
.arrow { fill: rgba(230, 230, 250, 0.3); }
.arrow.on { fill: rgba(240, 240, 255, 0.6); }
</style>
