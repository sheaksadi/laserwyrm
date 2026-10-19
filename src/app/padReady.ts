/**
 * Playing from a controller. Browsers only allow full screen and sound
 * after a click, a tap or a key, and a controller's buttons do not count.
 * So when a controller connects before the page has had any of those, a
 * card asks for one click: that click goes full screen and turns the sound
 * on, and from then on the controller alone is enough. A or B on the
 * controller skips it (the game then plays windowed, silent until a click).
 */
import { computed, ref } from 'vue'
import { pad } from '../gamepad'
import { enterFullscreen } from '../fullscreen'

interface UserActivation { hasBeenActive: boolean }
const userActivation = () => (navigator as Navigator & { userActivation?: UserActivation }).userActivation

/** The page has had a click, tap or key (the browser's own record where it keeps one). */
export const activated = ref(userActivation()?.hasBeenActive ?? false)
/** Skipped with the controller: do not ask again this visit. */
export const padPromptSkipped = ref(false)

/** Show the card: a controller is here and the browser has not yet let the game go full screen or make sound. */
export const padPrompt = computed(() => pad.connected && !activated.value && !padPromptSkipped.value)

export function skipPadPrompt() {
  padPromptSkipped.value = true
}

if (typeof window !== 'undefined') {
  // The gesture that answers the card counts as the one full screen needs, so use it at once:
  // a mouse button going down, a finger lifting, or a key.
  const answer = () => {
    if (padPrompt.value) enterFullscreen()
    activated.value = true
  }
  window.addEventListener('pointerdown', (e) => e.pointerType === 'mouse' && answer(), true)
  window.addEventListener('pointerup', answer, true)
  window.addEventListener('keydown', answer, true)
}
