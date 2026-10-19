/**
 * Moving through menus with a controller. On any screen with buttons (the
 * start screen, pause, game over, settings, the editor…), the D-pad or
 * stick moves a highlight to the nearest button that way, A presses it, and
 * B goes back (handled by the game). The highlight is the browser's focus,
 * drawn big and bright while a controller is in use (`pad-on` on <html>).
 */
import type { DirName } from './game'

/** What the highlight can land on; `tabindex="-1"` keeps a button out of it. */
const FOCUSABLE = ':is(button:not([disabled]), a[href], input:not([disabled]), textarea, select, [tabindex]):not([tabindex="-1"])'

/** Where the buttons are: the ☰ menu if it is open, else the screen on top, else nothing. */
export function navScope(): HTMLElement | null {
  const menu = document.querySelector<HTMLElement>('.menu[role="menu"]')
  if (menu) return menu
  const overlays = document.querySelectorAll<HTMLElement>('.overlay')
  // While a screen fades out the next one is already there: the last one is on top.
  for (let i = overlays.length - 1; i >= 0; i--) {
    const o = overlays[i]!
    if (!o.className.includes('leave')) return o
  }
  return null
}

function visible(el: HTMLElement) {
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'
}

function targets(scope: HTMLElement) {
  return [...scope.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(visible)
}

function focus(el: HTMLElement) {
  el.focus({ preventScroll: true })
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

/** Highlight the screen's main button (marked `data-nav-first`, else the first that is not its ✕), unless something there already is. */
export function navFocusFirst() {
  const scope = navScope()
  if (!scope || scope.contains(document.activeElement)) return
  const all = targets(scope)
  const first = all.find((el) => el.hasAttribute('data-nav-first')) ?? all.find((el) => !el.classList.contains('close')) ?? all[0]
  if (first) focus(first)
}

/** Move the highlight to the nearest button in a direction. */
export function navMove(dir: DirName) {
  const scope = navScope()
  if (!scope) return
  const all = targets(scope)
  const current = document.activeElement as HTMLElement | null
  if (!current || !scope.contains(current)) {
    if (all[0]) focus(all[0])
    return
  }
  const from = current.getBoundingClientRect()
  const fx = from.left + from.width / 2
  const fy = from.top + from.height / 2
  // Buttons in line with this one (overlapping across the move) come first;
  // only when there are none does the nearest one off to the side count.
  let inLine: [HTMLElement, number] | null = null
  let nearest: [HTMLElement, number] | null = null
  const vertical = dir === 'up' || dir === 'down'
  for (const el of all) {
    if (el === current) continue
    const r = el.getBoundingClientRect()
    const dx = r.left + r.width / 2 - fx
    const dy = r.top + r.height / 2 - fy
    const ahead = dir === 'up' ? -dy : dir === 'down' ? dy : dir === 'left' ? -dx : dx
    if (ahead <= 4) continue
    const overlaps = vertical ? r.left < from.right && r.right > from.left : r.top < from.bottom && r.bottom > from.top
    if (overlaps && (!inLine || ahead < inLine[1])) inLine = [el, ahead]
    const score = ahead + (vertical ? Math.abs(dx) : Math.abs(dy)) * 2
    if (!nearest || score < nearest[1]) nearest = [el, score]
  }
  const best = (inLine ?? nearest)?.[0]
  if (best) focus(best)
}

/** Press the highlighted button. False when nothing on this screen is highlighted. */
export function navPress(): boolean {
  const scope = navScope()
  const current = document.activeElement as HTMLElement | null
  if (!scope || !current || !scope.contains(current)) return false
  current.click()
  return true
}
