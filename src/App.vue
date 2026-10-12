<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import Board from './components/Board.vue'
import { musicOn, muted } from './audio'
import { effectLeft, fitGrid, isActive, pause, play, reset, state, toggle, turn, type DirName } from './game'

const EFFECTS = [
  { key: 'shield', label: 'shield', color: 'var(--sky)' },
  { key: 'double', label: '×2', color: 'var(--sun)' },
  { key: 'slow', label: 'slow-mo', color: 'var(--lavender)' },
] as const

const KEYMAP: Record<string, DirName> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right',
  W: 'up', S: 'down', A: 'left', D: 'right',
}

function toggleMute() {
  muted.value = !muted.value
}
function toggleMusic() {
  musicOn.value = !musicOn.value
}

function onKey(event: KeyboardEvent) {
  if (event.metaKey || event.ctrlKey || event.altKey) return
  const dir = KEYMAP[event.key]
  if (dir) {
    event.preventDefault()
    turn(dir)
  } else if (event.key === ' ' || event.key === 'Enter') {
    event.preventDefault()
    toggle()
  } else if (event.key === 'Escape' || event.key === 'p' || event.key === 'P') {
    pause()
  } else if (event.key === 'r' || event.key === 'R') {
    reset()
  } else if (event.key === 'm' || event.key === 'M') {
    toggleMute()
  } else if (event.key === 'b' || event.key === 'B') {
    toggleMusic()
  }
}

let touchStart: { x: number; y: number } | null = null
function onTouchStart(event: TouchEvent) {
  const touch = event.touches[0]
  if (touch) touchStart = { x: touch.clientX, y: touch.clientY }
}
function onTouchMove(event: TouchEvent) {
  const touch = event.touches[0]
  if (!touch || !touchStart) return
  const dx = touch.clientX - touchStart.x
  const dy = touch.clientY - touchStart.y
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return
  turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up')
  // Keep swiping in one gesture: each 22px is a fresh turn.
  touchStart = { x: touch.clientX, y: touch.clientY }
}

/** The grid follows the window, but only between games. */
function onResize() {
  if (state.status === 'ready') reset()
  else if (state.status === 'over') fitGrid()
}
function onBlur() {
  pause()
}
function onVisibility() {
  if (document.hidden) pause()
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  window.addEventListener('resize', onResize)
  window.addEventListener('blur', onBlur)
  document.addEventListener('visibilitychange', onVisibility)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('blur', onBlur)
  document.removeEventListener('visibilitychange', onVisibility)
})
</script>

<template>
  <div class="screen" @touchstart.passive="onTouchStart" @touchmove.passive="onTouchMove">
    <div class="arena"><Board /></div>

    <!-- HUD -->
    <div class="hud hud-left">
      <div class="chip">
        <span class="brand">Laserwyrm<span class="brand-dot">.</span></span>
        <span class="divider"></span>
        <span class="stat"><span class="chrome-label">score</span><b>{{ state.score }}</b></span>
        <span class="stat"><span class="chrome-label">length</span><b>{{ state.snake.length }}</b></span>
        <span class="stat hide-sm"><span class="chrome-label">best</span><b>{{ state.best }}</b></span>
        <span class="divider hide-sm"></span>
        <span class="stat hide-sm"><span class="chrome-label">level</span><b>{{ state.level + 1 }}</b></span>
        <span class="bpm hide-sm" :style="{ '--beat': `${60 / state.bpm}s` }">
          <span class="bpm-dot" :class="{ live: state.status === 'running' }"></span>{{ state.bpm }} bpm
        </span>
      </div>
      <template v-for="effect in EFFECTS" :key="effect.key">
        <div v-if="isActive(effect.key)" class="effect" :style="{ '--fx': effect.color }">
          <span class="text-trim">{{ effect.label }}</span>
          <span class="effect-bar" :style="{ transform: `scaleX(${effectLeft(effect.key)})` }"></span>
        </div>
      </template>
    </div>
    <div class="hud hud-right">
      <button class="round" :aria-label="state.status === 'running' ? 'Pause' : 'Play'" @click="toggle()">
        <svg v-if="state.status === 'running'" viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
        <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
      </button>
      <button class="round" :class="{ off: !musicOn }" :aria-label="musicOn ? 'Music on' : 'Music off'" title="Music (B)" @click="toggleMusic">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
          <path v-if="!musicOn" d="M3 3l18 18" />
        </svg>
      </button>
      <button class="round" :aria-label="muted ? 'Sound off' : 'Sound on'" title="Sound (M)" @click="toggleMute">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 5 6 9H2v6h4l5 4V5z" />
          <path v-if="muted" d="m22 9-6 6M16 9l6 6" />
          <path v-else d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />
        </svg>
      </button>
    </div>

    <!-- Level up -->
    <div v-if="state.banner" :key="state.banner.id" class="banner">
      <span class="banner-title">{{ state.banner.title }}</span>
      <span class="banner-sub">{{ state.banner.sub }}</span>
    </div>

    <!-- Start -->
    <div v-if="state.status === 'ready'" class="overlay">
      <div class="card">
        <p class="chrome-label">snake, set to the beat · sound on</p>
        <h1>Laserwyrm<span class="brand-dot">.</span></h1>
        <ul class="rules">
          <li>
            <svg viewBox="-0.5 -0.5 1 1" width="28" height="28"><circle cy="0.06" r="0.34" fill="var(--coral)" stroke="var(--text)" stroke-width="0.06" /><path d="M 0.02 -0.26 q 0.12 -0.18 0.3 -0.14 q -0.06 0.2 -0.3 0.14 z" fill="var(--sage)" stroke="var(--text)" stroke-width="0.045" /></svg>
            <span><b>Eat fruit</b> to grow. Apple +1, cherries +3, the spinning star +5. Bonus fruit does not wait long.</span>
          </li>
          <li>
            <svg viewBox="0 0 24 24" width="28" height="28"><defs><pattern id="h" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2.2" height="5" fill="var(--coral)" /></pattern></defs><rect x="1" y="7" width="22" height="10" rx="2" fill="url(#h)" stroke="var(--coral)" stroke-width="2" /></svg>
            <span><b>Lasers</b> fire on the beat. Red stripes mark the line; when the fuse fills, it slices the snake. The head side lives on, the rest pops away and takes its points with it.</span>
          </li>
          <li>
            <svg viewBox="-0.5 -0.5 1 1" width="28" height="28"><g transform="rotate(-35)"><rect x="-0.4" y="-0.18" width="0.8" height="0.36" rx="0.18" fill="var(--bg)" stroke="var(--text)" stroke-width="0.05" /><path d="M 0 -0.18 L -0.22 -0.18 A 0.18 0.18 0 0 0 -0.22 0.18 L 0 0.18 Z" fill="var(--sky)" stroke="var(--text)" stroke-width="0.05" /></g></svg>
            <span><b>Pills</b>: <span class="ink-sky">blue</span> shields the next laser, <span class="ink-sun">yellow</span> doubles points, <span class="ink-lav">purple</span> is slow-mo.</span>
          </li>
          <li>
            <svg viewBox="-0.6 -0.6 1.2 1.2" width="28" height="28"><ellipse cx="-0.08" cy="0" rx="0.3" ry="0.32" fill="var(--lavender)" stroke="var(--text)" stroke-width="0.07" /><path d="M 0.18 -0.12 Q 0.48 -0.2 0.5 0.02 Q 0.36 -0.06 0.22 -0.02 Z M 0.18 0.12 Q 0.48 0.2 0.5 -0.02 Q 0.36 0.06 0.22 0.02 Z" fill="var(--coral)" stroke="var(--text)" stroke-width="0.05" /></svg>
            <span><b>The snipper</b> hunts your middle. Bite it for +3, or lure it under a laser.</span>
          </li>
        </ul>
        <p class="note">Every 8 bars the beat speeds up and more lasers come. Only walls and your own tail end the game.</p>
        <button class="btn" @click="play()"><span class="text-trim">Play</span></button>
        <p class="keys hide-touch">
          <kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> or <kbd>WASD</kbd> to move · <kbd>Space</kbd> pause · <kbd>B</kbd> music · <kbd>M</kbd> sound
        </p>
        <p class="keys show-touch">Swipe anywhere to steer.</p>
      </div>
    </div>

    <!-- Paused -->
    <div v-else-if="state.status === 'paused'" class="overlay">
      <div class="card card-small">
        <p class="chrome-label">paused</p>
        <h2>Take a breath</h2>
        <button class="btn" @click="play()"><span class="text-trim">Resume</span></button>
        <button class="btn btn-line" @click="reset()"><span class="text-trim">Restart</span></button>
      </div>
    </div>

    <!-- Game over -->
    <div v-else-if="state.status === 'over'" class="overlay">
      <div class="card card-small">
        <span class="badge">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </span>
        <h2>Game over</h2>
        <p class="dim">The snake {{ state.reason }}.</p>
        <div class="tally">
          <div><span class="chrome-label">score</span><b>{{ state.score }}</b></div>
          <div><span class="chrome-label">best</span><b>{{ state.best }}</b></div>
          <div><span class="chrome-label">longest</span><b>{{ state.longest }}</b></div>
          <div><span class="chrome-label">fruit</span><b>{{ state.stats.eaten }}</b></div>
          <div><span class="chrome-label">cuts</span><b>{{ state.stats.cuts }}</b></div>
          <div><span class="chrome-label">cells lost</span><b>{{ state.stats.lost }}</b></div>
          <div><span class="chrome-label">level</span><b>{{ state.level + 1 }}</b></div>
          <div><span class="chrome-label">blocked</span><b>{{ state.stats.blocked }}</b></div>
          <div><span class="chrome-label">snippers</span><b>{{ state.stats.snippers }}</b></div>
        </div>
        <button class="btn" @click="play()"><span class="text-trim">Play again</span></button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.screen {
  position: fixed;
  inset: 0;
  background: var(--bg-off);
  touch-action: none;
  overflow: hidden;
}

/* The board keeps clear of the HUD, so nothing hides under it. */
.arena {
  position: absolute;
  inset: 72px 12px 12px;
}

/* ─── HUD ─── */
.hud {
  position: absolute;
  top: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  pointer-events: none;
}
.hud > * { pointer-events: auto; }
.hud-left { left: 14px; }
.hud-right { right: 14px; }
.chip {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 18px;
  background: var(--bg);
  border: 2px solid var(--text);
  border-radius: 999px;
}
.brand {
  font-size: 18px;
  font-weight: 900;
  letter-spacing: -0.03em;
}
.brand-dot { color: var(--mint); }
.divider {
  width: 2px;
  height: 22px;
  background: var(--border);
}
.stat {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.stat .chrome-label { font-size: 9px; }
.stat b {
  font-size: 18px;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
}
.round {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 999px;
  border: 2px solid var(--text);
  background: var(--bg);
}
.round:hover { background: var(--bg-off); }

/* ─── Overlays ─── */
.overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(245, 245, 240, 0.6);
}
.card {
  width: min(30rem, 100%);
  max-height: calc(100vh - 32px);
  overflow: auto;
  padding: 2rem;
  background: var(--bg);
  border: 2px solid var(--text);
  border-radius: 1.5rem;
  animation: pop-in 0.4s var(--ease-out) both;
}
.card-small { width: min(24rem, 100%); }
.card h1 {
  margin: 0.4rem 0 1.25rem;
  font-size: clamp(2.6rem, 8vw, 3.75rem);
  font-weight: 900;
  letter-spacing: -0.045em;
  line-height: 1;
}
.card h2 {
  margin: 0.6rem 0 0.4rem;
  font-size: 1.75rem;
  font-weight: 900;
  letter-spacing: -0.02em;
}
.rules {
  margin: 0 0 1.5rem;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.9rem;
}
.rules li {
  display: grid;
  grid-template-columns: 28px 1fr;
  gap: 0.9rem;
  align-items: start;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-dim);
}
.rules b { color: var(--text); }
.btn {
  display: grid;
  place-items: center;
  width: 100%;
  padding: calc(0.6rem + 0.38em) 1.25rem;
  border-radius: 999px;
  border: 2px solid var(--text);
  background: var(--text);
  color: #fff;
  font-size: 0.9rem;
  font-weight: 800;
}
.btn:hover { background: #333; }
.btn + .btn { margin-top: 0.5rem; }
.btn-line { background: var(--bg); color: var(--text); }
.btn-line:hover { background: var(--bg-off); }
.btn:focus-visible,
.round:focus-visible {
  outline: 3px solid var(--sky);
  outline-offset: 2px;
}
.card-small .btn:first-of-type { margin-top: 1.25rem; }
.keys {
  margin: 1rem 0 0;
  font-size: 11px;
  line-height: 2.2;
  color: var(--text-muted);
  text-align: center;
}
.keys kbd { margin-right: 2px; }
.dim {
  margin: 0;
  font-size: 13px;
  color: var(--text-dim);
}
.badge {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 999px;
  background: var(--coral);
  color: #fff;
}
.tally {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
  margin-top: 1.25rem;
}
.tally div {
  display: grid;
  gap: 0.3rem;
  padding: 0.6rem 0.7rem;
  background: var(--bg-off);
  border: 2px solid var(--border);
  border-radius: 0.75rem;
}
.tally .chrome-label { font-size: 9px; }
.tally b { font-size: 1.25rem; font-weight: 900; }

/* ─── HUD extras ─── */
.bpm {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
}
.bpm-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
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
  border: 2px solid var(--text);
  border-radius: 999px;
  background: var(--bg);
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  animation: pop-in 0.3s var(--ease-out) both;
}
.effect-bar {
  position: absolute;
  inset: auto 0 0 0;
  height: 4px;
  background: var(--fx);
  transform-origin: left;
  transition: transform 0.15s linear;
}
.round.off { color: var(--text-muted); border-color: var(--border); }

.banner {
  position: absolute;
  top: 38%;
  left: 50%;
  display: grid;
  justify-items: center;
  gap: 0.5rem;
  pointer-events: none;
  translate: -50% -50%;
  animation: banner 1.8s var(--ease-out) both;
}
.banner-title {
  padding: 0.6rem 1.6rem;
  border: 2px solid var(--text);
  border-radius: 999px;
  background: var(--sun);
  font-size: clamp(1.8rem, 5vw, 3rem);
  font-weight: 900;
  letter-spacing: -0.03em;
}
.banner-sub {
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--text);
}
@keyframes banner {
  0% { opacity: 0; transform: scale(0.7); }
  15% { opacity: 1; transform: scale(1.05); }
  25% { transform: scale(1); }
  80% { opacity: 1; }
  100% { opacity: 0; transform: translateY(-20px); }
}
.note {
  margin: -0.5rem 0 1.25rem;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-muted);
}
.ink-sky { color: #3D8FE0; font-weight: 700; }
.ink-sun { color: #C99700; font-weight: 700; }
.ink-lav { color: #7A70F0; font-weight: 700; }

.show-touch { display: none; }
@media (pointer: coarse) {
  .hide-touch { display: none; }
  .show-touch { display: block; }
}
@media (max-width: 520px) {
  .hide-sm { display: none; }
  .chip { gap: 10px; padding: 6px 14px; }
  .card { padding: 1.4rem; }
}
</style>
