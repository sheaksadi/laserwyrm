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

export type SettingsTab = 'sound' | 'controls' | 'display' | 'account' | 'cheats' | 'about'
export type WorkshopTab = 'cheats' | 'global' | 'levels' | 'music' | 'art'

export const ui = reactive({
  /** The hamburger menu on the right holds music, sound and restart. */
  menuOpen: false,
  /** Settings, from the menu, the start card or the pause card. */
  settingsOpen: false,
  /** Which settings tab shows. */
  settingsTab: 'sound' as SettingsTab,
  /** The workshop (the custom game's editor): E, the custom screen or the pause card; E or Escape closes it. */
  cheatOpen: false,
  /**
   * Where the editor was left, so opening it again comes back there: its
   * tab, the level picked, and that level's own tab.
   */
  editor: { view: 'levels' as WorkshopTab, level: null as number | null, levelTab: 'pacing' },
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

/** The account lives in Settings: every Account button opens that tab. */
export function openAccount() {
  openSettings('account')
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
/** The editor, from E, the custom screen or the pause screen: back where it was left. */
export function openEditor() {
  ui.customOpen = false
  ui.settingsOpen = false
  ui.cheatOpen = true
  ui.menuOpen = false
  pause()
}
/** E: the editor, or out of it. */
export function toggleEditor() {
  if (ui.cheatOpen) ui.cheatOpen = false
  else openEditor()
}
/** C: Settings → Cheats, or out of it. */
export function toggleCheats() {
  if (ui.settingsOpen && ui.settingsTab === 'cheats') ui.settingsOpen = false
  else {
    ui.cheatOpen = false
    ui.customOpen = false
    openSettings('cheats')
  }
}
/**
 * A cheat that means "take me there": do it, close Settings and play on
 * (from the start screen, a fresh run; after game over, a new one first).
 */
export function cheatThenPlay(cheat: () => void) {
  if (state.status === 'over') reset()
  cheat()
  ui.settingsOpen = false
  ui.briefing = null
  play()
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
