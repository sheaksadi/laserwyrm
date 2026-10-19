/**
 * Which board renderer draws the game: the SVG board (one element per thing
 * on the board, the browser draws it), or the canvas board (one canvas,
 * redrawn every frame). Chosen in Settings and kept on this device.
 *
 * The canvas board draws the game's SVG art (items, power-ups, hats) with
 * HTML-in-Canvas where the browser has it: the art stays real elements
 * inside the canvas and `drawElementImage` paints them in. Elsewhere it
 * draws the same art from images made once.
 */
import { ref, watch } from 'vue'

export type Renderer = 'svg' | 'canvas'
const KEY = 'laserwyrm-renderer'

function read(): Renderer {
  try {
    return localStorage.getItem(KEY) === 'canvas' ? 'canvas' : 'svg'
  } catch {
    return 'svg'
  }
}

export const renderer = ref<Renderer>(read())
watch(renderer, (v) => {
  try {
    localStorage.setItem(KEY, v)
  } catch {
    /* storage blocked: the choice lasts this visit */
  }
})

/** The browser can draw elements into a 2D canvas (HTML-in-Canvas; Chromium behind a flag, for now). */
export const htmlInCanvas =
  typeof CanvasRenderingContext2D !== 'undefined' && 'drawElementImage' in CanvasRenderingContext2D.prototype
