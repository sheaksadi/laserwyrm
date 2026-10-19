<script setup lang="ts">
/**
 * The app shell: the board, the HUD, and one panel or card at a time over
 * them, picked by the page (src/app/route.ts) and what is open
 * (src/app/ui.ts). Input lives in src/app/input.ts, saving finished games in
 * src/app/scoreEntry.ts.
 */
import { defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Board from './components/Board.vue'
import CanvasBoard from './components/CanvasBoard.vue'
import { renderer } from './renderer'
import { soundBlocked } from './audio'
import { fitGrid, fitLayout, layout, demo, match, startDemo, stopDemo, onFeel, pause, replay, reset, state } from './game'
import { enterFullscreen, fullscreenPending, watchFullscreen } from './fullscreen'
import { pad, rumbleFor, startGamepad, stopGamepad } from './gamepad'
import { player } from './replayPlayer'
import { custom } from './design'
import { navFocusFirst } from './menuNav'
import { mp } from './multiplayer'
import { go, onRoute, route, watchError } from './app/route'
import { begin, closeBriefing, leaveMatch, openEditor, openMultiplayer, playCustom, playNormal, splash, SPLASHES, status, ui } from './app/ui'
import { onKey, onTouchMove, onTouchStart, padHandlers } from './app/input'
import { watchGameOver } from './app/scoreEntry'
import Briefing from './components/Briefing.vue'
import MpResults from './components/MpResults.vue'
import AccountPanel from './components/AccountPanel.vue'
import HudBar from './components/HudBar.vue'
import PlayNotices from './components/PlayNotices.vue'
import StartCard from './components/StartCard.vue'
import PauseCard from './components/PauseCard.vue'
import GameOverCard from './components/GameOverCard.vue'
import Leaderboard from './components/Leaderboard.vue'
import SettingsPanel from './components/SettingsPanel.vue'
// Screens most visits never open load when first opened, keeping the first download small.
const CheatMenu = defineAsyncComponent(() => import('./components/CheatMenu.vue'))
const CustomPanel = defineAsyncComponent(() => import('./components/CustomPanel.vue'))
const AgentPanel = defineAsyncComponent(() => import('./components/AgentPanel.vue'))
const MultiplayerPanel = defineAsyncComponent(() => import('./components/MultiplayerPanel.vue'))
const ReplaysPanel = defineAsyncComponent(() => import('./components/ReplaysPanel.vue'))
import ReplayViewer from './components/ReplayViewer.vue'
import PadGlyph from './components/PadGlyph.vue'
import FpsMeter from './components/FpsMeter.vue'
import PadReady from './components/PadReady.vue'
import { showFps } from './perf'
import ActionButton from './components/ActionButton.vue'
import Joystick from './components/Joystick.vue'
import DPad from './components/DPad.vue'
import { touchControls } from './controls'

// Every finished game is saved; one that places can go on the board.
watchGameOver()

watch(
  () => mp.phase,
  (phase) => {
    if (phase !== 'playing') ui.mpMenu = false
  },
)
/**
 * Behind the start screen the real game plays itself, faintly, on the board.
 * Anything that leaves the start screen (a panel, how-to-play, another page)
 * stops it and leaves a fresh game ready; the hamburger menu keeps it going.
 */
watch(
  () =>
    route.value.name === 'game' && status.value === 'ready' && !ui.briefing &&
    !ui.customOpen && !ui.cheatOpen && !ui.settingsOpen && !ui.accountOpen && !ui.agentOpen &&
    !ui.mpOpen && mp.phase === 'off' && !match.on,
  (on) => (on ? startDemo() : stopDemo()),
  { immediate: true },
)

/** The tab's title follows the game: where you are, and how the run is going. */
watch(
  () => {
    if (ui.cheatOpen) return 'Workshop'
    if (ui.customOpen) return 'Custom games'
    if (mp.phase === 'lobby') return `Room ${mp.code}`
    if (mp.phase === 'playing' || mp.phase === 'countdown') return `Multiplayer · ${state.score.toLocaleString()}`
    if (mp.phase === 'done' || mp.phase === 'results') return 'Multiplayer results'
    if (ui.mpOpen) return 'Multiplayer'
    if (route.value.name === 'scores') return 'High scores'
    if (route.value.name === 'replays' || route.value.name === 'watch') return 'Replays'
    if (status.value === 'running') return `▶ Level ${state.level + 1} · ${state.score.toLocaleString()}`
    if (status.value === 'paused') return `❚❚ Paused · ${state.score.toLocaleString()}`
    if (status.value === 'over') return `Game over · ${state.score.toLocaleString()}`
    return custom.on ? 'Custom play' : 'snake to the beat'
  },
  (what) => (document.title = `Laserwyrm · ${what}`),
  { immediate: true },
)

watch(
  () => status.value === 'ready' && !ui.briefing,
  (onMenu) => {
    if (onMenu) splash.value = SPLASHES[Math.floor(Math.random() * SPLASHES.length)]!
  },
  { immediate: true },
)

/** The grid follows the window, but only between games. */
function onResize() {
  // The pad moves with the window (turning the phone); the grid only between games.
  fitLayout()
  if (match.on) return
  if (demo.on) startDemo()
  else if (status.value === 'ready') reset()
  else if (status.value === 'over') fitGrid()
}
function onBlur() {
  pause()
}
function onVisibility() {
  if (document.hidden) pause()
}

// With a controller, highlight the main button of each screen as it opens; `pad-on` makes the highlight big and bright.
watch(
  () => pad.connected,
  (on) => document.documentElement.classList.toggle('pad-on', on),
  { immediate: true },
)
watch(
  () => [status.value, route.value.name, ui.customOpen, ui.cheatOpen, ui.settingsOpen, ui.accountOpen, ui.briefing, ui.menuOpen, pad.connected],
  () => {
    if (!pad.connected) return
    // After the screen's fade-in has put it in place.
    setTimeout(navFocusFirst, 220)
  },
)
// Cuts, hits, game over and the rest rumble the controller, as hard as they land.
onFeel((kind, amount) => {
  if (pad.connected) rumbleFor(kind, amount)
})
// A phone turned upright mid-game pauses until it is turned back.
watch(
  () => layout.portrait,
  (portrait) => {
    if (portrait) pause()
  },
)

/* ─── Full screen ─── */
// Playing goes full screen and stays there; the pause screen is the way out.
watch(
  () => status.value,
  (status) => {
    if (status === 'running' && !replay.active) enterFullscreen()
  },
)
/** How to get out, for a few seconds after going in. */
const fsHint = ref(false)
let fsHintTimer = 0
let stopFullscreenWatch = () => {}

/**
 * The mouse pointer hides while playing, as a video player's does: it shows
 * when the mouse moves and goes again after two still seconds. Menus and the
 * pause screen always keep it.
 */
const cursorIdle = ref(false)
let cursorTimer = 0
function onMouseMove(event: MouseEvent) {
  // Browsers also send moves that are not the hand moving (the page changing under a still pointer).
  if (!event.movementX && !event.movementY) return
  cursorIdle.value = false
  clearTimeout(cursorTimer)
  cursorTimer = window.setTimeout(() => (cursorIdle.value = status.value === 'running' && !replay.active), 2000)
}
watch(
  () => status.value === 'running' && !replay.active,
  (playing) => {
    clearTimeout(cursorTimer)
    // Into play: hide after the same two seconds. Out of play: show at once.
    if (playing) cursorTimer = window.setTimeout(() => (cursorIdle.value = true), 2000)
    else cursorIdle.value = false
  },
)

onMounted(() => {
  window.addEventListener('hashchange', onRoute)
  if (route.value.name !== 'game' || location.hash.startsWith('#/d/') || location.hash.startsWith('#/mp/')) void onRoute()
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
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('resize', onResize)
  window.addEventListener('blur', onBlur)
  document.addEventListener('visibilitychange', onVisibility)
})
onBeforeUnmount(() => {
  window.removeEventListener('hashchange', onRoute)
  stopGamepad()
  stopFullscreenWatch()
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('blur', onBlur)
  document.removeEventListener('visibilitychange', onVisibility)
})
</script>

<template>
  <div class="screen" :class="{ 'cursor-idle': cursorIdle }" @touchstart.passive="onTouchStart" @touchmove.passive="onTouchMove">
    <div
      class="arena"
      :style="{ top: `${layout.top}px`, right: `${layout.right}px`, bottom: `${layout.bottom}px`, left: `${layout.left}px` }"
    ><CanvasBoard v-if="renderer === 'canvas'" /><Board v-else /></div>
    <!-- Phones: the left half steers, the right half uses power-ups; both faint, over the board -->
    <template v-if="layout.pad === 'sticks' && !layout.portrait && route.name !== 'watch'">
      <DPad v-if="touchControls === 'dpad'" />
      <Joystick v-else />
      <ActionButton />
    </template>

    <HudBar />

    <PlayNotices />

    <!-- Menus and cards: one at a time, fading and growing in, quickly -->
    <Transition name="menu">
      <!-- High scores -->
      <div v-if="route.name === 'scores'" class="overlay">
        <Leaderboard :highlight="route.highlight" @close="go('#/')" @watch="(id) => go(`#/watch/${id}`)" />
      </div>

      <!-- Replays: search and my games -->
      <div v-else-if="route.name === 'replays'" class="overlay">
        <ReplaysPanel @close="go('#/')" />
      </div>

      <!-- Watching a run -->
      <ReplayViewer v-else-if="route.name === 'watch' && player.run" @exit="go('code' in route ? '#/replays' : '#/scores')" />
      <div v-else-if="route.name === 'watch'" class="overlay">
        <div class="card card-small">
          <p class="chrome-label">replay</p>
          <h2>{{ watchError ? 'Not found' : 'Loading…' }}</h2>
          <p v-if="watchError" class="best-line">{{ watchError }}</p>
          <button class="btn btn-line" @click="go('code' in route ? '#/replays' : '#/scores')"><span class="text-trim">Back</span></button>
        </div>
      </div>

      <!-- Account -->
      <div v-else-if="ui.accountOpen" class="overlay">
        <AccountPanel @close="ui.accountOpen = false" />
      </div>

      <!-- Settings -->
      <div v-else-if="ui.settingsOpen" class="overlay">
        <SettingsPanel @close="ui.settingsOpen = false" />
      </div>

      <!-- Cheats, and the custom game's editor -->
      <div v-else-if="ui.cheatOpen" class="overlay">
        <CheatMenu :start="ui.cheatTab" @close="ui.cheatOpen = false" />
      </div>

      <!-- AI agents -->
      <div v-else-if="ui.agentOpen" class="overlay">
        <AgentPanel @close="ui.agentOpen = false" />
      </div>

      <!-- Multiplayer: create or join a room, then its lobby -->
      <div v-else-if="mp.phase === 'lobby' || (ui.mpOpen && (mp.phase === 'off' || mp.phase === 'connecting'))" class="overlay">
        <MultiplayerPanel @close="ui.mpOpen = false" />
      </div>
      <!-- Multiplayer: waiting for the others, then the standings -->
      <div v-else-if="mp.phase === 'done' || mp.phase === 'results'" class="overlay">
        <MpResults @left="ui.mpOpen = false" />
      </div>
      <!-- Multiplayer: the count down shows over the board, nothing else -->
      <div v-else-if="mp.phase === 'countdown'" class="overlay-none"></div>
      <!-- Multiplayer: the way out, with the game still going behind -->
      <div v-else-if="ui.mpMenu && mp.phase === 'playing'" class="overlay">
        <div class="card card-small">
          <p class="chrome-label">multiplayer · the game goes on</p>
          <h2>Leave the match?</h2>
          <button class="btn" @click="ui.mpMenu = false"><span class="text-trim">Keep playing</span></button>
          <button class="btn btn-line" @click="leaveMatch"><span class="text-trim">Leave room</span></button>
          <button class="close card-close" aria-label="Keep playing" @click="ui.mpMenu = false">✕</button>
        </div>
      </div>

      <!-- Custom play: your design, shared ones, sharing yours -->
      <div v-else-if="ui.customOpen" class="overlay">
        <CustomPanel @close="ui.customOpen = false" @play="playCustom" @editor="openEditor" @normal="playNormal" @invite="openMultiplayer" />
      </div>

      <!-- Briefing: how to play, then any key -->
      <div v-else-if="ui.briefing && status === 'ready'" class="overlay" @pointerdown.self="begin()">
        <Briefing :mode="ui.briefing" @start="begin()" @back="closeBriefing()" />
      </div>

      <!-- Start -->
      <StartCard v-else-if="status === 'ready'" />

      <!-- Paused -->
      <PauseCard v-else-if="status === 'paused'" />

      <!-- Game over: the score big, everything else quiet -->
      <GameOverCard v-else-if="status === 'over' && !match.on" />
    </Transition>

    <!-- Just went full screen: how to get out -->
    <div v-if="fsHint && status === 'running' && layout.pad === 'none'" class="fs-hint">
      <template v-if="pad.connected"><PadGlyph button="start" /> pause · leave full screen from the pause screen</template>
      <template v-else><kbd>Esc</kbd> pause · <kbd>Esc</kbd> again to leave full screen</template>
    </div>

    <!-- Started from a controller before any click: playing, but silent until one -->
    <div v-if="(soundBlocked || fullscreenPending) && status === 'running'" class="pad-toast sound-off">
      <template v-if="soundBlocked">sound is off · tap, click or press any key to turn it on<template v-if="fullscreenPending"> and go full screen</template></template>
      <template v-else>tap, click or press any key for full screen</template>
    </div>


    <!-- Phones held upright: ask for sideways -->
    <div v-if="layout.pad === 'sticks' && layout.portrait" class="rotate">
      <svg viewBox="0 0 64 64" width="72" height="72" aria-hidden="true">
        <rect x="20" y="8" width="24" height="44" rx="3" fill="none" stroke="var(--sky)" stroke-width="3" />
        <rect x="8" y="22" width="44" height="24" rx="3" fill="none" stroke="var(--mint)" stroke-width="3" class="turned" />
      </svg>
      <p class="rotate-title">Turn your phone sideways</p>
      <p class="rotate-sub">Laserwyrm plays in landscape: stick on the left, button on the right.</p>
    </div>

    <!-- Controller connected (and, before any click, asking for one: full screen and sound need it) -->
    <PadReady />

    <!-- Frame rate, when switched on in Settings -->
    <FpsMeter v-if="showFps" />

    <!-- CRT glass: scanlines and a dark vignette over the whole screen -->
    <div class="crt" aria-hidden="true"></div>
  </div>
</template>

<style scoped>
/* Playing with the mouse still: no pointer over the game. */
.screen.cursor-idle,
.screen.cursor-idle * { cursor: none !important; }
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
.rotate {
  position: absolute;
  inset: 0;
  z-index: 9;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 12px;
  padding: 24px;
  background: var(--bg-off);
  text-align: center;
}
.rotate .turned { animation: turn 2.4s steps(1) infinite; }
@keyframes turn {
  0%, 100% { opacity: 0; }
  50% { opacity: 1; }
}
.rotate-title {
  margin: 0;
  font-family: var(--font-pixel);
  font-size: 14px;
  line-height: 1.6;
  text-transform: uppercase;
  color: var(--sun);
}
.rotate-sub { margin: 0; max-width: 18rem; font-size: 18px; color: var(--text-dim); }
.pad-toast.sound-off { animation: none; border-color: var(--sun); font-size: 16px; }
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

/* For the hints and toasts (keyframes are per component when scoped). */
@keyframes notice {
  0% { opacity: 0; transform: translateY(-6px); }
  10% { opacity: 1; transform: none; }
  85% { opacity: 1; }
  100% { opacity: 0; }
}
</style>

<style scoped src="./styles/cards.css"></style>
