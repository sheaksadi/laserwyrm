/**
 * The app shell's state: which panel or card is open, and the actions that
 * open and close them. One panel shows at a time (App.vue picks it); most
 * pause the game while open.
 */
import { computed, reactive, ref } from 'vue'
import { conductor, musicOn, muted } from '../audio'
import { demo, pause, play, reset, setMode, state, turn, type DirName, type Mode } from '../game'
import { library, setCustom, stopShared } from '../design'
import { enterFullscreen, isFullscreen, leaveFullscreen } from '../fullscreen'
import { createRoom, leaveRoom, mp } from '../multiplayer'

export type SettingsTab = 'sound' | 'controls' | 'display' | 'cheats' | 'about'

export const ui = reactive({
  /** The hamburger menu on the right holds music, sound and restart. */
  menuOpen: false,
  /** Account, from the menu or the start card. */
  accountOpen: false,
  /** Settings, from the menu, the start card or the pause card. */
  settingsOpen: false,
  /** Which settings tab shows. */
  settingsTab: 'sound' as SettingsTab,
  /** The workshop (cheats and the editor), from the custom screen; C or Escape closes it. */
  cheatOpen: false,
  /** Which workshop tab opens first: cheats from C, the level editor from custom play. */
  cheatTab: 'cheats' as 'cheats' | 'global' | 'levels',
  /** AI agents (☰ → AI agent): connect one to edit your custom games over MCP. */
  agentOpen: false,
  /** Multiplayer: the start screen's button, an invite from the custom screen, or a #/mp/123456 link. */
  mpOpen: false,
  /** In a match, Esc shows a way out (the game plays on: nobody pauses in multiplayer). */
  mpMenu: false,
  /** Custom play: the start screen's Custom button. */
  customOpen: false,
  /**
   * The briefing between Press start and the first move: how to play, with
   * warm-up music. Any key, click, tap or A starts; Esc or B goes back.
   */
  briefing: null as Mode | null,
})

/** Where the game is, as the screens see it: the start screen's backdrop game counts as ready. */
export const status = computed(() => (demo.on ? 'ready' : state.status))

/** The start screen's splash line, Minecraft style: one picked at random each time it shows. */
export const SPLASHES = [
  'Snake-2 Electric Bogaloooo',
  'Snake Jazz! Ba-dum tss-ss-ss',
  'Runs on a Nokia 3310. Probably.',
  'Now with 100% more lasers!',
  'Hiss to the beat!',
  "Don't bite yourself!",
  'Sssssynthwave!',
]
export const splash = ref(SPLASHES[0]!)

/** The custom game this device plays, for the start card. */
export const activeGameName = computed(() => library.games.find((game) => game.id === library.active)?.name ?? 'yours')

export function toggleMute() {
  muted.value = !muted.value
}
export function toggleMusic() {
  musicOn.value = !musicOn.value
}

export function restart() {
  ui.menuOpen = false
  reset()
}

export function openAccount() {
  ui.menuOpen = false
  ui.accountOpen = true
  pause()
}

export function openBriefing(mode: Mode) {
  setMode(mode)
  ui.briefing = mode
  conductor.warmup()
}
export function begin(dir?: DirName) {
  if (!ui.briefing) return
  ui.briefing = null
  play()
  if (dir) turn(dir)
}
export function closeBriefing() {
  ui.briefing = null
  conductor.stop()
}

export function openSettings(tab?: SettingsTab) {
  ui.menuOpen = false
  if (tab) ui.settingsTab = tab
  ui.settingsOpen = true
  pause()
}

export function openAgent() {
  ui.menuOpen = false
  ui.agentOpen = true
  pause()
}

export function openMultiplayer(inviteGame?: string) {
  ui.menuOpen = false
  ui.customOpen = false
  ui.mpOpen = true
  if (inviteGame && mp.phase === 'off') void createRoom(inviteGame)
}
export function leaveMatch() {
  leaveRoom()
  ui.mpOpen = false
}

export function openCustom() {
  ui.menuOpen = false
  ui.cheatOpen = false
  ui.customOpen = true
  pause()
}
/** Play this device's own design, from its how-to-play. */
export function playCustom() {
  ui.customOpen = false
  stopShared()
  setCustom(true)
  reset()
  openBriefing('normal')
}
/** The level editor, from the custom screen or the pause screen. */
export function openEditor() {
  ui.customOpen = false
  ui.cheatTab = 'levels'
  ui.cheatOpen = true
  ui.menuOpen = false
  pause()
}

/** Leave the run for the start screen. */
export function toMainMenu() {
  ui.briefing = null
  reset()
}
/** Back to the stock game. */
export function playNormal() {
  ui.customOpen = false
  setCustom(false)
  reset()
}

export function toggleFullscreen() {
  if (isFullscreen.value) leaveFullscreen()
  else enterFullscreen(true)
}
