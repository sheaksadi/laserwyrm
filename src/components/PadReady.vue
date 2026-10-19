<script setup lang="ts">
/**
 * "Controller connected": a notice from the top, like the ones for items.
 * Before the page has had a click it also asks for one (full screen and
 * sound need it; see src/app/padReady.ts) and stays a little longer.
 */
import { layout } from '../game'
import { padNotice } from '../app/padReady'
</script>

<template>
  <div
    v-if="padNotice"
    :key="padNotice.id"
    class="notice"
    :class="{ touch: layout.pad !== 'none', ask: padNotice.ask }"
    :style="{ '--note': `${padNotice.seconds}s` }"
    role="status"
  >
    <svg class="pad-icon" viewBox="0 0 48 32" width="44" height="30" aria-hidden="true">
      <path d="M10 8h28a8 8 0 0 1 8 8l2 10a5 5 0 0 1-9 3l-5-5H14l-5 5a5 5 0 0 1-9-3l2-10a8 8 0 0 1 8-8z" fill="var(--mint)" stroke="var(--ink)" stroke-width="2.5" />
      <path d="M12 13v6M9 16h6" stroke="var(--ink)" stroke-width="2.6" stroke-linecap="square" />
      <circle cx="35" cy="13.5" r="2.2" fill="var(--coral)" stroke="var(--ink)" />
      <circle cx="39" cy="17" r="2.2" fill="var(--sun)" stroke="var(--ink)" />
      <circle cx="31" cy="17" r="2.2" fill="var(--sky)" stroke="var(--ink)" />
      <circle cx="35" cy="20.5" r="2.2" fill="var(--sage)" stroke="var(--ink)" />
    </svg>
    <span class="notice-text">
      <b>Controller connected</b>
      <span v-if="padNotice.ask">click once for full screen and sound</span>
      <span v-else>you're all set</span>
    </span>
    <!-- A mouse, clicking: what to do -->
    <svg v-if="padNotice.ask" class="mouse" viewBox="0 0 24 34" width="20" height="28" aria-hidden="true">
      <path d="M12 2a10 10 0 0 1 10 10v10a10 10 0 0 1-20 0V12A10 10 0 0 1 12 2z" fill="var(--bg-warm)" stroke="var(--text-dim)" stroke-width="2.5" />
      <path class="button" d="M12 3a9 9 0 0 0-9 9v2h9z" fill="var(--rose)" />
      <path d="M12 2v12M2 14h20" stroke="var(--text-dim)" stroke-width="2" />
    </svg>
  </div>
</template>

<style scoped>
/* The item notice's look (PlayNotices.vue), held for `--note`. */
.notice {
  position: absolute;
  top: 98px;
  left: 50%;
  z-index: 8;
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: calc(100% - 32px);
  padding: 8px 14px;
  border: 3px solid var(--mint);
  background: var(--bg);
  box-shadow: 4px 4px 0 var(--border);
  pointer-events: none;
  translate: -50% 0;
  animation: notice var(--note) steps(24) both;
}
.notice.touch { top: 70px; }
.notice svg { flex: none; }
.notice-text { display: grid; gap: 2px; }
.notice-text b {
  font-family: var(--font-pixel);
  font-size: 10px;
  font-weight: 400;
  line-height: 1.5;
  text-transform: uppercase;
  color: var(--sun);
}
.notice-text span { font-size: 17px; line-height: 1.1; color: var(--text-dim); }
.mouse .button { animation: click 1.2s steps(2) infinite; }
@keyframes click { 50% { opacity: 0.25; } }
@keyframes notice {
  0% { opacity: 0; transform: translateY(-6px); }
  6% { opacity: 1; transform: none; }
  90% { opacity: 1; }
  100% { opacity: 0; }
}
@media (pointer: coarse) and (max-height: 560px) {
  .notice.touch { top: calc(8px + env(safe-area-inset-top)); }
  .notice { zoom: 0.85; }
}
</style>
