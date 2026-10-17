/**
 * Full screen while playing. The game goes full screen when play starts and
 * stays there through pauses and game over; the player leaves from the pause
 * screen (its button, or Esc). In full screen the page asks to keep Esc for
 * itself (Keyboard Lock, Chromium only), so Esc mid-game pauses instead of
 * dropping out; elsewhere the browser takes Esc and the game pauses with it.
 * Browsers only allow full screen right after a click, key or tap, so a start
 * from a controller may stay windowed; that fails quietly. Phones that cannot
 * do it (iPhone Safari) skip it too.
 */
import { ref, watch } from 'vue'

const KEY = 'laserwyrm-fullscreen'

function readOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0'
  } catch {
    return true
  }
}

/** The player's switch, in the menu. On unless turned off. */
export const fullscreenOn = ref(readOn())
watch(fullscreenOn, (value) => {
  try {
    localStorage.setItem(KEY, value ? '1' : '0')
  } catch {
    /* storage blocked: the switch still works for this visit */
  }
  if (!value) leaveFullscreen()
})

/** True while the page is full screen. */
export const isFullscreen = ref(false)

export const canFullscreen = () => typeof document !== 'undefined' && !!document.documentElement.requestFullscreen

interface KeyboardLock {
  lock?: (keys: string[]) => Promise<void>
  unlock?: () => void
}
const keyboard = () => (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard

export function enterFullscreen(force = false) {
  if ((!fullscreenOn.value && !force) || !canFullscreen() || document.fullscreenElement) return
  document.documentElement
    .requestFullscreen({ navigationUI: 'hide' })
    .then(() => {
      void keyboard()?.lock?.(['Escape'])
      // Phones play sideways; where the browser allows, hold it there.
      if (window.matchMedia('(pointer: coarse)').matches) {
        const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
        orientation.lock?.('landscape').catch(() => {})
      }
    })
    .catch(() => {})
}

export function leaveFullscreen() {
  keyboard()?.unlock?.()
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
}

/** Calls `onLeft` when full screen ends from outside the game, e.g. the browser's own Esc. */
export function watchFullscreen(onEnter: () => void, onLeft: () => void) {
  const handler = () => {
    const now = !!document.fullscreenElement
    if (now === isFullscreen.value) return
    isFullscreen.value = now
    if (now) onEnter()
    else onLeft()
  }
  document.addEventListener('fullscreenchange', handler)
  return () => document.removeEventListener('fullscreenchange', handler)
}
