<script setup lang="ts">
/**
 * A hat, drawn in board units around (0, 0): the middle of the head cell.
 * It sits on top of the head, upright whichever way the snake goes. With
 * `mono`, it is drawn in that one colour (a hologram's).
 */
defineProps<{ hat: string; mono?: string }>()
</script>

<template>
  <g v-if="hat !== 'none'" class="hat" :opacity="mono ? 0.8 : 1">
    <template v-if="hat === 'cap'">
      <path d="M -0.34 -0.3 Q -0.34 -0.78 0 -0.78 Q 0.34 -0.78 0.34 -0.3 Z" :fill="mono ?? 'var(--coral)'" stroke="var(--ink)" stroke-width="1.5" vector-effect="non-scaling-stroke" />
      <path d="M 0.2 -0.34 H 0.62 V -0.26 H 0.2 Z" :fill="mono ?? 'var(--coral)'" stroke="var(--ink)" stroke-width="1.5" vector-effect="non-scaling-stroke" />
      <circle cy="-0.8" r="0.06" :fill="mono ?? 'var(--sun)'" />
    </template>
    <template v-else-if="hat === 'party'">
      <path d="M -0.3 -0.32 L 0 -1.08 L 0.3 -0.32 Z" :fill="mono ?? 'var(--rose)'" stroke="var(--ink)" stroke-width="1.5" vector-effect="non-scaling-stroke" />
      <path d="M -0.2 -0.56 L 0.2 -0.66 M -0.11 -0.8 L 0.12 -0.86" :stroke="mono ?? 'var(--sun)'" stroke-width="0.07" />
      <circle cy="-1.1" r="0.1" :fill="mono ?? 'var(--sun)'" stroke="var(--ink)" stroke-width="1" vector-effect="non-scaling-stroke" />
    </template>
    <template v-else-if="hat === 'bow'">
      <path d="M 0 -0.5 L -0.36 -0.72 L -0.36 -0.3 Z M 0 -0.5 L 0.36 -0.72 L 0.36 -0.3 Z" :fill="mono ?? 'var(--rose)'" stroke="var(--ink)" stroke-width="1.5" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
      <circle cy="-0.5" r="0.09" :fill="mono ?? 'var(--coral)'" stroke="var(--ink)" stroke-width="1.2" vector-effect="non-scaling-stroke" />
    </template>
    <template v-else-if="hat === 'star'">
      <polygon points="0,-1.02 0.09,-0.78 0.34,-0.77 0.14,-0.62 0.21,-0.38 0,-0.52 -0.21,-0.38 -0.14,-0.62 -0.34,-0.77 -0.09,-0.78" :fill="mono ?? 'var(--sun)'" stroke="var(--ink)" stroke-width="1.5" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
    </template>
    <template v-else-if="hat === 'wizard'">
      <path d="M -0.44 -0.32 H 0.44 L 0.3 -0.42 L 0.06 -1.16 L -0.3 -0.42 Z" :fill="mono ?? 'var(--lavender)'" stroke="var(--ink)" stroke-width="1.5" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
      <circle cx="-0.04" cy="-0.66" r="0.05" :fill="mono ? 'var(--ink)' : 'var(--sun)'" />
      <circle cx="0.12" cy="-0.5" r="0.035" :fill="mono ? 'var(--ink)' : 'var(--sun)'" />
    </template>
    <template v-else-if="hat === 'crown'">
      <path d="M -0.36 -0.32 V -0.82 L -0.18 -0.6 L 0 -0.9 L 0.18 -0.6 L 0.36 -0.82 V -0.32 Z" :fill="mono ?? 'var(--sun)'" stroke="var(--ink)" stroke-width="1.5" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
      <circle cy="-0.46" r="0.06" :fill="mono ? 'var(--ink)' : 'var(--coral)'" />
    </template>
    <template v-else-if="hat === 'horns'">
      <path d="M -0.3 -0.34 Q -0.5 -0.6 -0.38 -0.86 Q -0.26 -0.6 -0.12 -0.38 Z M 0.3 -0.34 Q 0.5 -0.6 0.38 -0.86 Q 0.26 -0.6 0.12 -0.38 Z" :fill="mono ?? 'var(--coral)'" stroke="var(--ink)" stroke-width="1.5" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
    </template>
    <template v-else-if="hat === 'tophat'">
      <rect x="-0.46" y="-0.4" width="0.92" height="0.1" :fill="mono ?? '#1A1A2E'" stroke="var(--ink)" stroke-width="1.5" vector-effect="non-scaling-stroke" />
      <rect x="-0.28" y="-1.0" width="0.56" height="0.62" :fill="mono ?? '#1A1A2E'" stroke="var(--ink)" stroke-width="1.5" vector-effect="non-scaling-stroke" />
      <rect x="-0.28" y="-0.54" width="0.56" height="0.1" :fill="mono ? 'var(--ink)' : 'var(--coral)'" />
    </template>
    <template v-else-if="hat === 'halo'">
      <ellipse cy="-0.74" rx="0.36" ry="0.12" fill="none" :stroke="mono ?? 'var(--sun)'" stroke-width="0.09" />
    </template>
  </g>
</template>
