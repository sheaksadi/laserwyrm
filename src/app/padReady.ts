/**
 * Playing from a controller. Browsers only allow full screen and sound
 * after a click, a tap or a key, and a controller's buttons do not count.
 * So when a controller joins, a notice says so, and if the page has not had
 * such a gesture yet it asks for one click. The first click (or key) after a
 * controller is here goes full screen and turns the sound on; from then on
 * the controller alone is enough.
 */
import { ref, watch } from 'vue'
import { pad } from '../gamepad'
import { enterFullscreen } from '../fullscreen'

interface UserActivation { hasBeenActive: boolean }
const userActivation = () => (navigator as Navigator & { userActivation?: UserActivation }).userActivation

/** The page has had a click, tap or key (the browser's own record where it keeps one). */
export const activated = ref(userActivation()?.hasBeenActive ?? false)

/** The notice on show: `ask` when it asks for the click. */
export const padNotice = ref<{ id: number; ask: boolean; seconds: number } | null>(null)
let noticeId = 0
let noticeTimer = 0

watch(
  () => pad.joined,
  () => {
    const ask = !activated.value
    const seconds = ask ? 6 : 2.5
    padNotice.value = { id: ++noticeId, ask, seconds }
    clearTimeout(noticeTimer)
    noticeTimer = window.setTimeout(() => (padNotice.value = null), seconds * 1000)
  },
)

if (typeof window !== 'undefined') {
  // The first gesture with a controller here counts as the one full screen needs, so use it at once:
  // a mouse button going down, a finger lifting, or a key.
  const answer = () => {
    if (!activated.value && pad.connected) {
      enterFullscreen()
      if (padNotice.value?.ask) padNotice.value = null
    }
    activated.value = true
  }
  window.addEventListener('pointerdown', (e) => e.pointerType === 'mouse' && answer(), true)
  window.addEventListener('pointerup', answer, true)
  window.addEventListener('keydown', answer, true)
}
