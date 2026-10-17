/**
 * Controller support, through the browser's Gamepad API (standard mapping).
 *
 * D-pad or left stick steer. A / Cross or the right trigger is the main
 * button: use a power-up mid-game, start or resume otherwise. Start /
 * Options pauses, View / Share opens the cheat menu, B / Circle backs out.
 * Browsers only reveal a controller after its first button press, so it
 * shows up as connected from then on.
 */
import { reactive } from 'vue'
import type { DirName } from './game'

export type PadKind = 'xbox' | 'playstation'

export const pad = reactive({
  connected: false,
  kind: 'xbox' as PadKind,
  /** Bumped when a controller connects, so the view can say so once. */
  joined: 0,
})

export interface PadHandlers {
  turn: (dir: DirName) => void
  /** A / Cross, or the right trigger. */
  primary: () => void
  /** Start / Options. */
  start: () => void
  /** View / Share. */
  back: () => void
  /** B / Circle. */
  cancel: () => void
}

/** Standard-mapping button indices. */
const BUTTON = { a: 0, b: 1, rt: 7, back: 8, start: 9, up: 12, down: 13, left: 14, right: 15 } as const
const STICK_DEADZONE = 0.5
const TRIGGER_DOWN = 0.5

const kindOf = (id: string): PadKind =>
  /sony|playstation|dualshock|dualsense|054c/i.test(id) ? 'playstation' : 'xbox'

let handlers: PadHandlers | null = null
let frame = 0
/** Which buttons were down last frame, for press edges. */
let held = new Set<number>()
let stickDir: DirName | null = null

function firstPad(): Gamepad | null {
  for (const gp of navigator.getGamepads?.() ?? []) if (gp?.connected) return gp
  return null
}

function poll() {
  frame = requestAnimationFrame(poll)
  const gp = firstPad()
  if (!gp || !handlers) return

  const down = new Set<number>()
  gp.buttons.forEach((button, i) => {
    if (button.pressed || button.value > TRIGGER_DOWN) down.add(i)
  })
  const before = held
  const pressed = (i: number) => down.has(i) && !before.has(i)
  held = down

  if (pressed(BUTTON.up)) handlers.turn('up')
  if (pressed(BUTTON.down)) handlers.turn('down')
  if (pressed(BUTTON.left)) handlers.turn('left')
  if (pressed(BUTTON.right)) handlers.turn('right')
  if (pressed(BUTTON.a) || pressed(BUTTON.rt)) handlers.primary()
  if (pressed(BUTTON.start)) handlers.start()
  if (pressed(BUTTON.back)) handlers.back()
  if (pressed(BUTTON.b)) handlers.cancel()

  // The stick turns once each time it is pushed a new way, like a d-pad press.
  const [x = 0, y = 0] = gp.axes
  let dir: DirName | null = null
  if (Math.max(Math.abs(x), Math.abs(y)) > STICK_DEADZONE) {
    dir = Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : y > 0 ? 'down' : 'up'
  }
  if (dir && dir !== stickDir) handlers.turn(dir)
  stickDir = dir
}

function refresh() {
  const gp = firstPad()
  pad.connected = !!gp
  if (gp) pad.kind = kindOf(gp.id)
}

function onConnect() {
  refresh()
  pad.joined++
}

/** A short buzz, if the controller can. */
export function rumble(ms = 120, strength = 0.6) {
  const gp = firstPad()
  void gp?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength })?.catch(() => {})
}

export function startGamepad(next: PadHandlers) {
  handlers = next
  window.addEventListener('gamepadconnected', onConnect)
  window.addEventListener('gamepaddisconnected', refresh)
  refresh()
  frame = requestAnimationFrame(poll)
}

export function stopGamepad() {
  handlers = null
  window.removeEventListener('gamepadconnected', onConnect)
  window.removeEventListener('gamepaddisconnected', refresh)
  cancelAnimationFrame(frame)
}
