/**
 * The canvas board's icons: the game's own SVG art (items, power-ups,
 * hats), kept as real elements inside the canvas. With HTML-in-Canvas the
 * browser lays them out and `drawElementImage` paints them straight in;
 * without it, each one is turned into an image once (per size) and drawn
 * from that.
 */
import { htmlInCanvas } from '../renderer'

/** An icon's box around its anchor, in board cells: x, y, width, height. */
export type Box = [number, number, number, number]
export const ITEM_BOX: Box = [-0.5, -0.5, 1, 1]
/** Hats rise well above the head; the wizard's and the party hat's tips reach about 1.2 cells up. */
export const HAT_BOX: Box = [-0.8, -1.35, 1.6, 1.6]

/** The icon elements in the canvas, by key (set by the board as they mount). */
const elements = new Map<string, Element>()
/** Images made from them, when the browser cannot draw elements: by key, with the size they were made at. */
const images = new Map<string, { img: HTMLImageElement; size: number; ready: boolean }>()

export function registerIcon(key: string, el: Element | null) {
  if (el) elements.set(key, el)
  else {
    elements.delete(key)
    images.delete(key)
  }
}

/** The palette, written into each image so `var(--coral)` and friends still mean something outside the page. */
let palette = ''
function paletteCss() {
  if (palette) return palette
  const style = getComputedStyle(document.documentElement)
  const names = ['--coral', '--mint', '--sky', '--rose', '--sun', '--lavender', '--peach', '--sage', '--ink', '--text', '--text-dim', '--text-muted', '--border', '--bg', '--bg-off', '--bg-warm']
  palette = `svg{${names.map((n) => `${n}:${style.getPropertyValue(n).trim()}`).join(';')}}`
  return palette
}

function imageFor(key: string, el: Element, size: number) {
  const have = images.get(key)
  if (have && have.size === size) return have
  const svg = el.cloneNode(true) as SVGSVGElement
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  // Drawn at the canvas's own pixel size, so it stays crisp.
  const [w, h] = [Number(el.getAttribute('data-w')), Number(el.getAttribute('data-h'))]
  svg.setAttribute('width', String(Math.max(1, Math.round(w * size))))
  svg.setAttribute('height', String(Math.max(1, Math.round(h * size))))
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
  style.textContent = paletteCss()
  svg.prepend(style)
  const img = new Image()
  const entry = { img, size, ready: false }
  img.onload = () => (entry.ready = true)
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`
  images.set(key, entry)
  return entry
}

/**
 * Draw an icon with its box placed in the current (cell-unit) transform.
 * `pxPerCell` is the device pixels one cell covers, for the image fallback.
 */
export function drawIcon(ctx: CanvasRenderingContext2D, key: string, box: Box, pxPerCell: number) {
  const el = elements.get(key)
  if (!el) return
  const [x, y, w, h] = box
  if (htmlInCanvas) {
    try {
      ;(ctx as CanvasRenderingContext2D & { drawElementImage(el: Element, x: number, y: number, w: number, h: number): unknown }).drawElementImage(el, x, y, w, h)
    } catch {
      /* not laid out yet: it shows from the next frame */
    }
    return
  }
  const entry = imageFor(key, el, Math.ceil(pxPerCell))
  if (entry.ready) ctx.drawImage(entry.img, x, y, w, h)
}
