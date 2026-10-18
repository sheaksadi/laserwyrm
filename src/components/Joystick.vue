<script setup lang="ts">
/**
 * Phone steering: the whole left half of the screen. Put a thumb down
 * anywhere there and a faint stick appears under it; lean the way to go, like
 * the stick on a controller (one turn per new direction). Let go and it
 * fades. It is see-through, so the board stays visible under the thumb.
 */
import { ref } from 'vue'
import { turn, type DirName } from '../game'

/** Radius the knob can travel, and the lean before it counts as a turn, in px. */
const REACH = 40
const DEADZONE = 14

const base = ref<{ x: number; y: number } | null>(null)
const knob = ref({ x: 0, y: 0 })
let pointer: number | null = null
let leaning: DirName | null = null

function move(event: PointerEvent) {
  if (event.pointerId !== pointer || !base.value) return
  let dx = event.clientX - base.value.x
  let dy = event.clientY - base.value.y
  const dist = Math.hypot(dx, dy)
  if (dist > REACH) {
    dx = (dx / dist) * REACH
    dy = (dy / dist) * REACH
  }
  knob.value = { x: dx, y: dy }
  const dir: DirName | null =
    dist < DEADZONE ? null : Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
  if (dir && dir !== leaning) turn(dir)
  leaning = dir
}

function down(event: PointerEvent) {
  if (pointer !== null) return
  pointer = event.pointerId
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  base.value = { x: event.clientX, y: event.clientY }
  knob.value = { x: 0, y: 0 }
}

function up(event: PointerEvent) {
  if (event.pointerId !== pointer) return
  pointer = null
  leaning = null
  base.value = null
}
</script>

<template>
  <div
    class="zone"
    role="application"
    aria-label="Steer: touch and drag"
    @pointerdown.prevent="down"
    @pointermove="move"
    @pointerup="up"
    @pointercancel="up"
    @touchstart.stop.prevent
    @touchmove.stop.prevent
    @contextmenu.prevent
  >
    <div v-if="base" class="stick" :style="{ left: `${base.x}px`, top: `${base.y}px` }">
      <span class="knob" :style="{ translate: `${knob.x}px ${knob.y}px` }"></span>
    </div>
  </div>
</template>

<style scoped>
.zone {
  position: fixed;
  left: 0;
  top: 56px;
  bottom: 0;
  width: 50%;
  z-index: 4;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}
/* Faint and grey, centred on the thumb, so the board shows through. */
.stick {
  position: fixed;
  display: grid;
  place-items: center;
  width: 110px;
  height: 110px;
  border: 2px solid rgba(220, 220, 240, 0.22);
  border-radius: 999px;
  background: rgba(200, 200, 220, 0.04);
  translate: -50% -50%;
  pointer-events: none;
}
.knob {
  width: 48px;
  height: 48px;
  border-radius: 999px;
  background: rgba(220, 220, 240, 0.16);
  border: 2px solid rgba(240, 240, 255, 0.3);
}
</style>
