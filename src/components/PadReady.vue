<script setup lang="ts">
/**
 * "Controller connected: click once." Shown when a controller joins before
 * the page has had a click or key, which browsers need before they allow
 * full screen and sound (see src/app/padReady.ts). Clicking anywhere
 * answers it; A or B on the controller skips it.
 */
import { padPrompt } from '../app/padReady'
import PadGlyph from './PadGlyph.vue'
</script>

<template>
  <Transition name="ready">
    <div v-if="padPrompt" class="ready" role="dialog" aria-label="Controller connected: click once to go full screen with sound">
      <div class="ready-card">
        <div class="art" aria-hidden="true">
          <!-- The controller, with signal waves -->
          <svg class="gamepad" viewBox="0 0 48 32" width="168" height="112">
            <path class="wave w1" d="M20 4a6 6 0 0 1 8 0" />
            <path class="wave w2" d="M17 1a11 11 0 0 1 14 0" />
            <path d="M10 8h28a8 8 0 0 1 8 8l2 10a5 5 0 0 1-9 3l-5-5H14l-5 5a5 5 0 0 1-9-3l2-10a8 8 0 0 1 8-8z" fill="var(--mint)" stroke="var(--ink)" stroke-width="2" />
            <path d="M12 13v6M9 16h6" stroke="var(--ink)" stroke-width="2.4" stroke-linecap="square" />
            <circle cx="35" cy="13.5" r="2" fill="var(--coral)" stroke="var(--ink)" />
            <circle cx="39" cy="17" r="2" fill="var(--sun)" stroke="var(--ink)" />
            <circle cx="31" cy="17" r="2" fill="var(--sky)" stroke="var(--ink)" />
            <circle cx="35" cy="20.5" r="2" fill="var(--sage)" stroke="var(--ink)" />
          </svg>
          <span class="plus">+</span>
          <!-- A mouse, its left button clicking -->
          <svg class="mouse" viewBox="0 0 24 34" width="64" height="90">
            <path d="M12 2a10 10 0 0 1 10 10v10a10 10 0 0 1-20 0V12A10 10 0 0 1 12 2z" fill="var(--bg-warm)" stroke="var(--text-dim)" stroke-width="2" />
            <path class="button" d="M12 3a9 9 0 0 0-9 9v2h9z" fill="var(--rose)" />
            <path d="M12 2v12M2 14h20" stroke="var(--text-dim)" stroke-width="1.6" />
          </svg>
        </div>
        <h2>Controller connected</h2>
        <p class="lead">Click once to play full screen, with sound.</p>
        <p class="why">Browsers only allow full screen and sound after a click or a key, never from a controller. After this one click, the controller does everything.</p>
        <p class="skip"><PadGlyph button="a" /> or <PadGlyph button="b" /> play without</p>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.ready {
  position: absolute;
  inset: 0;
  z-index: 9;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.78);
  cursor: pointer;
}
.ready-card {
  display: grid;
  justify-items: center;
  gap: 0.9rem;
  width: min(26rem, 100%);
  padding: 1.6rem 1.6rem 1.3rem;
  border: 3px solid var(--rose);
  border-radius: 16px;
  background: var(--bg);
  box-shadow: 0 0 0 3px var(--ink), 0 0 0 6px var(--mint), 8px 8px 0 6px var(--ink);
  text-align: center;
}
.art { display: flex; align-items: center; gap: 14px; }
.gamepad { animation: bob 1.6s ease-in-out infinite; }
.wave { fill: none; stroke: var(--mint); stroke-width: 2; stroke-linecap: round; opacity: 0; animation: wave 1.6s ease-out infinite; }
.w2 { animation-delay: 0.25s; }
.plus { font-family: var(--font-pixel); font-size: 16px; color: var(--text-muted); }
.mouse .button { animation: click 1.6s ease-in-out infinite; }
.mouse { animation: nudge 1.6s ease-in-out infinite; }
h2 {
  margin: 0;
  font-family: var(--font-pixel);
  font-size: 1rem;
  font-weight: 400;
  line-height: 1.3;
  text-transform: uppercase;
  color: var(--mint);
  text-shadow: 3px 3px 0 var(--ink);
}
p { margin: 0; }
.lead { font-size: 21px; color: var(--text); }
.why { font-size: 15px; line-height: 1.25; color: var(--text-muted); }
.skip { display: flex; align-items: center; gap: 6px; font-size: 16px; text-transform: uppercase; color: var(--text-dim); }

@keyframes bob { 50% { transform: translateY(-4px); } }
@keyframes wave {
  0% { opacity: 0; transform: translateY(3px); }
  30% { opacity: 1; }
  100% { opacity: 0; transform: translateY(-3px); }
}
/* The button goes down and comes back, as the mouse dips with it. */
@keyframes click {
  0%, 40%, 100% { opacity: 0.35; }
  50%, 60% { opacity: 1; }
}
@keyframes nudge { 50%, 60% { transform: translateY(2px); } }

/* In and out quickly: fading, and growing from a little smaller. */
.ready-enter-active { transition: opacity 0.18s var(--ease-out); }
.ready-leave-active { transition: opacity 0.12s ease-in; }
.ready-enter-active .ready-card { transition: transform 0.18s var(--ease-out); }
.ready-leave-active .ready-card { transition: transform 0.12s ease-in; }
.ready-enter-from, .ready-leave-to { opacity: 0; }
.ready-enter-from .ready-card, .ready-leave-to .ready-card { transform: scale(0.95); }
@media (prefers-reduced-motion: reduce) {
  .gamepad, .wave, .mouse, .mouse .button { animation: none; }
  .wave { opacity: 1; }
}
@media (max-height: 460px) {
  .ready-card { gap: 0.6rem; padding: 1rem 1.2rem; }
  .art svg.gamepad { width: 120px; height: 80px; }
  .art svg.mouse { width: 44px; height: 62px; }
  .why { display: none; }
}
</style>
