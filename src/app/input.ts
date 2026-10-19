/**
 * Input for the whole app: the keyboard, swipes on touch screens, and the
 * controller's buttons. What a key does depends on what is open: a panel
 * gets Escape, a replay gets the seek keys, the game gets the rest.
 */
import { match, pause, play, reset, toggle, turn, useItem, type DirName } from '../game'
import { leaveFullscreen } from '../fullscreen'
import { navMove, navPress, navScope } from '../menuNav'
import { mp } from '../multiplayer'
import { seekBy, togglePlay } from '../replayPlayer'
import { go, route } from './route'
import { begin, closeBriefing, openCustom, status, toggleMusic, toggleMute, toMainMenu, ui } from './ui'

export const KEYMAP: Record<string, DirName> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right',
  W: 'up', S: 'down', A: 'left', D: 'right',
}

export function onKey(event: KeyboardEvent) {
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
  // Multiplayer: Esc leaves the lobby, or in a match shows the way out.
  if (match.on && mp.phase === 'playing' && event.key === 'Escape') {
    ui.mpMenu = !ui.mpMenu
    return
  }
  if (mp.phase !== 'off' && mp.phase !== 'playing' || ui.mpOpen && mp.phase === 'off') {
    if (event.key === 'Escape' && mp.phase === 'off') ui.mpOpen = false
    return
  }
  if (ui.accountOpen) {
    if (event.key === 'Escape') ui.accountOpen = false
    return
  }
  if (ui.settingsOpen) {
    if (event.key === 'Escape') ui.settingsOpen = false
    return
  }
  if (ui.agentOpen) {
    if (event.key === 'Escape' && !document.activeElement?.matches('input:not([type=range]), textarea')) ui.agentOpen = false
    return
  }
  if (ui.customOpen) {
    // Typing in the search or share box: the keys are text.
    if (document.activeElement?.matches('input:not([type=range]), textarea')) return
    if (event.key === 'Escape' || event.key === 'c' || event.key === 'C') ui.customOpen = false
    return
  }
  if (ui.briefing && status.value === 'ready' && !ui.accountOpen && !ui.cheatOpen) {
    event.preventDefault()
    if (event.key === 'Escape') closeBriefing()
    else begin(KEYMAP[event.key])
    return
  }
  // Typing a level name or a share code in the cheat menu: the keys are text.
  if (ui.cheatOpen && document.activeElement?.matches('input:not([type=range]), textarea')) return
  if (event.key === 'c' || event.key === 'C') return ui.cheatOpen ? (ui.cheatOpen = false) : openCustom()
  if (ui.cheatOpen) {
    if (event.key === 'Escape') ui.cheatOpen = false
    return
  }
  const dir = KEYMAP[event.key]
  if (dir) {
    event.preventDefault()
    turn(dir)
  } else if (event.key === ' ') {
    // Mid-game Space uses a held pill; otherwise it starts or resumes.
    event.preventDefault()
    if (status.value === 'running') useItem()
    else toggle()
  } else if (event.key === 'Enter') {
    event.preventDefault()
    toggle()
  } else if (event.key === 'Escape' && status.value !== 'running' && !ui.menuOpen) {
    // Mid-game Esc pauses; on the pause screen it leaves full screen.
    leaveFullscreen()
  } else if (event.key === 'Escape' || event.key === 'p' || event.key === 'P') {
    ui.menuOpen = false
    pause()
  } else if (event.key === 'r' || event.key === 'R') {
    reset()
  } else if (event.key === 'm' || event.key === 'M') {
    toggleMute()
  } else if (event.key === 'b' || event.key === 'B') {
    toggleMusic()
  }
}

/* ─── Swipes ─── */
let touchStart: { x: number; y: number } | null = null
export function onTouchStart(event: TouchEvent) {
  const touch = event.touches[0]
  if (touch) touchStart = { x: touch.clientX, y: touch.clientY }
}
export function onTouchMove(event: TouchEvent) {
  const touch = event.touches[0]
  if (!touch || !touchStart) return
  const dx = touch.clientX - touchStart.x
  const dy = touch.clientY - touchStart.y
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return
  turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up')
  // Keep swiping in one gesture: each 22px is a fresh turn.
  touchStart = { x: touch.clientX, y: touch.clientY }
}

/* ─── Controller ─── */
const typing = () => document.activeElement instanceof HTMLInputElement
export const padHandlers = {
  turn: (dir: DirName) => {
    if (ui.briefing) return begin(dir)
    if (route.value.name === 'watch' && (dir === 'left' || dir === 'right')) seekBy(dir === 'left' ? -36 : 36)
    // On a screen with buttons, the pad moves the highlight between them.
    else if (navScope()) navMove(dir)
    else if (route.value.name === 'game' && !ui.cheatOpen) turn(dir)
  },
  primary: () => {
    if (ui.briefing) return begin()
    if (navPress()) return
    if (route.value.name === 'watch') return togglePlay()
    if (route.value.name === 'scores' || route.value.name === 'replays') return go('#/')
    if (ui.cheatOpen || typing()) return
    if (status.value === 'running') useItem()
    else play()
  },
  start: () => {
    if (match.on && mp.phase === 'playing') return (ui.mpMenu = !ui.mpMenu)
    if (ui.briefing) return begin()
    if (ui.cheatOpen) ui.cheatOpen = false
    else toggle()
  },
  back: () => {
    if (route.value.name !== 'game') return
    if (ui.customOpen) ui.customOpen = false
    else if (ui.cheatOpen) ui.cheatOpen = false
    else openCustom()
  },
  // B is back: out of whatever is open, one layer at a time. In play it pauses; on the pause screen, back into the game.
  cancel: () => {
    const r = route.value
    if (r.name === 'watch') return go('code' in r ? '#/replays' : '#/scores')
    if (r.name === 'scores' || r.name === 'replays') return go('#/')
    if (ui.menuOpen) return (ui.menuOpen = false)
    if (match.on && mp.phase === 'playing') return (ui.mpMenu = !ui.mpMenu)
    if (ui.mpOpen && mp.phase === 'off') return (ui.mpOpen = false)
    if (ui.accountOpen) return (ui.accountOpen = false)
    if (ui.settingsOpen) return (ui.settingsOpen = false)
    if (ui.customOpen) return (ui.customOpen = false)
    if (ui.agentOpen) return (ui.agentOpen = false)
    if (ui.cheatOpen) return (ui.cheatOpen = false)
    if (ui.briefing) return closeBriefing()
    if (status.value === 'running') pause()
    else if (status.value === 'paused') play()
    else if (status.value === 'over') toMainMenu()
  },
}
