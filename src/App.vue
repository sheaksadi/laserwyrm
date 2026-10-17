<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Board from './components/Board.vue'
import { musicOn, muted } from './audio'
import { effectLeft, fitGrid, fitLayout, HEART_PATH, isActive, lastReplay, layout, multiplier, pause, play, POWER_KINDS, POWERS, replay, reset, START_HEARTS, state, toggle, TONE_COLOR, TOTEM, turn, useItem, type DirName } from './game'
import { canFullscreen, enterFullscreen, fullscreenOn, isFullscreen, leaveFullscreen, watchFullscreen } from './fullscreen'
import { pad, rumble, startGamepad, stopGamepad } from './gamepad'
import { fetchScore, placesOnBoard, submitScore as sendScore } from './api'
import { player, seekBy, stopWatching, togglePlay, watch as watchRun } from './replayPlayer'
import CheatMenu from './components/CheatMenu.vue'
import HeldPills from './components/HeldPills.vue'
import Leaderboard from './components/Leaderboard.vue'
import ReplayViewer from './components/ReplayViewer.vue'
import PadGlyph from './components/PadGlyph.vue'
import PowerIcon from './components/PowerIcon.vue'
import TouchPad from './components/TouchPad.vue'

/** Power-ups that last a while get a countdown tag in the HUD; Dash is instant. */
const EFFECTS = (['shield', 'double', 'slow', 'magnet', 'ghost'] as const).map((key) => ({
  key,
  label: POWERS[key].name,
  color: TONE_COLOR[POWERS[key].tone],
}))

const KEYMAP: Record<string, DirName> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right',
  W: 'up', S: 'down', A: 'left', D: 'right',
}

/** Three slots, more once a heart drop takes you past three; empty ones show what is lost. */
const heartSlots = computed(() => Array.from({ length: Math.max(START_HEARTS, state.hearts) }, (_, i) => i < state.hearts))

/** On touch screens the cards stop short of the pad, so the pad stays usable. */
const overlayStyle = computed(() =>
  layout.pad === 'bottom' ? { bottom: `${layout.bottom}px` } : layout.pad === 'side' ? { right: `${layout.right}px` } : {},
)

function toggleMute() {
  muted.value = !muted.value
}
function toggleMusic() {
  musicOn.value = !musicOn.value
}

/** The hamburger menu on the right holds music, sound and restart. */
const menuOpen = ref(false)
const menu = ref<HTMLElement | null>(null)
function onPointerDown(event: PointerEvent) {
  if (menuOpen.value && !menu.value?.contains(event.target as Node)) menuOpen.value = false
}
function restart() {
  menuOpen.value = false
  reset()
}

/* ─── Pages: the game, the high scores, and watching a run ─── */
type Route = { name: 'game' } | { name: 'scores'; highlight?: number } | { name: 'watch'; id: number }
function parseRoute(): Route {
  const hash = location.hash
  const watching = hash.match(/^#\/watch\/(\d+)/)
  if (watching) return { name: 'watch', id: Number(watching[1]) }
  const scores = hash.match(/^#\/scores(?:\/(\d+))?/)
  if (scores) return { name: 'scores', highlight: scores[1] ? Number(scores[1]) : undefined }
  return { name: 'game' }
}
const route = ref<Route>(parseRoute())
const go = (hash: string) => {
  location.hash = hash
}
const watchError = ref('')
async function onRoute() {
  const next = parseRoute()
  const was = route.value
  route.value = next
  if (was.name === 'watch' && next.name !== 'watch') stopWatching()
  if (next.name !== 'game') {
    menuOpen.value = false
    cheatOpen.value = false
    pause()
  }
  if (next.name === 'watch') {
    watchError.value = ''
    try {
      const entry = await fetchScore(next.id)
      if (route.value.name === 'watch' && route.value.id === next.id) watchRun(entry.replay, entry)
    } catch (err) {
      watchError.value = err instanceof Error ? err.message : String(err)
    }
  }
}

/* ─── High-score entry ─── */
const entryName = ref('')
const entryEmail = ref('')
/** Whether this run makes the board, then how sending it went. */
const entry = ref<{ phase: 'checking' | 'open' | 'none' | 'sending' | 'saved' | 'failed'; rank?: number; id?: number; error?: string }>({ phase: 'none' })
watch(
  () => state.status,
  async (status) => {
    if (status !== 'over' || replay.active) return
    entry.value = { phase: 'checking' }
    const places = !state.cheated && (await placesOnBoard(state.score))
    if (state.status === 'over') entry.value = { phase: places ? 'open' : 'none' }
  },
)
async function submitScore() {
  const name = entryName.value.trim()
  if (!name) return
  entry.value = { phase: 'sending' }
  try {
    const saved = await sendScore({ name, email: entryEmail.value.trim(), score: state.score, level: state.level + 1, replay: lastReplay() })
    entry.value = { phase: 'saved', rank: saved.rank, id: saved.id }
  } catch (err) {
    entry.value = { phase: 'failed', error: err instanceof Error ? err.message : String(err) }
  }
}

/** The cheat menu: C opens it and pauses; C or Escape closes it, still paused. */
const cheatOpen = ref(false)
function toggleCheats() {
  cheatOpen.value = !cheatOpen.value
  if (cheatOpen.value) {
    menuOpen.value = false
    pause()
  }
}

function onKey(event: KeyboardEvent) {
  if (event.metaKey || event.ctrlKey || event.altKey) return
  // Typing a name is not steering.
  if (event.target instanceof HTMLInputElement && event.target.type !== 'range') return
  if (route.value.name === 'watch') {
    // Watching: Space plays and pauses, arrows jump, Esc goes back to the board.
    if (event.key === ' ' || event.key === 'k') togglePlay()
    else if (event.key === 'ArrowLeft' || event.key === 'j') seekBy(-36)
    else if (event.key === 'ArrowRight' || event.key === 'l') seekBy(36)
    else if (event.key === 'Escape') go('#/scores')
    else return
    event.preventDefault()
    return
  }
  if (route.value.name === 'scores') {
    if (event.key === 'Escape') go('#/')
    return
  }
  if (event.key === 'c' || event.key === 'C') return toggleCheats()
  if (cheatOpen.value) {
    if (event.key === 'Escape') cheatOpen.value = false
    return
  }
  const dir = KEYMAP[event.key]
  if (dir) {
    event.preventDefault()
    turn(dir)
  } else if (event.key === ' ') {
    // Mid-game Space uses a held pill; otherwise it starts or resumes.
    event.preventDefault()
    if (state.status === 'running') useItem()
    else toggle()
  } else if (event.key === 'Enter') {
    event.preventDefault()
    toggle()
  } else if (event.key === 'Escape' && state.status !== 'running' && !menuOpen.value) {
    // Mid-game Esc pauses; on the pause screen it leaves full screen.
    leaveFullscreen()
  } else if (event.key === 'Escape' || event.key === 'p' || event.key === 'P') {
    menuOpen.value = false
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
  // The pad moves with the window (turning the phone); the grid only between games.
  fitLayout()
  if (state.status === 'ready') reset()
  else if (state.status === 'over') fitGrid()
}
function onBlur() {
  pause()
}
function onVisibility() {
  if (document.hidden) pause()
}

/* ─── Controller ─── */
const typing = () => document.activeElement instanceof HTMLInputElement
const padHandlers = {
  turn: (dir: DirName) => {
    if (route.value.name === 'watch' && (dir === 'left' || dir === 'right')) seekBy(dir === 'left' ? -36 : 36)
    else if (route.value.name === 'game' && !cheatOpen.value) turn(dir)
  },
  primary: () => {
    if (route.value.name === 'watch') return togglePlay()
    if (route.value.name === 'scores') return go('#/')
    if (cheatOpen.value || typing()) return
    if (state.status === 'running') useItem()
    else play()
  },
  start: () => {
    if (cheatOpen.value) cheatOpen.value = false
    else toggle()
  },
  back: () => {
    if (route.value.name === 'game') toggleCheats()
  },
  cancel: () => {
    if (route.value.name === 'watch') return go('#/scores')
    if (route.value.name === 'scores') return go('#/')
    cheatOpen.value = false
    menuOpen.value = false
  },
}
// Every hit and every death buzzes the controller.
watch(
  () => state.shake,
  () => {
    if (pad.connected && !replay.active) rumble(state.status === 'over' ? 260 : 120)
  },
)
/* ─── Full screen ─── */
// Playing goes full screen and stays there; the pause screen is the way out.
watch(
  () => state.status,
  (status) => {
    if (status === 'running' && !replay.active) enterFullscreen()
  },
)
function toggleFullscreen() {
  if (isFullscreen.value) leaveFullscreen()
  else enterFullscreen(true)
}
/** How to get out, for a few seconds after going in. */
const fsHint = ref(false)
let fsHintTimer = 0
let stopFullscreenWatch = () => {}

/** "Controller connected" shows briefly each time one joins. */
const padToast = ref(false)
let padToastTimer = 0
watch(
  () => pad.joined,
  () => {
    padToast.value = true
    clearTimeout(padToastTimer)
    padToastTimer = window.setTimeout(() => (padToast.value = false), 2200)
  },
)

onMounted(() => {
  window.addEventListener('hashchange', onRoute)
  if (route.value.name !== 'game') void onRoute()
  startGamepad(padHandlers)
  stopFullscreenWatch = watchFullscreen(
    () => {
      fsHint.value = true
      clearTimeout(fsHintTimer)
      fsHintTimer = window.setTimeout(() => (fsHint.value = false), 3500)
    },
    () => {
      fsHint.value = false
      // Esc in the browser drops full screen without telling the game: pause with it.
      pause()
    },
  )
  window.addEventListener('keydown', onKey)
  window.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('resize', onResize)
  window.addEventListener('blur', onBlur)
  document.addEventListener('visibilitychange', onVisibility)
})
onBeforeUnmount(() => {
  window.removeEventListener('hashchange', onRoute)
  stopGamepad()
  stopFullscreenWatch()
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('pointerdown', onPointerDown)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('blur', onBlur)
  document.removeEventListener('visibilitychange', onVisibility)
})
</script>

<template>
  <div class="screen" @touchstart.passive="onTouchStart" @touchmove.passive="onTouchMove">
    <div
      class="arena"
      :style="{ top: `${layout.top}px`, right: `${layout.right}px`, bottom: `${layout.bottom}px`, left: `${layout.left}px` }"
    ><Board /></div>
    <TouchPad v-if="layout.pad !== 'none' && route.name !== 'watch'" :placement="layout.pad" />
    <!-- On touch screens the pill slots sit by the pad, like an arcade action button. -->
    <HeldPills v-if="layout.pad !== 'none' && route.name !== 'watch'" class="by-pad" :class="layout.pad" />

    <!-- HUD: stats on the left, held power-ups in the middle, level and buttons on the right.
         Every number sits in a fixed-width box, so nothing shifts as it counts. -->
    <div class="hud" :class="layout.pad === 'none' ? 'hud-grid' : 'hud-flex'">
      <div class="hud-left">
        <div class="chip">
          <span class="brand show-wide">Laserwyrm<span class="brand-dot">.</span></span>
          <span class="divider show-wide"></span>
          <span :key="state.hearts" class="hearts" :class="{ low: state.hearts === 1 }" :aria-label="`${state.hearts} hearts`" role="img">
            <svg v-for="(full, i) in heartSlots" :key="i" viewBox="-0.5 -0.5 8 7" width="18" height="16">
              <path :d="HEART_PATH" :fill="full ? 'var(--coral)' : 'none'" :stroke="full ? 'var(--ink)' : 'var(--text-muted)'" stroke-width="1" />
            </svg>
            <svg v-if="state.totem" class="totem-held" viewBox="-0.5 -0.5 1 1" width="18" height="18" :title="TOTEM.name"><PowerIcon kind="totem" /></svg>
          </span>
          <span class="divider"></span>
          <span class="stat"><span class="chrome-label">score</span><b class="num score-num">{{ state.score }}</b></span>
          <span class="stat"><span class="chrome-label">mult</span><b class="num mult-num mult" :class="{ doubled: isActive('double') }">×{{ multiplier() }}</b></span>
          <span v-if="state.cheated" class="cheat-tag" title="Cheats used: this run cannot set a best">cheats</span>
        </div>
        <template v-for="effect in EFFECTS" :key="effect.key">
          <div v-if="isActive(effect.key)" class="effect" :style="{ '--fx': effect.color }">
            <span class="text-trim">{{ effect.label }}</span>
            <span class="effect-bar" :style="{ transform: `scaleX(${effectLeft(effect.key)})` }"></span>
          </div>
        </template>
      </div>
      <div class="hud-center">
        <HeldPills v-if="layout.pad === 'none'" />
      </div>
      <div class="hud-right">
        <div class="chip hide-md">
          <span class="stat"><span class="chrome-label">best</span><b class="num best-num">{{ state.best }}</b></span>
          <span class="divider"></span>
          <span class="stat"><span class="chrome-label">level</span><b class="num level-num">{{ state.level + 1 }}</b></span>
          <span class="bpm" :style="{ '--beat': `${60 / state.bpm}s` }">
            <span class="bpm-dot" :class="{ live: state.status === 'running' }"></span>{{ state.bpm }} bpm
          </span>
        </div>
        <button class="round hide-touch-grid" :aria-label="state.status === 'running' ? 'Pause' : 'Play'" @click="toggle()">
          <svg v-if="state.status === 'running'" viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
          <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
        </button>
        <div ref="menu" class="menu-wrap">
          <button class="round" :class="{ open: menuOpen }" aria-label="Menu" aria-haspopup="menu" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="3" y="5" width="18" height="3" /><rect x="3" y="11" width="18" height="3" /><rect x="3" y="17" width="18" height="3" /></svg>
          </button>
          <div v-if="menuOpen" class="menu" role="menu">
            <button class="menu-item" role="menuitemcheckbox" :aria-checked="musicOn" @click="toggleMusic">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                <path v-if="!musicOn" d="M3 3l18 18" />
              </svg>
              <span>Music</span><span class="state" :class="{ on: musicOn }">{{ musicOn ? 'on' : 'off' }}</span><kbd class="hide-touch">B</kbd>
            </button>
            <button class="menu-item" role="menuitemcheckbox" :aria-checked="fullscreenOn" @click="fullscreenOn = !fullscreenOn">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><path d="M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6" /></svg>
              <span>Full screen</span><span class="state" :class="{ on: fullscreenOn }">{{ fullscreenOn ? 'on' : 'off' }}</span><span></span>
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
            <button class="menu-item" role="menuitem" @click="menuOpen = false; go('#/scores')">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3" /></svg>
              <span>High scores</span><span></span><span></span>
            </button>
            <button class="menu-item" role="menuitem" @click="toggleCheats">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20 14 10M14 4v3M14 13v3M10 7H7M21 7h-3M17 4l-1.5 1.5M17 10l-1.5-1.5" /></svg>
              <span>Cheats</span><span></span><kbd class="hide-touch">C</kbd>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- What was just picked up or used, and what it does -->
    <div v-if="state.notice && state.status === 'running'" :key="state.notice.id" class="notice" :class="{ touch: layout.pad !== 'none' }">
      <svg viewBox="-0.5 -0.5 1 1" width="30" height="30"><PowerIcon :kind="state.notice.kind" /></svg>
      <span class="notice-text">
        <b>{{ state.notice.title }}</b>
        <span>{{ state.notice.sub }}</span>
      </span>
    </div>

    <!-- Level up -->
    <div v-if="state.banner" :key="state.banner.id" class="banner">
      <span class="banner-title">{{ state.banner.title }}</span>
      <span class="banner-sub">{{ state.banner.sub }}</span>
    </div>

    <!-- High scores -->
    <div v-if="route.name === 'scores'" class="overlay" :style="overlayStyle">
      <Leaderboard :highlight="route.highlight" @close="go('#/')" @watch="(id) => go(`#/watch/${id}`)" />
    </div>

    <!-- Watching a run -->
    <template v-else-if="route.name === 'watch'">
      <ReplayViewer v-if="player.run" @exit="go('#/scores')" />
      <div v-else class="overlay" :style="overlayStyle">
        <div class="card card-small">
          <p class="chrome-label">replay</p>
          <h2>{{ watchError ? 'Not found' : 'Loading…' }}</h2>
          <p v-if="watchError" class="best-line">{{ watchError }}</p>
          <button class="btn btn-line" @click="go('#/scores')"><span class="text-trim">Back to scores</span></button>
        </div>
      </div>
    </template>

    <!-- Cheats -->
    <div v-else-if="cheatOpen" class="overlay" :style="overlayStyle">
      <CheatMenu @close="cheatOpen = false" />
    </div>

    <!-- Start -->
    <div v-else-if="state.status === 'ready'" class="overlay" :style="overlayStyle">
      <div class="card">
        <p class="chrome-label">1 player · snake, set to the beat · sound on</p>
        <h1>Laserwyrm<span class="brand-dot">.</span></h1>
        <ul class="rules">
          <li>
            <svg viewBox="-0.5 -0.5 1 1" width="28" height="28"><circle cy="0.06" r="0.34" fill="var(--coral)" stroke="var(--ink)" stroke-width="0.06" /><path d="M 0.02 -0.26 q 0.12 -0.18 0.3 -0.14 q -0.06 0.2 -0.3 0.14 z" fill="var(--sage)" stroke="var(--ink)" stroke-width="0.045" /></svg>
            <span><b>Grow long.</b> Every beat scores your length, and more per cell the longer you get.</span>
          </li>
          <li>
            <svg viewBox="0 0 24 24" width="28" height="28"><defs><pattern id="h" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2.2" height="5" fill="var(--coral)" /></pattern></defs><rect x="1" y="7" width="22" height="10" rx="2" fill="url(#h)" stroke="var(--coral)" stroke-width="2" /></svg>
            <span><b>Lasers</b> slice your body. Through the head costs a heart.</span>
          </li>
          <li>
            <svg viewBox="-0.5 -0.5 8 7" width="28" height="28"><path :d="HEART_PATH" fill="var(--coral)" stroke="var(--ink)" stroke-width="0.6" /></svg>
            <span><b>3 hearts.</b> Walls and biting yourself end it at once.</span>
          </li>
          <li>
            <svg viewBox="-0.6 -0.6 1.2 1.2" width="28" height="28"><ellipse cx="-0.08" cy="0" rx="0.3" ry="0.32" fill="var(--lavender)" stroke="var(--ink)" stroke-width="0.07" /><path d="M 0.18 -0.12 Q 0.48 -0.2 0.5 0.02 Q 0.36 -0.06 0.22 -0.02 Z M 0.18 0.12 Q 0.48 0.2 0.5 -0.02 Q 0.36 0.06 0.22 0.02 Z" fill="var(--coral)" stroke="var(--ink)" stroke-width="0.05" /></svg>
            <span><b>The snipper</b> cuts your middle. Bite it first.</span>
          </li>
        </ul>
        <p class="powers-title"><b>Power-ups</b> · hold two, <span class="hide-touch">Space</span><span class="show-touch-inline">tap</span> to use</p>
        <ul class="powers">
          <li v-for="kind in POWER_KINDS" :key="kind" :title="POWERS[kind].blurb">
            <svg viewBox="-0.5 -0.5 1 1" width="24" height="24"><PowerIcon :kind="kind" /></svg>
            <span>{{ POWERS[kind].name }}</span>
          </li>
          <li :title="TOTEM.blurb">
            <svg viewBox="-0.5 -0.5 1 1" width="24" height="24"><PowerIcon kind="totem" /></svg>
            <span>Totem</span>
          </li>
        </ul>
        <button class="btn" @click="play()"><span class="text-trim blink">Press start</span></button>
        <button class="btn btn-line" @click="go('#/scores')"><span class="text-trim">High scores</span></button>
        <div v-if="pad.connected" class="keys">
          <span class="keygroup"><PadGlyph button="dpad" /><PadGlyph button="stick" /> move</span>
          <span class="keygroup"><PadGlyph button="a" /><PadGlyph button="rt" /> power-up</span>
          <span class="keygroup"><PadGlyph button="start" /> pause</span>
          <span class="keygroup"><PadGlyph button="back" /> cheats</span>
        </div>
        <div v-else class="keys hide-touch">
          <span class="keygroup">
            <span class="arrows"><kbd class="up">↑</kbd><kbd class="left">←</kbd><kbd class="down">↓</kbd><kbd class="right">→</kbd></span>
            move <span class="alt">or WASD</span>
          </span>
          <span class="keygroup"><kbd class="space">space</kbd> power-up</span>
          <span class="keygroup"><kbd>P</kbd> pause</span>
          <span class="keygroup"><kbd>R</kbd> restart</span>
          <span class="keygroup"><kbd>B</kbd> music</span>
          <span class="keygroup"><kbd>M</kbd> sound</span>
          <span class="keygroup"><kbd>C</kbd> cheats</span>
        </div>
        <p v-if="!pad.connected" class="keys show-touch">Steer with the pad below, or swipe anywhere.</p>
        <p v-if="!pad.connected" class="pad-note">
          <svg viewBox="0 0 24 16" width="24" height="16" aria-hidden="true"><path d="M5 1h14a4 4 0 0 1 4 4l1 7a3 3 0 0 1-5 2l-3-3H8l-3 3a3 3 0 0 1-5-2l1-7a4 4 0 0 1 4-4Z" fill="currentColor" /><path d="M6 5v4M4 7h4" stroke="var(--bg)" stroke-width="1.6" /><circle cx="17" cy="5.5" r="1.1" fill="var(--bg)" /><circle cx="19" cy="8" r="1.1" fill="var(--bg)" /></svg>
          Controller supported · press any button to connect
        </p>
      </div>
    </div>

    <!-- Paused -->
    <div v-else-if="state.status === 'paused'" class="overlay" :style="overlayStyle">
      <div class="card card-small">
        <p class="chrome-label">paused</p>
        <h2>Take a breath</h2>
        <button class="btn" @click="play()"><span class="text-trim">Resume</span></button>
        <button class="btn btn-line" @click="reset()"><span class="text-trim">Restart</span></button>
        <button v-if="canFullscreen()" class="btn btn-line" @click="toggleFullscreen()">
          <span class="text-trim">{{ isFullscreen ? 'Exit full screen' : 'Full screen' }}</span>
        </button>
        <p v-if="isFullscreen && !pad.connected" class="keys"><span class="keygroup"><kbd>Esc</kbd> exit full screen</span></p>
      </div>
    </div>

    <!-- Game over: the score big, everything else quiet -->
    <div v-else-if="state.status === 'over'" class="overlay" :style="overlayStyle">
      <div class="card card-small card-over">
        <p class="over-label">Game over · the snake {{ state.reason }}</p>
        <p class="final-label">score</p>
        <p class="final" :class="{ best: state.newBest }">{{ state.score }}</p>
        <p v-if="state.newBest" class="new-best blink">New best!</p>
        <p v-else class="best-line">best {{ state.best }}<template v-if="state.cheated"> · cheats on, not counted</template></p>

        <!-- A run that makes the board can be signed and sent, replay and all -->
        <template v-if="entry.phase === 'open' || entry.phase === 'sending' || entry.phase === 'failed'">
          <p class="entry-label">You made the high scores</p>
          <form class="entry" @submit.prevent="submitScore">
            <input v-model="entryName" class="field" maxlength="12" placeholder="Name" aria-label="Name" autocomplete="nickname" required autofocus />
            <input v-model="entryEmail" class="field" type="email" maxlength="80" placeholder="Email (optional)" aria-label="Email, optional" autocomplete="email" />
            <button class="btn btn-submit" type="submit" :disabled="entry.phase === 'sending'"><span class="text-trim">{{ entry.phase === 'sending' ? '…' : 'Submit' }}</span></button>
          </form>
          <p v-if="entry.phase === 'failed'" class="entry-error">Could not send: {{ entry.error }}</p>
        </template>
        <p v-else-if="entry.phase === 'saved'" class="entry-done">
          Saved, {{ entryName.trim() }}: #{{ entry.rank }} on the board.
          <a :href="`#/scores/${entry.id}`">See the board</a> · <a :href="`#/watch/${entry.id}`">Watch your run</a>
        </p>

        <dl class="tally">
          <div><dt>longest</dt><dd>{{ state.longest }}</dd></div>
          <div><dt>fruit</dt><dd>{{ state.stats.eaten }}</dd></div>
          <div><dt>level</dt><dd>{{ state.level + 1 }}</dd></div>
          <div><dt>beats</dt><dd>{{ state.beat }}</dd></div>
          <div><dt>cuts</dt><dd>{{ state.stats.cuts }}</dd></div>
          <div><dt>cells lost</dt><dd>{{ state.stats.lost }}</dd></div>
          <div><dt>blocked</dt><dd>{{ state.stats.blocked }}</dd></div>
          <div><dt>snippers</dt><dd>{{ state.stats.snippers }}</dd></div>
        </dl>
        <button class="btn" @click="play()"><span class="text-trim">Play again</span></button>
        <button class="btn btn-line" @click="go('#/scores')"><span class="text-trim">High scores</span></button>
      </div>
    </div>

    <!-- Just went full screen: how to get out -->
    <div v-if="fsHint && state.status === 'running'" class="fs-hint">
      <template v-if="pad.connected"><PadGlyph button="start" /> pause · leave full screen from the pause screen</template>
      <template v-else><kbd>Esc</kbd> pause · <kbd>Esc</kbd> again to leave full screen</template>
    </div>

    <!-- Controller connected -->
    <div v-if="padToast" class="pad-toast">
      <PadGlyph button="a" /> controller connected
    </div>

    <!-- CRT glass: scanlines and a dark vignette over the whole screen -->
    <div class="crt" aria-hidden="true"></div>
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
}

/* ─── CRT ─── */
.crt {
  position: absolute;
  inset: 0;
  z-index: 10;
  pointer-events: none;
  background:
    repeating-linear-gradient(to bottom, rgba(0, 0, 0, 0) 0 2px, rgba(0, 0, 0, 0.22) 2px 3px),
    radial-gradient(ellipse at center, rgba(0, 0, 0, 0) 60%, rgba(0, 0, 0, 0.55) 100%);
  animation: flicker 6s steps(1) infinite;
}
@keyframes flicker {
  0%, 100% { opacity: 1; }
  48% { opacity: 0.88; }
  49% { opacity: 1; }
}

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
/* Touch: the power-ups sit by the pad, so just left and right. */
.hud-flex {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
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
.pad-note {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  margin: 1rem 0 0;
  font-size: 16px;
  text-transform: uppercase;
  color: var(--mint);
  opacity: 0.85;
}
.fs-hint {
  position: absolute;
  /* Above the snake's starting spot, which is the middle. */
  top: 30%;
  left: 50%;
  z-index: 8;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border: 3px solid var(--sky);
  background: var(--bg);
  box-shadow: 4px 4px 0 var(--border);
  font-size: 19px;
  text-transform: uppercase;
  color: var(--text);
  translate: -50% -50%;
  pointer-events: none;
  animation: notice 3.5s steps(16) both;
}
.pad-toast {
  position: absolute;
  bottom: 24px;
  left: 50%;
  z-index: 8;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border: 3px solid var(--mint);
  background: var(--bg);
  box-shadow: 4px 4px 0 var(--border);
  font-size: 18px;
  text-transform: uppercase;
  color: var(--text);
  translate: -50% 0;
  pointer-events: none;
  animation: notice 2.2s steps(12) both;
}
.cheat-tag {
  padding: 2px 6px;
  background: var(--sage);
  color: var(--ink);
  font-size: 15px;
  text-transform: uppercase;
}

/* ─── Notice ─── */
.notice {
  position: absolute;
  top: 84px;
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
.stat {
  display: flex;
  align-items: baseline;
  gap: 8px;
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

/* ─── Overlays ─── */
.overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  /* Clear of the HUD, which stays readable on top. */
  padding: 72px 16px 16px;
  background: rgba(0, 0, 0, 0.7);
}
.card {
  width: min(32rem, 100%);
  max-height: 100%;
  overflow: auto;
  padding: 2rem;
  background: var(--bg);
  border: 3px solid var(--mint);
  box-shadow: 0 0 0 3px var(--ink), 0 0 0 6px var(--lavender), 10px 10px 0 6px var(--ink);
  animation: pop-in 0.3s steps(3) both;
}
.card-small { width: min(24rem, 100%); }
.card h1 {
  margin: 0.8rem 0 1.5rem;
  font-family: var(--font-pixel);
  font-size: clamp(1.4rem, 6vw, 2.4rem);
  font-weight: 400;
  line-height: 1.1;
  text-transform: uppercase;
  color: var(--sun);
  text-shadow: 3px 3px 0 var(--coral), 6px 6px 0 var(--lavender);
}
.card h2 {
  margin: 0.8rem 0 0.6rem;
  font-family: var(--font-pixel);
  font-size: 1.15rem;
  font-weight: 400;
  line-height: 1.3;
  text-transform: uppercase;
  color: var(--mint);
  text-shadow: 3px 3px 0 var(--ink);
}
.card h2.over { color: var(--coral); }
.rules {
  margin: 0 0 1.5rem;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.8rem;
}
.rules li {
  display: grid;
  grid-template-columns: 28px 1fr;
  gap: 0.9rem;
  align-items: start;
  font-size: 19px;
  line-height: 1.15;
  color: var(--text-dim);
}
.rules b { color: var(--sun); font-weight: 400; }
.btn {
  display: grid;
  place-items: center;
  width: 100%;
  padding: calc(0.7rem + 0.38em) 1.25rem;
  border: 3px solid var(--ink);
  background: var(--coral);
  color: var(--text);
  box-shadow: inset -4px -4px 0 rgba(0, 0, 0, 0.3), inset 4px 4px 0 rgba(255, 255, 255, 0.25), 4px 4px 0 var(--ink);
  font-family: var(--font-pixel);
  font-size: 0.7rem;
  text-transform: uppercase;
  text-shadow: 2px 2px 0 var(--ink);
}
.btn:hover { background: #FF5571; }
.btn:active { transform: translate(4px, 4px); box-shadow: inset -4px -4px 0 rgba(0, 0, 0, 0.3); }
.btn + .btn { margin-top: 0.75rem; }
.btn-line { background: var(--bg-warm); color: var(--text-dim); }
.btn-line:hover { background: var(--border); }
.btn:focus-visible,
.round:focus-visible {
  outline: 3px solid var(--sun);
  outline-offset: 3px;
}
.blink { animation: blink-text 1.1s steps(1) infinite; }
.card-small .btn:first-of-type { margin-top: 1.25rem; }
.keys {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: flex-end;
  gap: 10px 18px;
  margin: 1.1rem 0 0;
  font-size: 16px;
  text-transform: uppercase;
  color: var(--text-muted);
}
.keygroup { display: flex; align-items: center; gap: 6px; }
.keys .alt { opacity: 0.7; }
/* Arrow keys as an inverted T, like on a keyboard. */
.arrows {
  display: grid;
  grid-template-columns: repeat(3, auto);
  gap: 3px;
}
.arrows .up { grid-area: 1 / 2; }
.arrows .left { grid-area: 2 / 1; }
.arrows .down { grid-area: 2 / 2; }
.arrows .right { grid-area: 2 / 3; }
.keys kbd.space { min-width: 5.5em; }
/* ─── Game over ─── */
.card-over { text-align: center; }
.over-label {
  margin: 0;
  font-size: 17px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--coral);
  opacity: 0.85;
}
.final-label {
  margin: 1.1rem 0 0.4rem;
  font-size: 16px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-muted);
}
.final {
  margin: 0;
  font-family: var(--font-pixel);
  font-size: clamp(2rem, 9vw, 3rem);
  line-height: 1.1;
  color: var(--text);
  text-shadow: 4px 4px 0 var(--lavender);
  overflow-wrap: anywhere;
}
.final.best { color: var(--sun); text-shadow: 4px 4px 0 var(--coral); }
.new-best {
  margin: 0.7rem 0 0;
  font-family: var(--font-pixel);
  font-size: 10px;
  text-transform: uppercase;
  color: var(--sun);
}
.best-line {
  margin: 0.6rem 0 0;
  font-size: 17px;
  text-transform: uppercase;
  color: var(--text-muted);
}
/* Name and email stacked, submit on the side. */
.entry {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  margin-top: 1.1rem;
  text-align: left;
}
.field {
  grid-column: 1;
  min-width: 0;
  padding: 8px 10px;
  border: 2px solid var(--text-muted);
  background: var(--bg-off);
  color: var(--text);
  font: inherit;
  font-size: 20px;
}
.field::placeholder { color: var(--text-muted); text-transform: uppercase; }
.field:focus { outline: none; border-color: var(--sun); }
.btn.btn-submit {
  grid-column: 2;
  grid-row: 1 / span 2;
  width: auto;
  padding: 0 1rem;
  background: var(--sky);
  font-size: 0.6rem;
}
.btn.btn-submit:hover { background: #6BBEFF; }
.entry-label {
  margin: 1.1rem 0 0;
  font-size: 17px;
  text-transform: uppercase;
  color: var(--sage);
}
.entry-error { margin: 0.6rem 0 0; font-size: 17px; color: var(--coral); }
.entry-done a { color: var(--sky); }
.entry-done {
  margin: 1.1rem 0 0;
  font-size: 18px;
  color: var(--sage);
}
/* The small print: quiet, compact, there if you look. */
.tally {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px 8px;
  margin: 1.4rem 0 1.4rem;
  padding: 10px 0 0;
  border-top: 2px dashed var(--border);
  opacity: 0.8;
}
.tally div { display: grid; gap: 2px; }
.tally dt {
  font-size: 14px;
  text-transform: uppercase;
  color: var(--text-muted);
}
.tally dd {
  margin: 0;
  font-size: 18px;
  color: var(--text-dim);
}

/* ─── Power-up row on the start card ─── */
.powers-title {
  margin: 0 0 0.5rem;
  font-size: 17px;
  color: var(--text-dim);
}
.powers-title b { font-weight: 400; color: var(--sun); }
.powers {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
  gap: 8px;
  margin: 0 0 1.4rem;
  padding: 0;
  list-style: none;
}
.powers li {
  display: grid;
  justify-items: center;
  gap: 4px;
  font-size: 14px;
  text-transform: uppercase;
  color: var(--text-muted);
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
  animation: pop-in 0.3s steps(3) both;
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
.by-pad { position: absolute; z-index: 5; }
.by-pad.bottom { left: 16px; bottom: calc(24px + env(safe-area-inset-bottom)); }
.by-pad.side { right: calc(16px + env(safe-area-inset-right)); bottom: calc(16px + env(safe-area-inset-bottom)); }
.show-touch-inline { display: none; }
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
  animation: pop-in 0.2s steps(2) both;
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
@keyframes banner {
  0% { opacity: 0; transform: scale(0.7); }
  15% { opacity: 1; transform: scale(1.05); }
  25% { transform: scale(1); }
  80% { opacity: 1; }
  100% { opacity: 0; transform: translateY(-20px); }
}
.note {
  margin: -0.5rem 0 1.25rem;
  font-size: 17px;
  line-height: 1.2;
  color: var(--text-muted);
}
.ink-sky { color: var(--sky); }
.ink-sun { color: var(--sun); }
.ink-lav { color: var(--lavender); }

.show-touch { display: none; }
@media (pointer: coarse) {
  .hide-touch { display: none; }
  /* The pad has its own play/pause in the middle. */
  .hide-touch-grid { display: none; }
  .round { width: 40px; height: 40px; }
  .rules li { font-size: 17px; line-height: 1.1; }
  .rules { gap: 0.6rem; margin-bottom: 1rem; }
  .note { font-size: 15px; }
  .card h1 { margin-bottom: 1rem; }
  .show-touch { display: block; }
  .show-touch-inline { display: inline; }
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
  .tally { grid-template-columns: repeat(4, 1fr); }
  .tally dt { font-size: 12px; }
  .entry { grid-template-columns: 1fr; }
  .btn.btn-submit { grid-column: 1; grid-row: auto; padding: 0.8rem; }
}
@media (max-height: 500px) {
  .card { padding: 1.1rem 1.4rem; }
  .card h1 { font-size: 1.3rem; margin-bottom: 0.8rem; }
  .card h2 { font-size: 0.9rem; margin-top: 0.4rem; }
}
@media (max-width: 520px) {
  .chip { gap: 10px; padding: 6px 12px; }
  .card { padding: 1.4rem; }
}
</style>
