<script setup lang="ts">
/**
 * One item's art, drawn in board units around (0, 0): fruit, cookies, the
 * heart, power-ups and the totem. The SVG board draws it in place; the
 * canvas board draws it as an icon (`still`: no animation of its own, the
 * canvas moves it instead).
 */
import { HEART_PATH, type ItemKind } from '../game'
import PowerIcon from './PowerIcon.vue'

defineProps<{ kind: ItemKind; still?: boolean }>()

/** Where a cookie's chips (or a starry cookie's stars) sit. */
const CHIPS: [number, number][] = [[-0.14, -0.12], [0.13, -0.06], [-0.04, 0.14], [0.17, 0.17], [-0.2, 0.08]]
/** A small five-pointed star at (x, y). */
function tinyStar(x: number, y: number, r = 0.09) {
  return Array.from({ length: 10 }, (_, i) => {
    const rr = i % 2 ? r * 0.45 : r
    const a = (i * Math.PI) / 5 - Math.PI / 2
    return `${(x + Math.cos(a) * rr).toFixed(3)},${(y + Math.sin(a) * rr).toFixed(3)}`
  }).join(' ')
}
const STAR = (() => {
  const pts: string[] = []
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 0.42 : 0.19
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2
    pts.push(`${(Math.cos(a) * r).toFixed(3)},${(Math.sin(a) * r).toFixed(3)}`)
  }
  return pts.join(' ')
})()
</script>

<template>
  <template v-if="kind === 'apple'">
    <circle cy="0.06" r="0.34" fill="var(--coral)" stroke="var(--ink)" stroke-width="2" vector-effect="non-scaling-stroke" />
    <path d="M 0.02 -0.26 q 0.12 -0.18 0.3 -0.14 q -0.06 0.2 -0.3 0.14 z" fill="var(--sage)" stroke="var(--ink)" stroke-width="1.5" vector-effect="non-scaling-stroke" />
  </template>
  <template v-else-if="kind === 'cherry'">
    <path d="M -0.18 0.1 Q -0.05 -0.3 0.12 -0.38 M 0.18 0.14 Q 0.12 -0.2 0.12 -0.38" fill="none" stroke="var(--ink)" stroke-width="1.5" vector-effect="non-scaling-stroke" />
    <circle cx="-0.18" cy="0.16" r="0.2" fill="var(--rose)" stroke="var(--ink)" stroke-width="2" vector-effect="non-scaling-stroke" />
    <circle cx="0.2" cy="0.2" r="0.2" fill="var(--rose)" stroke="var(--ink)" stroke-width="2" vector-effect="non-scaling-stroke" />
  </template>
  <template v-else-if="kind === 'star'">
    <g :class="{ spin: !still }">
      <polygon :points="STAR" fill="var(--sun)" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
    </g>
  </template>
  <template v-else-if="kind === 'heart'">
    <g :class="{ 'beat-throb': !still }">
      <path :d="HEART_PATH" transform="scale(0.12) translate(-3.5 -3)" fill="var(--coral)" stroke="var(--ink)" stroke-width="2" vector-effect="non-scaling-stroke" />
    </g>
  </template>
  <!-- Cookies: plain with chips; the wizard's wears a hat; the starry one is night-blue with stars, and twinkles -->
  <template v-else-if="kind === 'cookie'">
    <circle r="0.36" fill="#C98A4B" stroke="var(--ink)" stroke-width="2" vector-effect="non-scaling-stroke" />
    <circle v-for="(c, i) in CHIPS" :key="i" :cx="c[0]" :cy="c[1]" r="0.055" fill="#4A2A12" />
  </template>
  <template v-else-if="kind === 'wizard'">
    <g :class="{ 'beat-throb': !still }">
      <circle cy="0.08" r="0.32" fill="#C98A4B" stroke="var(--ink)" stroke-width="2" vector-effect="non-scaling-stroke" />
      <circle v-for="(c, i) in CHIPS.slice(0, 3)" :key="i" :cx="c[0]" :cy="c[1] + 0.1" r="0.05" fill="#4A2A12" />
      <path d="M -0.26 -0.1 L 0.02 -0.5 L 0.24 -0.12 Z" fill="var(--lavender)" stroke="var(--ink)" stroke-width="1.5" vector-effect="non-scaling-stroke" />
      <path d="M -0.32 -0.1 H 0.3" stroke="var(--lavender)" stroke-width="0.07" />
      <circle cx="0.04" cy="-0.28" r="0.035" fill="var(--sun)" />
    </g>
  </template>
  <template v-else-if="kind === 'starry'">
    <circle r="0.37" fill="#1C2466" stroke="var(--sun)" stroke-width="2" vector-effect="non-scaling-stroke" />
    <g :class="{ twinkle: !still }">
      <polygon v-for="(c, i) in CHIPS" :key="i" :points="tinyStar(c[0], c[1])" fill="var(--sun)" />
    </g>
  </template>
  <!-- Power-ups and the totem -->
  <g v-else :class="{ 'beat-throb': kind === 'totem' && !still }"><PowerIcon :kind="kind" /></g>
</template>

<style scoped>
.spin {
  transform-box: fill-box;
  transform-origin: center;
  animation: spin 3s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.beat-throb {
  transform-box: fill-box;
  transform-origin: center;
  animation: throb 0.6s steps(2) infinite;
}
@keyframes throb {
  50% { transform: scale(1.25); }
}
.twinkle { animation: twinkle 0.9s ease-in-out infinite alternate; }
@keyframes twinkle { from { opacity: 0.45; } to { opacity: 1; } }
</style>
