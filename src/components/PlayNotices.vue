<script setup lang="ts">
/**
 * What shows over the board during play: a new kind of laser arriving, the
 * item just picked up or used, a match's bar, and the level-up banner.
 */
import { computed } from 'vue'
import { demo, laserTiers, layout, state, TIER_NOTE_MS } from '../game'
import { mp } from '../multiplayer'
import { status } from '../app/ui'
import MpBar from './MpBar.vue'
import PowerIcon from './PowerIcon.vue'

/** Colours for the tier intro card. */
const INTRO_COLOR = {
  red: 'var(--coral)',
  blue: 'var(--sky)',
  purple: 'var(--lavender)',
  white: '#FFFFFF',
  green: 'var(--sage)',
  gold: 'var(--sun)',
  prism: 'linear-gradient(90deg, #FF3355, #FFE14D, #5CFF5C, #3FA9FF, #B26BFF)',
} as const
/** What the boss bar says while a Warden is on the board. */
const bossHint = computed(() => {
  const phase = state.boss?.phase
  return phase === 'open' ? 'core open: ram it, dash for double' : phase === 'dying' ? 'coming apart' : phase === 'leaving' ? 'it got away' : 'survive until its core opens'
})
/** The intro lasts two bars at the current tempo. */
const introSeconds = computed(() => (60 / state.bpm) * 8)
/** The new kind of laser to announce: from an intro pause (old runs, or a level that asks), or the notice that plays on. */
const tierShown = computed(() => {
  if (state.intro) return { key: `i${state.intro.until}`, tier: state.intro.tier, healed: state.intro.healed, seconds: introSeconds.value }
  if (state.tierNote) return { key: `n${state.tierNote.id}`, tier: state.tierNote.tier, healed: state.tierNote.healed, seconds: TIER_NOTE_MS / 1000 }
  return null
})
</script>

<template>
  <!-- A new kind of laser: a notice from the top, like the item notices; play goes on -->
  <div
    v-if="tierShown && status === 'running'"
    :key="tierShown.key"
    class="notice tier-note"
    :class="{ touch: layout.pad !== 'none' }"
    :style="{ '--laser': INTRO_COLOR[laserTiers()[tierShown.tier]!.kind], '--note': `${tierShown.seconds}s` }"
  >
    <span class="tier-swatch" aria-hidden="true"></span>
    <span class="notice-text">
      <b>{{ laserTiers()[tierShown.tier]!.name }} · level {{ state.level + 1 }}</b>
      <span>{{ laserTiers()[tierShown.tier]!.blurb }}<template v-if="tierShown.healed"> · +1 heart</template></span>
    </span>
  </div>

  <!-- What was just picked up or used, and what it does -->
  <div v-if="state.notice && status === 'running'" :key="state.notice.id" class="notice" :class="{ touch: layout.pad !== 'none' }">
    <svg viewBox="-0.5 -0.5 1 1" width="30" height="30"><PowerIcon :kind="state.notice.kind" /></svg>
    <span class="notice-text">
      <b>{{ state.notice.title }}</b>
      <span>{{ state.notice.sub }}</span>
    </span>
  </div>

  <!-- A Warden flies in: a slash across the screen with its name -->
  <div
    v-if="state.boss?.phase === 'enter' && status === 'running' && !demo.on"
    :key="`in${state.boss.id}`"
    class="boss-in"
    :style="{ '--laser': INTRO_COLOR[state.boss.kind] }"
  >
    <div class="boss-in-band">
      <span class="boss-in-warn">Warning</span>
      <span class="boss-in-name">{{ state.boss.name }}</span>
      <span class="boss-in-sub">it guards the next laser</span>
    </div>
  </div>

  <!-- A Warden's health: a pip for each hit it can take -->
  <div
    v-if="state.boss && state.boss.phase !== 'enter' && status === 'running' && !demo.on"
    class="boss-bar"
    :class="{ open: state.boss.phase === 'open', touch: layout.pad !== 'none' }"
    :style="{ '--laser': INTRO_COLOR[state.boss.kind] }"
  >
    <b>{{ state.boss.name }}</b>
    <span class="boss-pips" aria-hidden="true"><i v-for="n in state.boss.maxHp" :key="n" :class="{ gone: n > state.boss.hp }"></i></span>
    <span class="boss-hint">{{ bossHint }}</span>
  </div>

  <!-- A match: the clock and standings -->
  <MpBar v-if="mp.phase === 'countdown' || mp.phase === 'playing'" />
  <!-- Level up -->
  <div v-if="state.banner && !demo.on" :key="state.banner.id" class="banner">
    <span class="banner-title">{{ state.banner.title }}</span>
    <span class="banner-sub">{{ state.banner.sub }}</span>
  </div>
</template>

<style scoped>
/* A new kind of laser's notice: the item notice, with its laser colour and a longer stay. */
.notice.tier-note { animation-duration: var(--note); border-color: var(--laser); }
.tier-swatch { flex: none; width: 22px; height: 22px; border: 3px solid var(--ink); background: var(--laser); }

/* ─── Boss ─── */
.boss-in {
  position: absolute;
  inset: 0;
  z-index: 6;
  display: grid;
  place-items: center;
  overflow: hidden;
  pointer-events: none;
  animation: boss-dim 1.9s ease both;
}
@keyframes boss-dim {
  0%, 100% { background: transparent; }
  15%, 80% { background: rgba(0, 0, 0, 0.35); }
}
.boss-in-band {
  display: grid;
  justify-items: center;
  gap: 6px;
  width: 130%;
  padding: 16px 0;
  border-block: 4px solid var(--laser);
  background: repeating-linear-gradient(115deg, var(--bg) 0 18px, var(--ink) 18px 36px);
  rotate: -4deg;
  animation: boss-slash 1.9s cubic-bezier(0.22, 1, 0.36, 1) both;
}
@keyframes boss-slash {
  0% { translate: 100% 0; }
  18%, 78% { translate: 0 0; }
  100% { translate: -100% 0; }
}
.boss-in-warn { font-family: var(--font-pixel); font-size: 12px; letter-spacing: 0.4em; text-transform: uppercase; color: var(--coral); }
.boss-in-name { font-family: var(--font-pixel); font-size: clamp(1.1rem, 4.5vw, 2.4rem); text-transform: uppercase; color: var(--text); text-shadow: 3px 3px 0 var(--ink); }
.boss-in-sub { font-size: 18px; color: var(--text-dim); }
.boss-bar {
  position: absolute;
  bottom: 14px;
  left: 50%;
  z-index: 6;
  display: grid;
  justify-items: center;
  gap: 4px;
  padding: 8px 14px;
  border: 2px solid var(--laser);
  border-radius: 12px;
  background: var(--bg);
  pointer-events: none;
  translate: -50% 0;
  transition: box-shadow 0.18s ease;
}
.boss-bar.touch { bottom: auto; top: 70px; }
.boss-bar.open { box-shadow: 0 0 0 3px var(--sun); }
.boss-bar b { font-family: var(--font-pixel); font-size: 10px; font-weight: 400; text-transform: uppercase; color: var(--text); }
.boss-pips { display: flex; gap: 5px; }
.boss-pips i { width: 26px; height: 8px; border-radius: 3px; background: var(--laser); transition: opacity 0.18s ease, scale 0.18s ease; }
.boss-pips i.gone { opacity: 0.18; scale: 0.8; }
.boss-hint { font-size: 16px; line-height: 1; color: var(--text-dim); white-space: nowrap; }
@media (prefers-reduced-motion: reduce) { .boss-in, .boss-in-band { animation-timing-function: linear; } }

/* ─── Notice ─── */
.notice {
  position: absolute;
  /* Below the power-up slots and their hint. */
  top: 98px;
  left: 50%;
  z-index: 6;
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: calc(100% - 32px);
  padding: 8px 14px;
  border: 3px solid var(--text-dim);
  background: var(--bg);
  box-shadow: 4px 4px 0 var(--border);
  pointer-events: none;
  translate: -50% 0;
  animation: notice 1.8s steps(12) both;
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
@keyframes notice {
  0% { opacity: 0; transform: translateY(-6px); }
  10% { opacity: 1; transform: none; }
  85% { opacity: 1; }
  100% { opacity: 0; }
}

.banner {
  position: absolute;
  top: 38%;
  left: 50%;
  display: grid;
  justify-items: center;
  gap: 0.8rem;
  pointer-events: none;
  translate: -50% -50%;
  animation: banner 1.8s steps(12) both;
}
.banner-title {
  padding: 0.8rem 1.4rem;
  border: 3px solid var(--ink);
  background: var(--sun);
  box-shadow: 6px 6px 0 var(--coral);
  font-family: var(--font-pixel);
  font-size: clamp(1rem, 4vw, 2rem);
  text-transform: uppercase;
  white-space: nowrap;
  color: var(--ink);
}
.banner-sub {
  font-family: var(--font-pixel);
  font-size: 10px;
  text-transform: uppercase;
  color: var(--text);
  text-shadow: 2px 2px 0 var(--ink);
}
/* Phones: the level-up banner a size down, so it does not cover the board. */
@media (max-height: 560px), (max-width: 760px) {
  .banner { top: 28%; gap: 0.35rem; }
  .banner-title { padding: 0.4rem 0.75rem; border-width: 2px; box-shadow: 3px 3px 0 var(--coral); font-size: 0.72rem; }
  .banner-sub { font-size: 7px; }
}
@keyframes banner {
  0% { opacity: 0; transform: scale(0.7); }
  15% { opacity: 1; transform: scale(1.05); }
  25% { transform: scale(1); }
  80% { opacity: 1; }
  100% { opacity: 0; transform: translateY(-20px); }
}

@media (pointer: coarse) and (max-height: 560px) {
  .notice.touch { top: calc(8px + env(safe-area-inset-top)); }
  .notice { zoom: 0.85; }
}
</style>
