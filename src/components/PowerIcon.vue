<script setup lang="ts">
/**
 * A power-up as a coloured tile with a black glyph, or the golden totem.
 * Drawn in a 1 × 1 box centred on 0, so it drops into the board's cell
 * coordinates as it is, or into any <svg viewBox="-0.5 -0.5 1 1">.
 */
import { POWERS, TONE_COLOR, type PowerKind } from '../game'

defineProps<{ kind: PowerKind | 'totem' }>()
</script>

<template>
  <g v-if="kind === 'totem'" class="totem">
    <!-- A little gold idol: head, arms out, body -->
    <rect x="-0.17" y="-0.42" width="0.34" height="0.3" fill="var(--sun)" stroke="var(--ink)" stroke-width="0.05" />
    <rect x="-0.38" y="-0.08" width="0.76" height="0.13" fill="var(--sun)" stroke="var(--ink)" stroke-width="0.05" />
    <rect x="-0.19" y="-0.12" width="0.38" height="0.52" fill="var(--sun)" stroke="var(--ink)" stroke-width="0.05" />
    <rect x="-0.1" y="-0.32" width="0.06" height="0.08" fill="var(--mint)" />
    <rect x="0.04" y="-0.32" width="0.06" height="0.08" fill="var(--mint)" />
    <rect x="-0.08" y="0.12" width="0.16" height="0.06" fill="var(--coral)" />
  </g>
  <g v-else>
    <rect x="-0.42" y="-0.42" width="0.84" height="0.84" :fill="TONE_COLOR[POWERS[kind].tone]" stroke="var(--ink)" stroke-width="0.06" />
    <g fill="var(--ink)" stroke="var(--ink)" stroke-linejoin="miter">
      <path v-if="kind === 'shield'" d="M0 -0.28 L0.24 -0.18 V0.02 Q0.24 0.2 0 0.3 Q-0.24 0.2 -0.24 0.02 V-0.18 Z" stroke="none" />
      <g v-else-if="kind === 'double'" stroke="none">
        <path d="M-0.3 -0.12 L-0.22 -0.2 L-0.14 -0.12 L-0.06 -0.2 L0.02 -0.12 L-0.06 -0.04 L0.02 0.04 L-0.06 0.12 L-0.14 0.04 L-0.22 0.12 L-0.3 0.04 L-0.22 -0.04 Z" />
        <path d="M0.06 -0.22 H0.3 V0.02 H0.14 V0.12 H0.3 V0.2 H0.06 V-0.04 H0.22 V-0.14 H0.06 Z" />
      </g>
      <g v-else-if="kind === 'slow'" fill="none" stroke-width="0.07">
        <rect x="-0.25" y="-0.25" width="0.5" height="0.5" />
        <path d="M0 -0.15 V0.02 H0.13" />
      </g>
      <path v-else-if="kind === 'dash'" d="M-0.28 -0.22 L-0.06 0 L-0.28 0.22 M0.02 -0.22 L0.24 0 L0.02 0.22" fill="none" stroke-width="0.09" />
      <g v-else-if="kind === 'magnet'" fill="none" stroke-width="0.12">
        <path d="M-0.18 -0.26 V0.06 A0.18 0.18 0 0 0 0.18 0.06 V-0.26" />
      </g>
      <g v-else-if="kind === 'ghost'" stroke="none">
        <path d="M-0.22 0.28 V-0.04 A0.22 0.22 0 0 1 0.22 -0.04 V0.28 L0.11 0.18 L0 0.28 L-0.11 0.18 Z" />
        <rect x="-0.12" y="-0.08" width="0.07" height="0.1" fill="#E8E8FF" />
        <rect x="0.05" y="-0.08" width="0.07" height="0.1" fill="#E8E8FF" />
      </g>
    </g>
  </g>
</template>
