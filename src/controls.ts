/**
 * How phones steer: a D-pad in the corner (tap a direction, or hold and
 * slide across it), or a stick that appears wherever the left thumb lands.
 * Chosen in Settings and kept on this device.
 */
import { ref, watch } from 'vue'

export type TouchControls = 'dpad' | 'stick'
const KEY = 'laserwyrm-touch-controls'

function read(): TouchControls {
  try {
    return localStorage.getItem(KEY) === 'stick' ? 'stick' : 'dpad'
  } catch {
    return 'dpad'
  }
}

export const touchControls = ref<TouchControls>(read())
watch(touchControls, (v) => {
  try {
    localStorage.setItem(KEY, v)
  } catch {
    /* storage blocked: the choice lasts this visit */
  }
})
