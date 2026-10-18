/**
 * The player on this device, and their games kept here.
 *
 * Signing in is a name plus a secret login code from the server; the code is
 * the only key to the account, so it is kept here to send with requests and
 * shown in the Account panel to copy somewhere safe.
 *
 * Every game played here is listed (code, score, when), so My games works
 * signed out too. Saving one offline keeps its whole replay here as well.
 */
import { reactive, watch } from 'vue'
import type { Mode, Replay } from './game'

const ACCOUNT_KEY = 'laserwyrm-account'
const GAMES_KEY = 'laserwyrm-my-games'
const OFFLINE_KEY = 'laserwyrm-offline'
/** Enough history to be useful, small enough for storage. */
const KEEP = 200

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage blocked or full: it works for this visit */
  }
}

export const account = reactive(read<{ name: string | null; code: string | null }>(ACCOUNT_KEY, { name: null, code: null }))
watch(account, (value) => write(ACCOUNT_KEY, value), { deep: true })

export function signIn(name: string, code: string) {
  account.name = name
  account.code = code
}
export function signOut() {
  account.name = null
  account.code = null
}

export interface LocalGame {
  code: string
  /** Missing on games saved before modes: those are normal. */
  mode?: Mode
  score: number
  level: number
  steps: number
  created_at: string
}

export const localGames = reactive({
  list: read<LocalGame[]>(GAMES_KEY, []),
  /** Full replays kept offline, by game code. */
  offline: read<Record<string, Replay>>(OFFLINE_KEY, {}),
})
watch(() => localGames.list, (list) => write(GAMES_KEY, list), { deep: true })
watch(() => localGames.offline, (offline) => write(OFFLINE_KEY, offline), { deep: true })

export function rememberGame(game: LocalGame) {
  localGames.list = [game, ...localGames.list.filter((g) => g.code !== game.code)].slice(0, KEEP)
}
export function keepOffline(code: string, replay: Replay) {
  localGames.offline = { ...localGames.offline, [code]: replay }
}
export function dropOffline(code: string) {
  const { [code]: _, ...rest } = localGames.offline
  localGames.offline = rest
}
