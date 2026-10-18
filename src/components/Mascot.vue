<script setup lang="ts">
/**
 * The wyrm, for the start screen: a round-headed neon snake with big shiny
 * eyes and pink cheeks. It bobs gently, blinks now and then and flicks its
 * tongue. Decoration only.
 */
</script>

<template>
  <svg class="mascot" viewBox="0 0 132 84" width="116" height="74" aria-hidden="true">

    <g class="bob">
      <!-- Body: an S curve with an outline, a lighter belly stripe and dots -->
      <path d="M18 68 C 30 70, 34 50, 50 52 S 72 72, 88 56" fill="none" stroke="var(--ink)" stroke-width="20" stroke-linecap="round" />
      <path d="M18 68 C 30 70, 34 50, 50 52 S 72 72, 88 56" fill="none" stroke="var(--sage)" stroke-width="14" stroke-linecap="round" />
      <path d="M18 70 C 30 72, 34 53, 50 55 S 72 74, 88 59" fill="none" stroke="#B9FFB9" stroke-width="4" stroke-linecap="round" opacity="0.7" />
      <circle cx="34" cy="60" r="2.2" fill="#2E9E2E" />
      <circle cx="56" cy="58" r="2.2" fill="#2E9E2E" />
      <circle cx="74" cy="64" r="2.2" fill="#2E9E2E" />

      <!-- Tongue, flicking out from under the head -->
      <path class="tongue" d="M112 50 h9 l3 -3 M121 50 l3 3" fill="none" stroke="var(--coral)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />

      <!-- Head -->
      <rect x="76" y="20" width="40" height="36" rx="14" fill="var(--mint)" stroke="var(--ink)" stroke-width="3" />
      <rect x="80" y="23" width="18" height="6" rx="3" fill="#8DFFE8" opacity="0.8" />

      <!-- Eyes: big, with a shine; they blink -->
      <g class="eyes">
        <ellipse cx="89" cy="36" rx="6" ry="7" fill="#FFFFFF" stroke="var(--ink)" stroke-width="2" />
        <ellipse cx="105" cy="36" rx="6" ry="7" fill="#FFFFFF" stroke="var(--ink)" stroke-width="2" />
        <circle cx="90.5" cy="37.5" r="3.6" fill="var(--ink)" />
        <circle cx="106.5" cy="37.5" r="3.6" fill="var(--ink)" />
        <circle cx="92" cy="35.5" r="1.4" fill="#FFFFFF" />
        <circle cx="108" cy="35.5" r="1.4" fill="#FFFFFF" />
      </g>
      <!-- Cheeks and a little smile -->
      <ellipse cx="84" cy="46" rx="4" ry="2.4" fill="var(--rose)" opacity="0.85" />
      <ellipse cx="111" cy="46" rx="4" ry="2.4" fill="var(--rose)" opacity="0.85" />
      <path d="M93 46 q 2.5 3 5 0 q 2.5 3 5 0" fill="none" stroke="var(--ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </g>

  </svg>
</template>

<style scoped>
.mascot { display: block; overflow: visible; }
.bob { animation: bob 1.12s steps(2) infinite alternate; }
@keyframes bob {
  to { transform: translateY(-2px); }
}
.eyes {
  transform-box: fill-box;
  transform-origin: center;
  animation: blink 4s steps(1) infinite;
}
@keyframes blink {
  0%, 94%, 100% { transform: scaleY(1); }
  96% { transform: scaleY(0.1); }
}
.tongue {
  transform-box: fill-box;
  transform-origin: left center;
  animation: flick 2.6s steps(1) infinite;
}
@keyframes flick {
  0%, 70%, 100% { transform: scaleX(0); }
  74%, 82% { transform: scaleX(1); }
  78% { transform: scaleX(0.6); }
}
</style>
