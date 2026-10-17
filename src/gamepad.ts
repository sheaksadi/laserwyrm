/**
 * Controller support, through the browser's Gamepad API (standard mapping).
 *
 * D-pad or left stick steer. A / Cross or the right trigger is the main
 * button: use a power-up mid-game, start or resume otherwise. Start /
 * Options pauses, View / Share opens the cheat menu, B / Circle backs out.
 * Browsers only reveal a controller after its first button press, so it
 * shows up as connected from then on.
 */
import { reactive, ref, watch } from 'vue'
import type { DirName, Feel } from './game'

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

/* ─── Rumble ─── */

function readPref<T>(key: string, fallback: T, parse: (v: string) => T | null): T {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : (parse(raw) ?? fallback)
  } catch {
    return fallback
  }
}
function savePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* storage blocked: the setting still works for this visit */
  }
}

/** Settings: rumble on or off, and how strong, 0.2 to 1. */
export const vibrationOn = ref(readPref('laserwyrm-vibration', true, (v) => v === '1'))
export const vibrationStrength = ref(
  readPref('laserwyrm-vibration-strength', 0.8, (v) => (Number(v) >= 0.2 && Number(v) <= 1 ? Number(v) : null)),
)
watch(vibrationOn, (v) => savePref('laserwyrm-vibration', v ? '1' : '0'))
watch(vibrationStrength, (v) => savePref('laserwyrm-vibration-strength', String(v)))

/** One buzz: when (ms after the first), how long, heavy motor, light motor. */
type Pulse = [delay: number, ms: number, strong: number, weak: number]

/**
 * How each moment should feel. Small things tick on the light motor; hurt is
 * a heavy thump and an echo; a cut grows with the cells lost and crumbles if
 * it was big; game over is a long heavy hit that fades; the totem rises.
 */
function pattern(kind: Feel, amount: number): Pulse[] {
  switch (kind) {
    case 'eat':
      return [[0, 25 + amount * 6, 0, 0.12 + amount * 0.04]]
    case 'block':
      return [[0, 60, 0.1, 0.5]]
    case 'level':
      return [[0, 60, 0, 0.35], [110, 60, 0, 0.45]]
    case 'cut': {
      const power = Math.min(1, 0.3 + amount * 0.035)
      const ms = Math.min(320, 90 + amount * 12)
      const pulses: Pulse[] = [[0, ms, power, power * 0.7]]
      if (amount >= 8) pulses.push([ms + 40, 140, power * 0.5, power * 0.45])
      return pulses
    }
    case 'hurt': {
      const pulses: Pulse[] = [[0, 180, 0.85, 0.6], [240, 140, 0.5, 0.35]]
      // One heart left: a third, warning tap.
      if (amount <= 1) pulses.push([460, 90, 0.4, 0.2])
      return pulses
    }
    case 'die':
      return [[0, 350, 1, 1], [420, 250, 0.7, 0.6], [740, 400, 0.4, 0.3]]
    case 'revive':
      return [[0, 90, 0.2, 0.3], [140, 90, 0.45, 0.5], [280, 260, 0.9, 0.8]]
  }
}

/** Heavier moments are not cut short by lighter ones. */
const PRIORITY: Record<Feel, number> = { eat: 0, block: 1, level: 1, cut: 2, hurt: 3, revive: 4, die: 5 }
let pending: number[] = []
let playing = { priority: -1, until: 0 }

/** Play the feel of a moment on the controller, if there is one and rumble is on. A new moment replaces the last. */
export function rumbleFor(kind: Feel, amount = 1, force = false) {
  const gp = firstPad()
  const actuator = gp?.vibrationActuator
  if (!actuator?.playEffect || (!vibrationOn.value && !force)) return
  const now = performance.now()
  if (now < playing.until && PRIORITY[kind] < playing.priority) return
  for (const id of pending) clearTimeout(id)
  pending = []
  const pulses = pattern(kind, amount)
  playing = { priority: PRIORITY[kind], until: now + Math.max(...pulses.map(([d, ms]) => d + ms)) }
  const k = vibrationStrength.value
  for (const [delay, ms, strong, weak] of pulses) {
    const fire = () =>
      void actuator
        .playEffect('dual-rumble', { duration: ms, strongMagnitude: Math.min(1, strong * k), weakMagnitude: Math.min(1, weak * k) })
        .catch(() => {})
    if (delay) pending.push(window.setTimeout(fire, delay))
    else fire()
  }
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
