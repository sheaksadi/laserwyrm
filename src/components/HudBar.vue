<script setup lang="ts">
/**
 * The HUD over the board: hearts, score and multiplier on the left, held
 * power-ups in the middle, best, level and tempo on the right, then play or
 * pause and the ☰ menu. On phones it splits into the side gutters.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { musicOn, muted } from '../audio'
import { demo, effectLeft, HEART_PATH, isActive, layout, match, multiplier, POWERS, startHearts, state, toggle, TONE_COLOR, TOTEM } from '../game'
import { account } from '../account'
import { shared } from '../design'
import { mp } from '../multiplayer'
import { sync } from '../sync'
import { touchControls } from '../controls'
import { go } from '../app/route'
import { openAccount, openAgent, openCustom, openSettings, restart, status, toggleMusic, toggleMute, ui } from '../app/ui'
import HeldPills from './HeldPills.vue'
import PowerIcon from './PowerIcon.vue'

/** Power-ups that last a while get a countdown tag in the HUD; Dash is instant. */
const EFFECTS = (['shield', 'double', 'slow', 'magnet', 'ghost'] as const).map((key) => ({
  key,
  label: POWERS[key].name,
  color: TONE_COLOR[POWERS[key].tone],
}))

/** The HUD's numbers: the game in play, or (behind the start screen) the fresh one that is ready. */
const hud = computed(() => (demo.on ? demo.hud : { hearts: state.hearts, score: state.score, mult: multiplier(), level: state.level }))
/** Three slots, more once a heart drop takes you past three; empty ones show what is lost. */
const heartSlots = computed(() => Array.from({ length: Math.max(startHearts(), hud.value.hearts) }, (_, i) => i < hud.value.hearts))

/** A click anywhere outside the menu closes it. */
const menu = ref<HTMLElement | null>(null)
function onPointerDown(event: PointerEvent) {
  if (ui.menuOpen && !menu.value?.contains(event.target as Node)) ui.menuOpen = false
}
onMounted(() => window.addEventListener('pointerdown', onPointerDown))
onBeforeUnmount(() => window.removeEventListener('pointerdown', onPointerDown))
</script>

<template>
  <!-- HUD: stats on the left, held power-ups in the middle, level and buttons on the right.
       Every number sits in a fixed-width box, so nothing shifts as it counts. -->
  <div class="hud" :class="layout.pad === 'none' ? 'hud-grid' : 'hud-phone'">
    <div class="hud-left">
      <div class="chip">
        <span class="brand show-wide">Laserwyrm<span class="brand-dot">.</span></span>
        <span class="divider show-wide"></span>
        <!-- Parts: one row on desktop; on phones, two chips in the left gutter (hearts above, numbers below) -->
        <span class="part part-top">
        <span :key="hud.hearts" class="hearts" :class="{ low: hud.hearts === 1 }" :aria-label="`${hud.hearts} hearts`" role="img">
          <svg v-for="(full, i) in heartSlots" :key="i" viewBox="-0.5 -0.5 8 7" width="18" height="16">
            <path :d="HEART_PATH" :fill="full ? 'var(--coral)' : 'none'" :stroke="full ? 'var(--ink)' : 'var(--text-muted)'" stroke-width="1" />
          </svg>
          <svg v-if="state.totem && !demo.on" class="totem-held" viewBox="-0.5 -0.5 1 1" width="18" height="18" :title="TOTEM.name"><PowerIcon kind="totem" /></svg>
        </span>
        </span>
        <span class="divider"></span>
        <span class="part part-bottom">
        <span class="stat stat-score"><span class="chrome-label">score</span><b class="num score-num">{{ hud.score }}</b></span>
        <span class="stat"><span class="chrome-label">mult</span><b class="num mult-num mult" :class="{ doubled: isActive('double') && !demo.on }">×{{ hud.mult }}</b></span>
        </span>
        <span v-if="state.cheated && !match.on" class="cheat-tag" :title="state.usedCheats ? 'Cheats used: this run cannot set a best' : 'A changed game: this run cannot set a best'">{{ state.usedCheats ? 'cheats' : shared.slug ? 'shared' : 'custom' }}</span>
        <span v-if="state.mode === 'hardcore'" class="hc-tag" title="Hardcore: walls kill, no hearts back, no pauses">hardcore</span>
      </div>
      <div v-if="!demo.on" class="effects">
        <!-- After a wizard cookie: no lasers for a moment -->
        <div v-if="state.wizardUntil > state.step" class="effect" style="--fx: var(--lavender)">
          <span class="text-trim">No lasers</span>
          <span class="effect-bar" :style="{ transform: `scaleX(${Math.min(1, (state.wizardUntil - state.step) / 32)})` }"></span>
        </div>
        <template v-for="effect in EFFECTS" :key="effect.key">
          <div v-if="isActive(effect.key)" class="effect" :style="{ '--fx': effect.color }">
            <span class="text-trim">{{ effect.label }}</span>
            <span class="effect-bar" :style="{ transform: `scaleX(${effectLeft(effect.key)})` }"></span>
          </div>
        </template>
      </div>
    </div>
    <div class="hud-center">
      <HeldPills v-if="layout.pad === 'none'" />
    </div>
    <div class="hud-right">
      <div class="chip hide-md">
        <span class="stat"><span class="chrome-label">best</span><b class="num best-num">{{ state.best }}</b></span>
        <span class="divider"></span>
        <span class="stat"><span class="chrome-label">level</span><b class="num level-num">{{ hud.level + 1 }}</b></span>
        <span class="bpm" :style="{ '--beat': `${60 / state.bpm}s` }">
          <span class="bpm-dot" :class="{ live: status === 'running' }"></span>{{ state.bpm }} bpm
        </span>
      </div>
      <!-- In a match there is no pause: the button offers the way out instead -->
      <button class="round" :aria-label="status === 'running' ? 'Pause' : 'Play'" @click="match.on && mp.phase === 'playing' ? (ui.mpMenu = !ui.mpMenu) : toggle()">
        <svg v-if="status === 'running'" viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
        <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
      </button>
      <div ref="menu" class="menu-wrap">
        <button class="round" :class="{ open: ui.menuOpen }" aria-label="Menu" aria-haspopup="menu" :aria-expanded="ui.menuOpen" @click="ui.menuOpen = !ui.menuOpen">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="3" y="5" width="18" height="3" /><rect x="3" y="11" width="18" height="3" /><rect x="3" y="17" width="18" height="3" /></svg>
        </button>
        <div v-if="ui.menuOpen" class="menu" role="menu">
          <button class="menu-item" role="menuitemcheckbox" :aria-checked="musicOn" @click="toggleMusic">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
              <path v-if="!musicOn" d="M3 3l18 18" />
            </svg>
            <span>Music</span><span class="state" :class="{ on: musicOn }">{{ musicOn ? 'on' : 'off' }}</span><kbd class="hide-touch">B</kbd>
          </button>
          <!-- Phones: switch between the D-pad and the stick without going into settings -->
          <button v-if="layout.pad !== 'none'" class="menu-item" role="menuitem" @click="touchControls = touchControls === 'dpad' ? 'stick' : 'dpad'">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" /></svg>
            <span>Controls</span><span class="state on">{{ touchControls === 'dpad' ? 'd-pad' : 'stick' }}</span><span></span>
          </button>
          <button class="menu-item" role="menuitem" @click="openSettings">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0" /><path d="M16 4v4M8 10v4M18 16v4" /></svg>
            <span>Settings</span><span></span><span></span>
          </button>
          <button class="menu-item" role="menuitemcheckbox" :aria-checked="!muted" @click="toggleMute">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 5 6 9H2v6h4l5 4V5z" />
              <path v-if="muted" d="m22 9-6 6M16 9l6 6" />
              <path v-else d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />
            </svg>
            <span>Sound</span><span class="state" :class="{ on: !muted }">{{ muted ? 'off' : 'on' }}</span><kbd class="hide-touch">M</kbd>
          </button>
          <button class="menu-item" role="menuitem" @click="restart">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
            <span>Restart</span><span></span><kbd class="hide-touch">R</kbd>
          </button>
          <button class="menu-item" role="menuitem" @click="ui.menuOpen = false; go('#/scores')">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3" /></svg>
            <span>High scores</span><span></span><span></span>
          </button>
          <button class="menu-item" role="menuitem" @click="ui.menuOpen = false; go('#/replays')">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><path d="M4 5h16v14H4zM10 9v6l5-3z" /></svg>
            <span>Replays</span><span></span><span></span>
          </button>
          <button class="menu-item" role="menuitem" @click="openAccount">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" /></svg>
            <span>Account</span><span class="state" :class="{ on: account.name }">{{ account.name ?? 'sign in' }}</span><span></span>
          </button>
          <button class="menu-item" role="menuitem" @click="openAgent">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="5" y="8" width="14" height="11" rx="2" /><path d="M12 4v4M9 13h.01M15 13h.01M9 16h6" /></svg>
            <span>AI agent</span><span class="state" :class="{ on: sync.on }">{{ sync.on ? 'on' : '' }}</span><span></span>
          </button>
          <button class="menu-item" role="menuitem" @click="openCustom">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20 14 10M14 4v3M14 13v3M10 7H7M21 7h-3M17 4l-1.5 1.5M17 10l-1.5-1.5" /></svg>
            <span>Custom</span><span></span><kbd class="hide-touch">C</kbd>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ─── HUD ─── */
.hud {
  position: absolute;
  top: 14px;
  left: 14px;
  right: 14px;
  z-index: 6;
  gap: 12px;
  pointer-events: none;
}
/* Desktop: three columns, so the held power-ups stay dead centre. */
.hud-grid {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: start;
}
/* Desktop: effect tags and the chip's parts are just more items in the row. */
.effects,
.part { display: contents; }
.hud-left,
.hud-right {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
/* Effect tags wrap under the score instead of running under the buttons. */
.hud-left { flex-wrap: wrap; justify-self: start; }
.hud-right { justify-self: end; }
.hud-left > *,
.hud-center > *,
.hud-right > * { pointer-events: auto; }

/* Fixed-width numbers: room for the digits they will reach, so counting never shifts the bar. */
.num { display: inline-block; text-align: left; }
.score-num { min-width: 6ch; }
.mult-num { min-width: 5ch; }
.best-num { min-width: 6ch; }
.level-num { min-width: 2ch; }
.totem-held { margin-left: 4px; }
.hc-tag {
  padding: 2px 6px;
  background: var(--coral);
  color: var(--ink);
  font-size: 15px;
  text-transform: uppercase;
}
.cheat-tag {
  padding: 2px 6px;
  background: var(--sage);
  color: var(--ink);
  font-size: 15px;
  text-transform: uppercase;
}

.chip {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 16px;
  background: var(--bg);
  border: 3px solid var(--sky);
  box-shadow: 4px 4px 0 var(--border);
}
.brand {
  font-family: var(--font-pixel);
  font-size: 13px;
  color: var(--sun);
  text-shadow: 2px 2px 0 var(--coral);
  text-transform: uppercase;
}
.brand-dot { color: var(--mint); text-shadow: none; }
.divider {
  width: 3px;
  height: 22px;
  background: var(--border);
}
/* Label and number come from two fonts with different line boxes; trimmed to
   their capital height and centred, they sit level with each other. */
.stat {
  display: flex;
  align-items: center;
  gap: 8px;
}
.stat .chrome-label,
.stat b {
  display: block;
  line-height: 1;
  text-box: trim-both cap alphabetic;
}
.stat .chrome-label { font-size: 16px; }
.stat b {
  white-space: nowrap;
  font-family: var(--font-pixel);
  font-size: 13px;
  font-weight: 400;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.round {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border: 3px solid var(--sky);
  background: var(--bg);
  color: var(--sky);
  box-shadow: 4px 4px 0 var(--border);
}
.round:hover { background: var(--sky); color: var(--ink); }
.round:active { transform: translate(4px, 4px); box-shadow: none; }
.round:focus-visible {
  outline: 3px solid var(--sun);
  outline-offset: 3px;
}

/* ─── HUD extras ─── */
.bpm {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 17px;
  color: var(--text-dim);
  text-transform: uppercase;
  font-variant-numeric: tabular-nums;
}
.bpm-dot {
  width: 8px;
  height: 8px;
  background: var(--border);
}
.bpm-dot.live {
  background: var(--coral);
  animation: tick var(--beat) steps(1) infinite;
}
@keyframes tick {
  0% { opacity: 1; }
  30% { opacity: 0.25; }
}
.effect {
  position: relative;
  display: grid;
  place-items: center;
  padding: calc(0.45rem + 0.38em) 0.9rem;
  overflow: hidden;
  border: 3px solid var(--fx);
  background: var(--bg);
  color: var(--fx);
  font-family: var(--font-pixel);
  font-size: 9px;
  text-transform: uppercase;
  box-shadow: 4px 4px 0 var(--border);
}
.effect-bar {
  position: absolute;
  inset: auto 0 0 0;
  height: 4px;
  background: var(--fx);
  transform-origin: left;
  transition: transform 0.15s steps(2);
}
.round.open { background: var(--sky); color: var(--ink); }
.mult { color: var(--sage); }

.hearts {
  display: flex;
  gap: 4px;
  animation: hurt 0.4s steps(4) both;
}
.hearts svg { display: block; }
.hearts.low svg { animation: blink-text 0.5s steps(1) infinite; }
@keyframes hurt {
  0% { transform: translateX(-4px); }
  25% { transform: translateX(4px); }
  50% { transform: translateX(-3px); }
  100% { transform: none; }
}
.mult.doubled { color: var(--sun); }

/* ─── Menu ─── */
.menu-wrap { position: relative; }
.menu {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  z-index: 20;
  display: grid;
  min-width: 14rem;
  padding: 6px;
  background: var(--bg);
  border: 3px solid var(--sky);
  box-shadow: 6px 6px 0 var(--border);
  transform-origin: top right;
  animation: pop-in 0.16s var(--ease-out) both;
}
.menu-item {
  display: grid;
  grid-template-columns: 18px 1fr auto auto;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 0;
  background: none;
  color: var(--text);
  font-size: 20px;
  text-align: left;
  text-transform: uppercase;
}
.menu-item:hover,
.menu-item:focus-visible {
  outline: none;
  background: var(--sky);
  color: var(--ink);
}
.menu-item .state {
  font-family: var(--font-pixel);
  font-size: 9px;
  color: var(--text-muted);
}
.menu-item .state.on { color: var(--sage); }
.menu-item:hover .state,
.menu-item:focus-visible .state { color: var(--ink); }

@media (pointer: coarse) {
  .hide-touch { display: none; }
  /* The pad has its own play/pause in the middle. */
  .round { width: 40px; height: 40px; }
}
.show-wide { display: none; }
@media (min-width: 1400px) {
  .show-wide { display: inline; }
}
/* Narrower desktops: drop best and level first, then the labels, then put the slots on a row of their own. */
@media (max-width: 1180px) {
  .hide-md { display: none; }
}
@media (max-width: 900px) {
  .chip .chrome-label { display: none; }
}
@media (max-width: 860px) {
  .hud-grid { grid-template-columns: 1fr auto; }
  .hud-grid .hud-center { grid-row: 2; grid-column: 1 / -1; justify-self: center; }
}
@media (max-width: 520px) {
  .stat b { font-size: 11px; }
}
@media (max-width: 520px) {
  .chip { gap: 10px; padding: 6px 12px; }
}

/* ─── Phones (sideways): the board fills the height; the HUD lives in the
   side gutters, in the desktop's chips turned on end. Left: hearts at the
   top, score and multiplier at the bottom. Right: pause and the menu, one
   above the other. Everything a size down. ─── */
.hud-phone {
  top: calc(6px + env(safe-area-inset-top));
  bottom: calc(6px + env(safe-area-inset-bottom));
  /* Right against the screen's edges. */
  left: env(safe-area-inset-left);
  right: env(safe-area-inset-right);
  display: flex;
  justify-content: space-between;
}
.hud-phone .hud-left { flex-direction: column; flex-wrap: nowrap; align-items: stretch; width: 40px; height: 100%; }
.hud-phone .hud-left { pointer-events: none; }
/* The chip itself is just a column; its two parts are the chips. */
.hud-phone .chip {
  flex: 1;
  flex-direction: column;
  justify-content: space-between;
  align-items: stretch;
  padding: 0;
  border: 0;
  background: none;
  box-shadow: none;
}
.hud-phone .chip .divider { display: none; }
.hud-phone .part {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 6px 2px;
  border: 2px solid var(--sky);
  background: var(--bg);
  box-shadow: 3px 3px 0 var(--border);
  pointer-events: auto;
}
.hud-phone .hearts { flex-direction: column; align-items: center; gap: 3px; }
.hud-phone .hearts svg { width: 12px; height: 11px; }
.hud-phone .cheat-tag,
.hud-phone .hc-tag { align-self: center; margin: 6px 0; padding: 4px 2px; font-size: 10px; writing-mode: vertical-rl; pointer-events: auto; }
.hud-phone .stat { flex-direction: column; gap: 3px; }
.hud-phone .num { text-align: center; }
.hud-phone .stat .chrome-label { display: block; font-size: 10px; }
.hud-phone .stat b { font-size: 8px; }
.hud-phone .score-num { min-width: 0; }
.hud-phone .effects {
  position: fixed;
  top: calc(8px + env(safe-area-inset-top));
  left: calc(52px + env(safe-area-inset-left));
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  zoom: 0.8;
}
.hud-phone .hud-right { flex-direction: column; align-items: flex-end; width: 40px; gap: 6px; }
.hud-phone .round { width: 36px; height: 36px; border-width: 2px; box-shadow: 3px 3px 0 var(--border); }
/* The menu opens to the left of the buttons, a size down, and scrolls if the screen is short. */
.hud-phone .menu {
  top: 0;
  right: calc(100% + 8px);
  max-height: calc(100vh - 20px);
  overflow: auto;
  zoom: 0.7;
}
.hud-phone .menu-item { padding-block: 6px; }
</style>
