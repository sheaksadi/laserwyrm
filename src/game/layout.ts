/**
 * Where the board sits on screen: insets for the HUD, and phones' sideways
 * layout. The grid itself is always GRID (see catalog.ts).
 */
import { reactive } from 'vue'
import { GRID } from './catalog'
import { state } from './state'

/** Phones and tablets get on-screen controls, so the board makes room for them. */
export const isTouch = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window)

/**
 * Where the board sits, in px from each window edge. The HUD band is on top
 * (with room under it for the power-up hint on desktop). Phones play
 * sideways with the HUD and controls laid faintly over the board, so the
 * board takes the whole screen; held upright, the view asks to be turned.
 */
export function arenaInsets() {
  const w = window.innerWidth
  const h = window.innerHeight
  if (!isTouch()) return { top: 90, right: 12, bottom: 12, left: 12, pad: 'none' as 'none' | 'sticks', portrait: false }
  // The board fills the height; the HUD sits in narrow gutters either side, the controls lie faintly over the board.
  return { top: 4, right: 48, bottom: 4, left: 48, pad: 'sticks' as 'none' | 'sticks', portrait: h > w }
}

export const layout = reactive(arenaInsets())

/** Keep the board and pad placement in step with the window. */
export function fitLayout() {
  Object.assign(layout, arenaInsets())
}

/** Every screen plays the same board; this sets it and the layout. */
export function fitGrid() {
  fitLayout()
  state.cols = GRID.cols
  state.rows = GRID.rows
}
