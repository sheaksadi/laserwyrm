/**
 * Full screen while playing. The game goes full screen when play starts and
 * stays there through pauses and game over; the player leaves from the pause
 * screen (its button, or Esc). In full screen the page asks to keep Esc for
 * itself (Keyboard Lock, Chromium only), so Esc mid-game pauses instead of
 * dropping out; elsewhere the browser takes Esc and the game pauses with it.
 * Browsers only allow full screen right after a click, key or the end of a
 * tap; a game started from a controller, or on a finger going down, is
 * refused. Then it stays wanted, and the next tap, click or key anywhere
 * goes full screen. Phones that cannot do it (iPhone Safari) skip it.
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
/** Full screen was asked for but the browser said not yet: the next tap, click or key will do it. */
export const fullscreenPending = ref(false)

export const canFullscreen = () => typeof document !== 'undefined' && !!document.documentElement.requestFullscreen

interface KeyboardLock {
  lock?: (keys: string[]) => Promise<void>
  unlock?: () => void
}
const keyboard = () => (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard

/** A request is on its way: one gesture fires several events, and only one should ask. */
let asking = false

export function enterFullscreen(force = false) {
  if ((!fullscreenOn.value && !force) || !canFullscreen() || document.fullscreenElement || asking) return
  asking = true
  document.documentElement
    .requestFullscreen({ navigationUI: 'hide' })
    .then(() => {
      asking = false
      fullscreenPending.value = false
      void keyboard()?.lock?.(['Escape'])
      // Phones play sideways; where the browser allows, hold it there.
      if (window.matchMedia('(pointer: coarse)').matches) {
        const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
        orientation.lock?.('landscape').catch(() => {})
      }
    })
    .catch(() => {
      asking = false
      if (!document.fullscreenElement) fullscreenPending.value = true
    })
}

// The next gesture the browser counts (a tap ending, a click, a key) takes the pending full screen.
if (typeof window !== 'undefined') {
  const retry = () => {
    if (fullscreenPending.value && fullscreenOn.value && !document.fullscreenElement) enterFullscreen()
  }
  for (const type of ['pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(type, retry, true)
}

export function leaveFullscreen() {
  fullscreenPending.value = false
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
