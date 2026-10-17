<script setup lang="ts">
/**
 * The on-screen stick for phones, bottom left. Put a thumb down anywhere on
 * it and drag: the snake turns the way the thumb leans most, once per new
 * direction, like the stick on a controller. Let go and the knob springs back.
 */
import { ref } from 'vue'
import { turn, type DirName } from '../game'

/** Radius the knob can travel, and the lean before it counts as a turn, in px. */
const REACH = 42
const DEADZONE = 16

const knob = ref({ x: 0, y: 0 })
const active = ref(false)
let center = { x: 0, y: 0 }
let pointer: number | null = null
let leaning: DirName | null = null

function move(event: PointerEvent) {
  if (event.pointerId !== pointer) return
  let dx = event.clientX - center.x
  let dy = event.clientY - center.y
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
  const base = (event.currentTarget as HTMLElement).getBoundingClientRect()
  center = { x: base.left + base.width / 2, y: base.top + base.height / 2 }
  pointer = event.pointerId
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  active.value = true
  move(event)
}

function up(event: PointerEvent) {
  if (event.pointerId !== pointer) return
  pointer = null
  leaning = null
  active.value = false
  knob.value = { x: 0, y: 0 }
}
</script>

<template>
  <div
    class="stick"
    :class="{ active }"
    role="application"
    aria-label="Steering stick"
    @pointerdown.prevent="down"
    @pointermove="move"
    @pointerup="up"
    @pointercancel="up"
    @touchstart.stop.prevent
    @touchmove.stop.prevent
    @contextmenu.prevent
  >
    <span class="arrow up"></span><span class="arrow down"></span><span class="arrow left"></span><span class="arrow right"></span>
    <span class="knob" :style="{ translate: `${knob.x}px ${knob.y}px` }"></span>
  </div>
</template>

<style scoped>
.stick {
  position: absolute;
  left: calc(22px + env(safe-area-inset-left));
  bottom: calc(22px + env(safe-area-inset-bottom));
  z-index: 5;
  display: grid;
  place-items: center;
  width: 140px;
  height: 140px;
  border: 3px solid var(--sky);
  border-radius: 999px;
  background: radial-gradient(circle, rgba(63, 169, 255, 0.12), rgba(11, 11, 26, 0.85) 70%);
  box-shadow: 4px 4px 0 var(--border);
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}
.stick.active { border-color: var(--mint); }
.knob {
  width: 58px;
  height: 58px;
  border: 3px solid var(--ink);
  border-radius: 999px;
  background: radial-gradient(circle at 35% 30%, #6BBEFF, var(--sky) 55%, #1F6FB8);
  box-shadow: inset 0 -4px 0 rgba(0, 0, 0, 0.3), 0 3px 0 var(--ink);
  pointer-events: none;
}
.stick:not(.active) .knob { transition: translate 0.12s steps(3); }
/* Small pixel arrows at the four edges. */
.arrow {
  position: absolute;
  width: 0;
  height: 0;
  border: 6px solid transparent;
  opacity: 0.55;
  pointer-events: none;
}
.arrow.up { top: 8px; border-bottom-color: var(--sky); }
.arrow.down { bottom: 8px; border-top-color: var(--sky); }
.arrow.left { left: 8px; border-right-color: var(--sky); }
.arrow.right { right: 8px; border-left-color: var(--sky); }
</style>
