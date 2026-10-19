/**
 * The keyboard's bindings: which keys do what, two keys per action, kept on
 * this device and changed in Settings → Controls. Esc (back, pause) and
 * Enter (start or resume) stay as they are, since every screen relies on
 * them.
 */
import { reactive, watch } from 'vue'
import type { DirName } from './game'

export type Action = 'up' | 'down' | 'left' | 'right' | 'use' | 'pause' | 'restart' | 'mute' | 'music' | 'cheats' | 'editor'

export const ACTIONS: { id: Action; name: string }[] = [
  { id: 'up', name: 'Up' },
  { id: 'down', name: 'Down' },
  { id: 'left', name: 'Left' },
  { id: 'right', name: 'Right' },
  { id: 'use', name: 'Dash · start' },
  { id: 'pause', name: 'Pause' },
  { id: 'restart', name: 'Restart' },
  { id: 'mute', name: 'Sound on or off' },
  { id: 'music', name: 'Music on or off' },
  { id: 'cheats', name: 'Cheats' },
  { id: 'editor', name: 'Editor' },
]

const DEFAULTS: Record<Action, string[]> = {
  up: ['ArrowUp', 'w'],
  down: ['ArrowDown', 's'],
  left: ['ArrowLeft', 'a'],
  right: ['ArrowRight', 'd'],
  use: [' ', ''],
  pause: ['p', ''],
  restart: ['r', ''],
  mute: ['m', ''],
  music: ['b', ''],
  cheats: ['c', ''],
  editor: ['e', ''],
}
/** Keys that cannot be bound: they mean back, and start or resume, everywhere. */
export const FIXED = new Set(['Escape', 'Enter', 'Tab'])

const KEY = 'laserwyrm-keys'
const copy = (b: Record<Action, string[]>) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, [...v]])) as Record<Action, string[]>

function load(): Record<Action, string[]> {
  const out = copy(DEFAULTS)
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Record<Action, string[]>>
    for (const a of Object.keys(out) as Action[]) {
      const keys = saved[a]
      if (Array.isArray(keys)) out[a] = [String(keys[0] ?? ''), String(keys[1] ?? '')]
    }
  } catch {
    /* unreadable: the defaults */
  }
  return out
}

export const bindings = reactive(load())
watch(
  bindings,
  (b) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(b))
    } catch {
      /* storage blocked: the keys last this visit */
    }
  },
  { deep: true },
)

/** A key as bindings store it: letters lower case (so Shift or Caps Lock do not matter), others by name. */
export const normalize = (key: string) => (key.length === 1 ? key.toLowerCase() : key)

/** What a key does, if anything. */
export function actionOf(key: string): Action | undefined {
  const k = normalize(key)
  if (!k) return undefined
  return (Object.keys(bindings) as Action[]).find((a) => bindings[a].includes(k))
}

/** The direction a key steers, if it steers. */
export function dirOf(key: string): DirName | undefined {
  const a = actionOf(key)
  return a === 'up' || a === 'down' || a === 'left' || a === 'right' ? a : undefined
}

/** Put a key in one of an action's two slots; it leaves whatever action had it before. Empty clears the slot. */
export function bind(action: Action, slot: 0 | 1, key: string) {
  const k = normalize(key)
  if (k) for (const a of Object.keys(bindings) as Action[]) bindings[a] = bindings[a].map((x) => (x === k ? '' : x))
  bindings[action][slot] = k
}

export function resetKeys() {
  Object.assign(bindings, copy(DEFAULTS))
}

const NAMES: Record<string, string> = { ' ': 'Space', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backspace: '⌫', Delete: 'Del', Shift: 'Shift', Control: 'Ctrl', Alt: 'Alt' }
/** A key as people read it. */
export const keyLabel = (key: string) => NAMES[key] ?? (key.length === 1 ? key.toUpperCase() : key)
/** The first key bound to an action, for hints ("Space to dash"). */
export const keyFor = (action: Action) => keyLabel(bindings[action][0] || bindings[action][1] || '')
