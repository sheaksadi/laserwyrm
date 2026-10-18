<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Board from './components/Board.vue'
import { conductor, musicOn, muted, soundBlocked } from './audio'
import { effectLeft, fitGrid, fitLayout, HEART_PATH, isActive, LASER_TIERS, lastReplay, layout, multiplier, onFeel, setMode, pause, play, POWERS, replay, reset, START_HEARTS, state, toggle, TONE_COLOR, TOTEM, turn, useItem, type DirName, type Mode } from './game'
import { canFullscreen, enterFullscreen, isFullscreen, leaveFullscreen, watchFullscreen } from './fullscreen'
import { pad, rumbleFor, startGamepad, stopGamepad } from './gamepad'
import { account, localGames, rememberGame, signOut } from './account'
import { ApiError, claimName, countPlay, fetchDesign, fetchGame, fetchScore, placesOnBoard, saveGame, submitScore as sendScore } from './api'
import { player, seekBy, stopWatching, togglePlay, watch as watchRun } from './replayPlayer'
import { custom, playShared, setCustom, shared, stopShared } from './design'
import Briefing from './components/Briefing.vue'
import CheatMenu from './components/CheatMenu.vue'
import CustomPanel from './components/CustomPanel.vue'
import AccountPanel from './components/AccountPanel.vue'
import GameCode from './components/GameCode.vue'
import HeldPills from './components/HeldPills.vue'
import Mascot from './components/Mascot.vue'
import ReplaysPanel from './components/ReplaysPanel.vue'
import Leaderboard from './components/Leaderboard.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import ReplayViewer from './components/ReplayViewer.vue'
import PadGlyph from './components/PadGlyph.vue'
import PowerIcon from './components/PowerIcon.vue'
import ActionButton from './components/ActionButton.vue'
import Joystick from './components/Joystick.vue'
import DPad from './components/DPad.vue'
import { touchControls } from './controls'

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

/* ─── Pages: the game, the high scores, replays, and watching a run ─── */
type Route =
  | { name: 'game' }
  | { name: 'scores'; highlight?: number }
  | { name: 'replays' }
  | { name: 'watch'; id: number }
  | { name: 'watch'; code: string }
function parseRoute(): Route {
  const hash = location.hash
  const watching = hash.match(/^#\/watch\/(\d+)/)
  if (watching) return { name: 'watch', id: Number(watching[1]) }
  const game = hash.match(/^#\/game\/([A-Za-z]{4}-\d{4})/)
  if (game) return { name: 'watch', code: game[1]!.toUpperCase().replace('-', '#') }
  const scores = hash.match(/^#\/scores(?:\/(\d+))?/)
  if (scores) return { name: 'scores', highlight: scores[1] ? Number(scores[1]) : undefined }
  if (hash.startsWith('#/replays')) return { name: 'replays' }
  return { name: 'game' }
}
const route = ref<Route>(parseRoute())
const go = (hash: string) => {
  location.hash = hash
}
const watchError = ref('')
/** Bumped on every page change, so a slow load cannot open after the player has moved on. */
let navigation = 0
/** A shared game's link (#/d/K7QM2X): load it and set it up to play, then carry on at the start screen. */
async function playLink(slug: string) {
  try {
    const entry = await fetchDesign(slug.length === 6 ? slug.toUpperCase() : slug)
    playShared({ slug: entry.slug, name: entry.name, author: entry.author }, entry.design)
    void countPlay(entry.slug).catch(() => {})
    reset()
  } catch {
    customOpen.value = true
  }
}

async function onRoute() {
  const link = location.hash.match(/^#\/d\/(\w+)/)
  if (link) {
    history.replaceState(null, '', `${location.pathname}${location.search}#/`)
    void playLink(link[1]!)
  }
  const here = ++navigation
  const next = parseRoute()
  const was = route.value
  route.value = next
  if (was.name === 'watch') stopWatching()
  if (next.name !== 'game') {
    menuOpen.value = false
    cheatOpen.value = false
    accountOpen.value = false
    pause()
  }
  if (next.name === 'watch') {
    watchError.value = ''
    const still = () => navigation === here
    try {
      if ('id' in next) {
        const entry = await fetchScore(next.id)
        if (still()) watchRun(entry.replay, entry)
      } else {
        const game = await fetchGame(next.code).catch((err) => {
          // Saved offline: watchable without the server.
          const kept = localGames.offline[next.code]
          if (!kept) throw err
          return { replay: kept, name: account.name, score: localGames.list.find((g) => g.code === next.code)?.score ?? 0, level: 0, code: next.code }
        })
        if (still()) watchRun(game.replay, { name: game.name, score: game.score, level: game.level, code: game.code })
      }
    } catch (err) {
      watchError.value = err instanceof Error ? err.message : String(err)
    }
  }
}

/* ─── Saving every game, and putting good ones on the board ─── */
/** The finished game's code once the server has it; null while saving or if it could not. */
const gameCode = ref<string | null>(null)
const gameSave = ref<'saving' | 'saved' | 'failed'>('saved')
const saveError = ref('')
/** The server did not know this device's login code (an old or wiped account): signed out, game saved anyway. */
const signedOutNote = ref('')
let saving: Promise<string | null> = Promise.resolve(null)

const entryName = ref('')
const entryEmail = ref('')
const nameSuggestions = ref<string[]>([])
/** Just signed up from this form: show the login code once, with a nudge to keep it. */
const newLoginCode = ref<string | null>(null)
/** Whether this run makes the board, then how sending it went. */
const entry = ref<{ phase: 'checking' | 'open' | 'none' | 'sending' | 'saved' | 'failed'; rank?: number; id?: number; error?: string }>({ phase: 'none' })
watch(
  () => state.status,
  async (status) => {
    if (status !== 'over' || replay.active) return
    // Every game is saved, signed in or not, so it can be found and shared.
    const run = lastReplay()
    const summary = { score: state.score, level: state.level + 1, steps: run.steps, mode: state.mode }
    gameCode.value = null
    gameSave.value = 'saving'
    newLoginCode.value = null
    nameSuggestions.value = []
    entryName.value = account.name ?? entryName.value
    saveError.value = ''
    signedOutNote.value = ''
    const payload = { ...summary, cheated: state.cheated, replay: run, design: shared.slug ?? undefined, cheats: state.usedCheats }
    saving = saveGame(payload)
      .catch((err) => {
        // A login code this server does not know: sign out here and save the game without it.
        if (!(err instanceof ApiError) || err.status !== 401 || !account.code) throw err
        signedOutNote.value = `${account.name ?? 'Your account'} was not recognised by the server, so you are signed out on this device.`
        signOut()
        return saveGame(payload)
      })
      .then(({ code }) => {
        gameCode.value = code
        gameSave.value = 'saved'
        rememberGame({ code, ...summary, created_at: new Date().toISOString() })
        return code
      })
      .catch((err) => {
        gameSave.value = 'failed'
        saveError.value = err instanceof Error ? err.message : String(err)
        return null
      })
    entry.value = { phase: 'checking' }
    const places = !state.cheated && (await placesOnBoard(state.score, state.mode))
    if (state.status === 'over') entry.value = { phase: places ? 'open' : 'none' }
  },
)
async function submitScore(name = entryName.value.trim()) {
  if (!account.name && !name) return
  entry.value = { phase: 'sending' }
  nameSuggestions.value = []
  try {
    const code = await saving
    if (!code) throw new Error(`this game could not be saved (${saveError.value}), so it cannot go on the board`)
    // Not signed in: the name typed here becomes the player's account.
    if (!account.name) {
      const made = await claimName(name)
      newLoginCode.value = made.code
      entryName.value = made.name
    }
    const saved = await sendScore({ game: code, email: entryEmail.value.trim() })
    entry.value = { phase: 'saved', rank: saved.rank, id: saved.id }
  } catch (err) {
    if (err instanceof ApiError && Array.isArray(err.extra.suggestions)) nameSuggestions.value = err.extra.suggestions as string[]
    entry.value = { phase: 'failed', error: err instanceof Error ? err.message : String(err) }
  }
}

/** Account, from the menu; the game pauses while it is open. */
const accountOpen = ref(false)
function openAccount() {
  menuOpen.value = false
  accountOpen.value = true
  pause()
}

/**
 * The briefing between Press start and the first move: how to play, with
 * warm-up music. Any key, click, tap or A starts; Esc or B goes back.
 */
const briefing = ref<Mode | null>(null)
function openBriefing(mode: Mode) {
  setMode(mode)
  briefing.value = mode
  conductor.warmup()
}
function begin(dir?: DirName) {
  if (!briefing.value) return
  briefing.value = null
  play()
  if (dir) turn(dir)
}
function closeBriefing() {
  briefing.value = null
  conductor.stop()
}

/** Settings, from the menu; the game pauses while it is open. */
const settingsOpen = ref(false)
function openSettings() {
  menuOpen.value = false
  settingsOpen.value = true
  pause()
}

/** The workshop (cheats and the editor), from the custom screen; it pauses, C or Escape closes it. */
const cheatOpen = ref(false)
/** Which workshop tab opens first: cheats from C, the level editor from custom play. */
const cheatTab = ref<'cheats' | 'global' | 'levels'>('cheats')

/** Custom play: the start screen's Custom button. */
const customOpen = ref(false)
function openCustom() {
  menuOpen.value = false
  cheatOpen.value = false
  customOpen.value = true
  pause()
}
/** Play this device's own design, from its how-to-play. */
function playCustom() {
  customOpen.value = false
  stopShared()
  setCustom(true)
  reset()
  openBriefing('normal')
}
/** The level editor, from the custom screen or the pause screen. */
function openEditor() {
  customOpen.value = false
  cheatTab.value = 'levels'
  cheatOpen.value = true
  menuOpen.value = false
  pause()
}
/** Back to the stock game. */
function playNormal() {
  customOpen.value = false
  setCustom(false)
  reset()
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
  if (route.value.name === 'scores' || route.value.name === 'replays') {
    if (event.key === 'Escape') go('#/')
    return
  }
  if (accountOpen.value) {
    if (event.key === 'Escape') accountOpen.value = false
    return
  }
  if (settingsOpen.value) {
    if (event.key === 'Escape') settingsOpen.value = false
    return
  }
  if (customOpen.value) {
    // Typing in the search or share box: the keys are text.
    if (document.activeElement?.matches('input:not([type=range]), textarea')) return
    if (event.key === 'Escape' || event.key === 'c' || event.key === 'C') customOpen.value = false
    return
  }
  if (briefing.value && state.status === 'ready' && !accountOpen.value && !cheatOpen.value) {
    event.preventDefault()
    if (event.key === 'Escape') closeBriefing()
    else begin(KEYMAP[event.key])
    return
  }
  // Typing a level name or a share code in the cheat menu: the keys are text.
  if (cheatOpen.value && document.activeElement?.matches('input:not([type=range]), textarea')) return
  if (event.key === 'c' || event.key === 'C') return cheatOpen.value ? (cheatOpen.value = false) : openCustom()
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
    if (briefing.value) return begin(dir)
    if (route.value.name === 'watch' && (dir === 'left' || dir === 'right')) seekBy(dir === 'left' ? -36 : 36)
    else if (route.value.name === 'game' && !cheatOpen.value) turn(dir)
  },
  primary: () => {
    if (briefing.value) return begin()
    if (route.value.name === 'watch') return togglePlay()
    if (route.value.name === 'scores' || route.value.name === 'replays') return go('#/')
    if (cheatOpen.value || typing()) return
    if (state.status === 'running') useItem()
    else play()
  },
  start: () => {
    if (briefing.value) return begin()
    if (cheatOpen.value) cheatOpen.value = false
    else toggle()
  },
  back: () => {
    if (route.value.name !== 'game') return
    if (customOpen.value) customOpen.value = false
    else if (cheatOpen.value) cheatOpen.value = false
    else openCustom()
  },
  // B is back: out of whatever is open, one layer at a time. In play it pauses; on the pause screen, back into the game.
  cancel: () => {
    const r = route.value
    if (r.name === 'watch') return go('code' in r ? '#/replays' : '#/scores')
    if (r.name === 'scores' || r.name === 'replays') return go('#/')
    if (menuOpen.value) return (menuOpen.value = false)
    if (accountOpen.value) return (accountOpen.value = false)
    if (settingsOpen.value) return (settingsOpen.value = false)
    if (customOpen.value) return (customOpen.value = false)
    if (cheatOpen.value) return (cheatOpen.value = false)
    if (briefing.value) return closeBriefing()
    if (state.status === 'running') pause()
    else if (state.status === 'paused') play()
  },
}
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
/** The intro lasts two bars at the current tempo. */
const introSeconds = computed(() => (60 / state.bpm) * 8)

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
  if (route.value.name !== 'game' || location.hash.startsWith('#/d/')) void onRoute()
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
    <!-- Phones: the left half steers, the right half uses power-ups; both faint, over the board -->
    <template v-if="layout.pad === 'sticks' && !layout.portrait && route.name !== 'watch'">
      <DPad v-if="touchControls === 'dpad'" />
      <Joystick v-else />
      <ActionButton />
    </template>

    <!-- HUD: stats on the left, held power-ups in the middle, level and buttons on the right.
         Every number sits in a fixed-width box, so nothing shifts as it counts. -->
    <div class="hud" :class="layout.pad === 'none' ? 'hud-grid' : 'hud-phone'">
      <div class="hud-left">
        <div class="chip">
          <span class="brand show-wide">Laserwyrm<span class="brand-dot">.</span></span>
          <span class="divider show-wide"></span>
          <!-- Parts: one row on desktop; on phones, two chips in the left gutter (hearts above, numbers below) -->
          <span class="part part-top">
          <span :key="state.hearts" class="hearts" :class="{ low: state.hearts === 1 }" :aria-label="`${state.hearts} hearts`" role="img">
            <svg v-for="(full, i) in heartSlots" :key="i" viewBox="-0.5 -0.5 8 7" width="18" height="16">
              <path :d="HEART_PATH" :fill="full ? 'var(--coral)' : 'none'" :stroke="full ? 'var(--ink)' : 'var(--text-muted)'" stroke-width="1" />
            </svg>
            <svg v-if="state.totem" class="totem-held" viewBox="-0.5 -0.5 1 1" width="18" height="18" :title="TOTEM.name"><PowerIcon kind="totem" /></svg>
          </span>
          </span>
          <span class="divider"></span>
          <span class="part part-bottom">
          <span class="stat stat-score"><span class="chrome-label">score</span><b class="num score-num">{{ state.score }}</b></span>
          <span class="stat"><span class="chrome-label">mult</span><b class="num mult-num mult" :class="{ doubled: isActive('double') }">×{{ multiplier() }}</b></span>
          </span>
          <span v-if="state.cheated" class="cheat-tag" :title="state.usedCheats ? 'Cheats used: this run cannot set a best' : 'A changed game: this run cannot set a best'">{{ state.usedCheats ? 'cheats' : shared.slug ? 'shared' : 'custom' }}</span>
          <span v-if="state.mode === 'hardcore'" class="hc-tag" title="Hardcore: walls kill, no hearts back, no pauses">hardcore</span>
        </div>
        <div class="effects">
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
          <span class="stat"><span class="chrome-label">level</span><b class="num level-num">{{ state.level + 1 }}</b></span>
          <span class="bpm" :style="{ '--beat': `${60 / state.bpm}s` }">
            <span class="bpm-dot" :class="{ live: state.status === 'running' }"></span>{{ state.bpm }} bpm
          </span>
        </div>
        <button class="round" :aria-label="state.status === 'running' ? 'Pause' : 'Play'" @click="toggle()">
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
            <button class="menu-item" role="menuitem" @click="menuOpen = false; go('#/scores')">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3" /></svg>
              <span>High scores</span><span></span><span></span>
            </button>
            <button class="menu-item" role="menuitem" @click="menuOpen = false; go('#/replays')">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><path d="M4 5h16v14H4zM10 9v6l5-3z" /></svg>
              <span>Replays</span><span></span><span></span>
            </button>
            <button class="menu-item" role="menuitem" @click="openAccount">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" /></svg>
              <span>Account</span><span class="state" :class="{ on: account.name }">{{ account.name ?? 'sign in' }}</span><span></span>
            </button>
            <button class="menu-item" role="menuitem" @click="openCustom">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20 14 10M14 4v3M14 13v3M10 7H7M21 7h-3M17 4l-1.5 1.5M17 10l-1.5-1.5" /></svg>
              <span>Custom</span><span></span><kbd class="hide-touch">C</kbd>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- A new kind of laser: play waits while it is introduced -->
    <!-- A new kind of laser: a popup from the top, like the item notices, a size up -->
    <div
      v-if="state.intro && state.status === 'running'"
      :key="state.intro.until"
      class="tier-intro"
      :class="{ touch: layout.pad !== 'none' }"
      :style="{ '--laser': INTRO_COLOR[LASER_TIERS[state.intro.tier]!.kind], '--intro': `${introSeconds}s` }"
    >
      <span class="tier-swatch" aria-hidden="true"></span>
      <span class="tier-text">
        <b class="tier-name">{{ LASER_TIERS[state.intro.tier]!.name }} <span class="tier-level">level {{ state.level + 1 }}</span></b>
        <span class="tier-blurb">{{ LASER_TIERS[state.intro.tier]!.blurb }}</span>
        <span class="tier-heart"><template v-if="state.intro.healed">+1 heart · </template>lasers ease in for a moment</span>
      </span>
      <div class="tier-beam" aria-hidden="true"><span></span></div>
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
      <div v-else-if="accountOpen" class="overlay">
        <AccountPanel @close="accountOpen = false" />
      </div>

      <!-- Settings -->
      <div v-else-if="settingsOpen" class="overlay">
        <SettingsPanel @close="settingsOpen = false" />
      </div>

      <!-- Cheats, and the custom game's editor -->
      <div v-else-if="cheatOpen" class="overlay">
        <CheatMenu :start="cheatTab" @close="cheatOpen = false" />
      </div>

      <!-- Custom play: your design, shared ones, sharing yours -->
      <div v-else-if="customOpen" class="overlay">
        <CustomPanel @close="customOpen = false" @play="playCustom" @editor="openEditor" @normal="playNormal" />
      </div>

      <!-- Briefing: how to play, then any key -->
      <div v-else-if="briefing && state.status === 'ready'" class="overlay" @pointerdown.self="begin()">
        <Briefing :mode="briefing" @start="begin()" />
      </div>

      <!-- Start -->
      <div v-else-if="state.status === 'ready'" class="overlay">
        <div class="card card-start">
          <Mascot class="corner-mascot" />
          <header class="hello">
            <h1>Laserwyrm<span class="brand-dot">.</span></h1>
            <!-- Custom play is on: your design, or one from Explore -->
            <p v-if="custom.on" class="shared-note">
              Custom: <b>{{ shared.slug ? shared.name : 'your game' }}</b><template v-if="shared.slug"> by {{ shared.author }}</template>
              <button class="shared-leave" @click="playNormal">play normal</button>
            </p>
          </header>
          <div class="start-buttons">
          <button class="btn btn-start" @click="openBriefing('normal')">
            <span class="start-face">
              <svg class="blink" viewBox="-0.5 -0.5 8 7" width="16" height="14" aria-hidden="true"><path :d="HEART_PATH" fill="#FFFFFF" stroke="var(--ink)" stroke-width="0.8" /></svg>
              <span class="text-trim">{{ custom.on ? 'Play custom' : 'Press start' }}</span>
            </span>
          </button>
          <!-- Hardcore and custom, half each -->
          <div class="mode-row">
            <button
              class="btn btn-hardcore"
              title="Hardcore: walls kill, no hearts back, no pauses. Its own high scores."
              aria-label="Play hardcore"
              @click="openBriefing('hardcore')"
            >
              <span class="start-face">
                <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4 2h8v1h1v1h1v5h-1v1h-1v1h-1v3H5v-3H4v-1H3V9H2V4h1V3h1z" fill="currentColor" /><path d="M5 6h2v2H5zM9 6h2v2H9zM7 9h2v1H7zM6 12h1v1H6zM9 12h1v1H9z" fill="var(--ink)" /></svg>
                <span class="text-trim">Hardcore</span>
              </span>
            </button>
            <button class="btn btn-custom" :class="{ on: custom.on }" title="Your own levels, and ones other players made" @click="openCustom">
              <span class="start-face">
                <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM10 9h3v2h2v3h-2v-2h-3z" fill="currentColor" /></svg>
                <span class="text-trim">Custom</span>
              </span>
            </button>
          </div>
          <!-- Settings, and the account (a face: claim a name, or your games) -->
          <div class="start-row">
            <button class="btn btn-line" @click="openSettings">
              <span class="start-face">
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M6 1h4v2h1l1-1 2 2-1 1v1h2v4h-2v1l1 1-2 2-1-1h-1v2H6v-2H5l-1 1-2-2 1-1V9H1V5h2V4L2 3l2-2 1 1h1z" fill="currentColor" /><path d="M6 6h4v4H6z" fill="var(--ink)" /></svg>
                <span class="text-trim">Settings</span>
              </span>
            </button>
            <button
              class="btn btn-account"
              :class="{ signed: account.name }"
              :title="account.name ? `${account.name}: your account and games` : 'Claim a name'"
              :aria-label="account.name ? `Account: ${account.name}` : 'Claim a name'"
              @click="openAccount"
            >
              <svg viewBox="0 0 16 16" width="22" height="22" aria-hidden="true">
                <path d="M5 1h6v1h2v2h1v8h-1v2h-2v1H5v-1H3v-2H2V4h1V2h2z" fill="currentColor" />
                <path d="M5 6h2v2H5zM9 6h2v2H9zM5 10h1v1h4v-1h1v1h-1v1H6v-1H5z" fill="var(--ink)" />
              </svg>
            </button>
          </div>
          <button class="btn btn-line" @click="go('#/scores')"><span class="text-trim">High scores</span></button>
          </div>
          <p v-if="!pad.connected" class="pad-note">
            <svg viewBox="0 0 24 16" width="24" height="16" aria-hidden="true"><path d="M5 1h14a4 4 0 0 1 4 4l1 7a3 3 0 0 1-5 2l-3-3H8l-3 3a3 3 0 0 1-5-2l1-7a4 4 0 0 1 4-4Z" fill="currentColor" /><path d="M6 5v4M4 7h4" stroke="var(--bg)" stroke-width="1.6" /><circle cx="17" cy="5.5" r="1.1" fill="var(--bg)" /><circle cx="19" cy="8" r="1.1" fill="var(--bg)" /></svg>
            Controller supported · press any button to connect
          </p>
        </div>
      </div>

      <!-- Paused -->
      <div v-else-if="state.status === 'paused'" class="overlay">
        <div class="card card-small">
          <p class="chrome-label">paused</p>
          <h2>Take a breath</h2>
          <button class="btn" @click="play()"><span class="text-trim">Resume</span></button>
          <button class="btn btn-line" @click="reset()"><span class="text-trim">Restart</span></button>
          <!-- In custom play: the editor, or back to the stock game -->
          <template v-if="custom.on">
            <button class="btn btn-line" @click="openEditor"><span class="text-trim">Editor</span></button>
            <button class="btn btn-line" @click="playNormal"><span class="text-trim">Play normal</span></button>
          </template>
          <button v-if="canFullscreen()" class="btn btn-line" @click="toggleFullscreen()">
            <span class="text-trim">{{ isFullscreen ? 'Exit full screen' : 'Full screen' }}</span>
          </button>
          <p v-if="isFullscreen && !pad.connected" class="keys"><span class="keygroup"><kbd>Esc</kbd> exit full screen</span></p>
        </div>
      </div>

      <!-- Game over: the score big, everything else quiet -->
      <div v-else-if="state.status === 'over'" class="overlay">
        <div class="card card-over">
          <header class="over-head">
            <p class="over-label">Game over · the snake {{ state.reason }}<template v-if="state.mode === 'hardcore'"> · hardcore</template></p>
            <p class="final" :class="{ best: state.newBest }">{{ state.score }}</p>
            <p v-if="state.newBest" class="new-best blink">New best!</p>
            <p v-else class="best-line">best {{ state.best }}<template v-if="state.cheated"> · {{ state.usedCheats ? 'cheats on' : 'changed game' }}, not counted</template></p>
            <p v-if="shared.slug" class="best-line">{{ shared.name }}<template v-if="!state.usedCheats"> · on its own board</template></p>
          </header>
          <p v-if="signedOutNote" class="entry-note">{{ signedOutNote }}</p>

          <!-- A run that makes the board can be signed and sent, replay and all -->
          <form
            v-if="entry.phase === 'open' || entry.phase === 'sending' || entry.phase === 'failed'"
            class="entry"
            @submit.prevent="submitScore()"
          >
            <p class="entry-label">You made the high scores<template v-if="account.name"> as <b>{{ account.name }}</b></template></p>
            <input v-if="!account.name" v-model="entryName" class="field" maxlength="12" placeholder="Pick a name" aria-label="Name" autocomplete="nickname" required autofocus />
            <input v-model="entryEmail" class="field" type="email" maxlength="80" placeholder="Email (optional)" aria-label="Email, optional" autocomplete="email" />
            <button class="btn btn-submit" type="submit" :disabled="entry.phase === 'sending'"><span class="text-trim">{{ entry.phase === 'sending' ? '…' : 'Submit' }}</span></button>
            <p v-if="!account.name" class="entry-note">Your name becomes your account.</p>
            <p v-if="entry.phase === 'failed'" class="entry-error">{{ entry.error }}</p>
            <p v-if="nameSuggestions.length" class="suggest">
              Free:
              <button v-for="n in nameSuggestions" :key="n" type="button" class="suggestion" @click="submitScore(n)">{{ n }}</button>
            </p>
          </form>
          <p v-else-if="entry.phase === 'saved'" class="entry-done">
            {{ account.name }}: #{{ entry.rank }} on the board.
            <a :href="`#/scores/${entry.id}`">See the board</a> · <a :href="`#/watch/${entry.id}`">Watch your run</a>
          </p>
          <p v-if="newLoginCode" class="login-code">
            Your login code: <b>{{ newLoginCode }}</b><br />
            Keep it somewhere safe; it signs you in anywhere. It is also under ☰ → Account.
          </p>

          <dl class="tally">
            <div><dt>level</dt><dd>{{ state.level + 1 }}</dd></div>
            <div><dt>longest</dt><dd>{{ state.longest }}</dd></div>
            <div><dt>fruit</dt><dd>{{ state.stats.eaten }}</dd></div>
            <div><dt>cuts</dt><dd>{{ state.stats.cuts }}</dd></div>
          </dl>
          <div class="over-buttons">
            <button class="btn" @click="play()"><span class="text-trim">Play again</span></button>
            <button class="btn btn-line" @click="go('#/scores')"><span class="text-trim">Scores</span></button>
          </div>
          <!-- Every game gets a code to share -->
          <p class="game-line">
            <template v-if="gameCode">game <GameCode :code="gameCode" link /></template>
            <template v-else-if="gameSave === 'saving'">saving game…</template>
            <template v-else>could not save this game: {{ saveError }}</template>
          </p>
        </div>
      </div>
    </Transition>

    <!-- Just went full screen: how to get out -->
    <div v-if="fsHint && state.status === 'running' && layout.pad === 'none'" class="fs-hint">
      <template v-if="pad.connected"><PadGlyph button="start" /> pause · leave full screen from the pause screen</template>
      <template v-else><kbd>Esc</kbd> pause · <kbd>Esc</kbd> again to leave full screen</template>
    </div>

    <!-- Started from a controller before any click: playing, but silent until one -->
    <div v-if="soundBlocked && state.status === 'running'" class="pad-toast sound-off">
      sound is off · tap, click or press any key to turn it on
    </div>

    <!-- Controller connected -->
    <div v-if="padToast" class="pad-toast">
      <PadGlyph button="a" /> controller connected
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
.tier-intro {
  position: absolute;
  /* Where the item notices drop in, below the power-up slots. */
  top: 98px;
  left: 50%;
  z-index: 6;
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 8px 14px;
  width: min(31rem, calc(100% - 32px));
  padding: 11px 17px 12px;
  border: 3px solid var(--text-dim);
  border-radius: 12px;
  background: var(--bg);
  box-shadow: 5px 5px 0 var(--border);
  pointer-events: none;
  translate: -50% 0;
  animation: intro-drop var(--intro) var(--ease-out) both;
}
.tier-intro.touch { top: 70px; }
.tier-swatch { width: 26px; height: 26px; border: 3px solid var(--ink); border-radius: 6px; background: var(--laser); }
.tier-text { display: grid; gap: 3px; }
.tier-name {
  font-family: var(--font-pixel);
  font-size: 12px;
  font-weight: 400;
  line-height: 1.5;
  text-transform: uppercase;
  color: var(--text);
}
.tier-level { margin-left: 6px; font-family: var(--font-code); font-size: 17px; letter-spacing: 0.06em; color: var(--text-muted); }
.tier-blurb { font-size: 20px; line-height: 1.1; color: var(--text-dim); }
.tier-heart { font-size: 15px; text-transform: uppercase; color: var(--rose); }
/* A sample beam in the laser's colour, firing across. */
.tier-beam { grid-column: 1 / -1; height: 8px; border-radius: 4px; background: var(--bg-off); overflow: hidden; }
.tier-beam span { display: block; height: 100%; background: var(--laser); animation: beam-fire 0.8s var(--ease-out) infinite; transform-origin: left; }
@keyframes beam-fire {
  0% { transform: scaleX(0); }
  60%, 100% { transform: scaleX(1); }
}
@keyframes intro-drop {
  0% { opacity: 0; transform: translateY(-22px); }
  8%, 88% { opacity: 1; transform: none; }
  100% { opacity: 0; transform: translateY(-10px); }
}
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

/* ─── Overlays ─── */
.overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  /* Clear of the HUD and the power-up hint under it, which stay on top and
     usable (z 6); over the phone stick and button (z 5, earlier in the page). */
  z-index: 5;
  padding: 96px 16px 16px;
  background: rgba(0, 0, 0, 0.7);
}

/* Menus come and go quickly and smoothly: the backdrop fades, the card grows from a little smaller. */
.menu-enter-active { transition: opacity 0.18s var(--ease-out); }
.menu-leave-active { transition: opacity 0.12s ease-in; }
.menu-enter-active > * { transition: transform 0.18s var(--ease-out); }
.menu-leave-active > * { transition: transform 0.12s ease-in; }
.menu-enter-from,
.menu-leave-to { opacity: 0; }
.menu-enter-from > *,
.menu-leave-to > * { transform: scale(0.95); }
@media (prefers-reduced-motion: reduce) {
  .menu-enter-active > *,
  .menu-leave-active > * { transition: none; }
}
.card {
  width: min(32rem, 100%);
  max-height: 100%;
  overflow: auto;
  padding: 2rem;
  background: var(--bg);
  border: 3px solid var(--mint);
  box-shadow: 0 0 0 3px var(--ink), 0 0 0 6px var(--lavender), 10px 10px 0 6px var(--ink);
}
.card-small { width: min(24rem, 100%); }

/* ─── Start card: the same neon, softer: rounded corners, pink and mint, a mascot ─── */
.card-start {
  position: relative;
  overflow: visible;
  width: min(25.5rem, 100%);
  padding: 1.25rem 1.6rem 1.1rem;
  border-color: var(--rose);
  border-radius: 16px;
  box-shadow: 0 0 0 3px var(--ink), 0 0 0 6px var(--mint), 8px 8px 0 6px var(--ink);
}
/* The wyrm peeks over the card's top right corner. */
.corner-mascot {
  position: absolute;
  top: -50px;
  right: -34px;
  rotate: 6deg;
  pointer-events: none;
}
.hello {
  display: grid;
  justify-items: center;
  margin: 0.4rem 0 1.4rem;
  text-align: center;
}
.card-start h1 {
  margin: 0.3rem 0 0;
  font-size: clamp(1.2rem, 5vw, 1.8rem);
  text-shadow: 3px 3px 0 var(--rose);
}
.card-start .pad-note { margin-top: 0.6rem; }
.shared-note { margin: 0.6rem 0 0; font-size: 16px; text-transform: uppercase; color: var(--text-muted); }
.shared-note b { font-weight: 400; color: var(--mint); }
.shared-leave {
  margin-left: 6px;
  padding: 1px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: none;
  font-size: 14px;
  text-transform: uppercase;
  color: var(--text-dim);
}
.shared-leave:hover { border-color: var(--sage); color: var(--text); }
.card-start .btn { border-radius: 12px; }
/* Short screens (phones sideways): a smaller wyrm, just the title and buttons. */
@media (max-height: 520px) {
  .corner-mascot { top: -34px; right: -20px; scale: 0.7; }
  .hello { margin: 0 0 0.9rem; }
  .card-start .pad-note { display: none; }
}
/* Phones sideways: just the title and the buttons. */
@media (max-height: 460px) {
  .card-start { padding: 0.8rem 1.2rem; }
  .card-start h1 { font-size: 1.3rem; }
  .hello { margin-bottom: 0.6rem; }
}
/* Start and high scores side by side, start the bigger. */
/* Start, hardcore, high scores: one above the other. */
.start-buttons { display: grid; gap: 10px; }
.btn.btn-hardcore {
  background: var(--bg-off);
  border-color: var(--coral);
  color: var(--coral);
  text-shadow: none;
}
.btn.btn-hardcore:hover { background: var(--coral); color: var(--ink); }
.start-buttons .btn + .btn { margin-top: 0; }
.start-buttons .btn-hardcore,
.start-buttons .btn-custom,
.start-buttons .btn-line { padding-block: calc(0.45rem + 0.38em); font-size: 0.6rem; }
.mode-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.mode-row .btn + .btn { margin-top: 0; }
.btn.btn-custom {
  background: var(--bg-off);
  border-color: var(--mint);
  color: var(--mint);
  text-shadow: none;
}
.btn.btn-custom:hover, .btn.btn-custom.on { background: var(--mint); color: var(--ink); }

/* Settings, with the square account button on its right. */
.start-row { display: grid; grid-template-columns: 1fr auto; gap: 10px; }
.start-row .btn + .btn { margin-top: 0; }
.btn.btn-account {
  width: 52px;
  padding: 0;
  background: var(--bg-off);
  border-color: var(--text-muted);
  color: var(--text-muted);
}
.btn.btn-account.signed { border-color: var(--mint); color: var(--mint); }
.btn.btn-account:hover { background: var(--mint); color: var(--ink); }

.start-face { display: inline-flex; align-items: center; gap: 10px; }
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
/* ─── Game over: like the start card. The score big, everything else quiet, one even gap between parts ─── */
.card-over {
  display: grid;
  gap: 1rem;
  width: min(25.5rem, 100%);
  padding: 1.25rem 1.6rem 1rem;
  border-color: var(--rose);
  border-radius: 16px;
  box-shadow: 0 0 0 3px var(--ink), 0 0 0 6px var(--mint), 8px 8px 0 6px var(--ink);
  text-align: center;
}
.card-over p { margin: 0; }
.card-over .btn { border-radius: 12px; }
.over-head { display: grid; gap: 0.45rem; }
.over-label {
  font-size: 16px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--coral);
  opacity: 0.85;
}
.final {
  font-family: var(--font-pixel);
  font-size: clamp(2rem, 9vw, 2.8rem);
  line-height: 1.1;
  color: var(--text);
  text-shadow: 4px 4px 0 var(--lavender);
  overflow-wrap: anywhere;
}
.final.best { color: var(--sun); text-shadow: 4px 4px 0 var(--coral); }
.new-best {
  font-family: var(--font-pixel);
  font-size: 10px;
  text-transform: uppercase;
  color: var(--sun);
}
.best-line {
  font-size: 16px;
  text-transform: uppercase;
  color: var(--text-muted);
}

/* The high-score entry: a label, the fields and submit, one above the other. */
.entry { display: grid; gap: 8px; text-align: left; }
.entry-label {
  text-align: center;
  font-size: 16px;
  text-transform: uppercase;
  color: var(--sage);
}
.entry-label b { font-weight: 400; color: var(--sun); }
.field {
  min-width: 0;
  padding: 9px 13px;
  border: 2px solid var(--border);
  border-radius: 10px;
  background: var(--bg-warm);
  color: var(--text);
  font: inherit;
  font-size: 20px;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.field::placeholder { color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.field:hover { border-color: var(--text-muted); }
.field:focus { outline: none; border-color: var(--mint); box-shadow: 0 0 0 3px rgba(0, 240, 200, 0.18); }
.btn.btn-submit {
  padding-block: calc(0.5rem + 0.38em);
  background: var(--sky);
  font-size: 0.6rem;
}
.btn.btn-submit:hover { background: #6BBEFF; }
.btn.btn-submit:disabled { opacity: 0.6; cursor: progress; }
.entry-note { text-align: center; font-size: 15px; color: var(--text-muted); }
.entry-error { text-align: center; font-size: 16px; color: var(--coral); }
.suggest { display: flex; justify-content: center; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 16px; color: var(--text-muted); }
.suggestion { padding: 2px 8px; border: 2px solid var(--sage); border-radius: 8px; background: var(--bg-off); color: var(--sage); font-size: 16px; }
.suggestion:hover { background: var(--sage); color: var(--ink); }
.entry-done { font-size: 18px; color: var(--sage); }
.entry-done a { color: var(--sky); }
.login-code {
  padding: 8px 10px;
  border: 2px dashed var(--sun);
  border-radius: 10px;
  font-size: 16px;
  line-height: 1.3;
  color: var(--text-dim);
}
.login-code b { font-weight: 400; font-size: 19px; letter-spacing: 0.06em; color: var(--sun); user-select: all; }

/* The small print: four numbers in a quiet row. */
.tally {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin: 0;
  padding: 8px 4px;
  border-radius: 10px;
  background: var(--bg-warm);
}
.tally div { display: grid; gap: 2px; }
.tally dt {
  font-size: 13px;
  text-transform: uppercase;
  color: var(--text-muted);
}
.tally dd {
  margin: 0;
  font-size: 18px;
  color: var(--text-dim);
}

/* Play again and scores side by side, play the bigger. */
.over-buttons { display: grid; grid-template-columns: 2fr 1fr; gap: 10px; }
.over-buttons .btn + .btn { margin-top: 0; }
.over-buttons .btn-line { padding-inline: 0.5rem; font-size: 0.6rem; }
.game-line {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  font-size: 15px;
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
  /* No hint under the HUD on phones, so cards can sit higher. */
  .overlay { padding-top: 64px; }
  /* The pad has its own play/pause in the middle. */
  .round { width: 40px; height: 40px; }
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

/* ─── Phones (sideways): the board fills the height; the HUD lives in the
   side gutters, in the desktop's chips turned on end. Left: hearts at the
   top, score and multiplier at the bottom. Right: pause and the menu, one
   above the other. Everything a size down. ─── */
.hud-phone {
  top: calc(6px + env(safe-area-inset-top));
  bottom: calc(6px + env(safe-area-inset-bottom));
  left: calc(4px + env(safe-area-inset-left));
  right: calc(4px + env(safe-area-inset-right));
  display: flex;
  justify-content: space-between;
}
.hud-phone .hud-left { flex-direction: column; flex-wrap: nowrap; align-items: stretch; width: 54px; height: 100%; }
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
  gap: 8px;
  padding: 8px 4px;
  border: 3px solid var(--sky);
  background: var(--bg);
  box-shadow: 4px 4px 0 var(--border);
  pointer-events: auto;
}
.hud-phone .hearts { flex-direction: column; align-items: center; gap: 3px; }
.hud-phone .hearts svg { width: 14px; height: 13px; }
.hud-phone .cheat-tag,
.hud-phone .hc-tag { align-self: center; margin: 6px 0; padding: 4px 2px; font-size: 10px; writing-mode: vertical-rl; pointer-events: auto; }
.hud-phone .stat { flex-direction: column; gap: 3px; }
.hud-phone .num { text-align: center; }
.hud-phone .stat .chrome-label { display: block; font-size: 11px; }
.hud-phone .stat b { font-size: 9px; }
.hud-phone .score-num { min-width: 0; }
.hud-phone .effects {
  position: fixed;
  top: calc(8px + env(safe-area-inset-top));
  left: calc(66px + env(safe-area-inset-left));
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  zoom: 0.8;
}
.hud-phone .hud-right { flex-direction: column; align-items: center; width: 54px; gap: 8px; }
.hud-phone .round { width: 40px; height: 40px; }
/* The menu opens to the left of the buttons, a size down, and scrolls if the screen is short. */
.hud-phone .menu {
  top: 0;
  right: calc(100% + 8px);
  max-height: calc(100vh - 20px);
  overflow: auto;
  zoom: 0.7;
}
.hud-phone .menu-item { padding-block: 6px; }
@media (pointer: coarse) and (max-height: 560px) {
  /* Cards sit between the HUD columns, a size down. */
  .overlay { padding: 8px 64px; }
  .overlay > * { zoom: 0.8; }
  .notice.touch, .tier-intro.touch { top: calc(8px + env(safe-area-inset-top)); }
  .tier-intro { zoom: 0.85; }
  .notice { zoom: 0.85; }
}
</style>
