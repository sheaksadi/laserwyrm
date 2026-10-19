<script setup lang="ts">
/**
 * The frame-rate meter in the bottom right corner: FPS, the 1% low, and a
 * graph of recent frame times (each bar one frame; taller is slower, the
 * line is 60 fps). Switched on in Settings.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { frames, GRAPH_FRAMES, meter, onFrame, showGraph, showLow } from '../perf'

const W = GRAPH_FRAMES
const H = 40
/** The graph's top: frames this slow (20 fps) or slower fill it. */
const TOP_MS = 50

const canvas = ref<HTMLCanvasElement | null>(null)

/** Green while smooth, yellow under 60 fps, red under 30. */
const tone = (fps: number) => (fps >= 55 ? 'var(--sage)' : fps >= 30 ? 'var(--sun)' : 'var(--coral)')

function draw() {
  const ctx = canvas.value?.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, W, H)
  const start = Math.max(0, frames.length - W)
  for (let i = start; i < frames.length; i++) {
    const ms = frames[i]!
    const h = Math.max(1, Math.min(H, (ms / TOP_MS) * H))
    ctx.fillStyle = ms <= 18 ? '#5CFF5C' : ms <= 34 ? '#FFE14D' : '#FF3355'
    ctx.fillRect(W - (frames.length - i), H - h, 1, h)
  }
  // The 60 fps line.
  ctx.fillStyle = 'rgba(232, 232, 255, 0.35)'
  ctx.fillRect(0, Math.round(H - (16.7 / TOP_MS) * H), W, 1)
}

// Redraw after every frame; with the graph off there is no canvas and nothing to draw.
let off = () => false
onMounted(() => (off = onFrame(draw)))
onBeforeUnmount(() => off())
</script>

<template>
  <div class="fps" aria-hidden="true">
    <div class="numbers">
      <span class="stat"><b :style="{ color: tone(meter.fps) }">{{ meter.fps }}</b> fps</span>
      <span v-if="showLow" class="stat"><b :style="{ color: tone(meter.low) }">{{ meter.low }}</b> 1% low</span>
    </div>
    <canvas v-if="showGraph" ref="canvas" :width="W" :height="H"></canvas>
  </div>
</template>

<style scoped>
.fps {
  position: absolute;
  right: calc(14px + env(safe-area-inset-right));
  bottom: calc(14px + env(safe-area-inset-bottom));
  z-index: 11;
  display: grid;
  gap: 4px;
  justify-items: end;
  padding: 4px 8px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.55);
  pointer-events: none;
  font-size: 16px;
  line-height: 1;
  text-transform: uppercase;
  color: var(--text-muted);
}
.numbers { display: flex; gap: 10px; }
.stat b { font-family: var(--font-pixel); font-size: 10px; font-weight: 400; font-variant-numeric: tabular-nums; }
canvas { display: block; width: 120px; height: 40px; border-radius: 3px; background: rgba(232, 232, 255, 0.06); image-rendering: pixelated; }
</style>
