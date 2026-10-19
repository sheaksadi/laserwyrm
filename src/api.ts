/**
 * The Laserwyrm server (server/server.mjs): saved games, players, the
 * high-score board, and Explore, where players share game designs. Signed-in
 * calls carry the player's login code.
 */
import type { Design } from './design'
import type { Mode, Replay } from './game'
import { account, signIn } from './account'

export interface ScoreRow {
  id: number
  mode: Mode
  name: string
  /** The saved game behind the entry, e.g. BORK#4821. */
  code: string | null
  score: number
  level: number
  steps: number
  created_at: string
}
export interface ScoreEntry extends ScoreRow {
  replay: Replay
}
export interface GameRow {
  code: string
  mode: Mode
  /** The player, when the game was played signed in. */
  name: string | null
  score: number
  level: number
  steps: number
  cheated: boolean
  created_at: string
}
export interface GameEntry extends GameRow {
  replay: Replay
}

/** The board only keeps this many; below the last one a run does not place. */
export const BOARD_SIZE = 100

/** An error from the server, with anything else it said (name suggestions). */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public extra: Record<string, unknown> = {},
  ) {
    super(message)
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (account.code) headers.authorization = `Bearer ${account.code}`
  const res = await fetch(path, { ...init, headers: { ...headers, ...(init?.headers as Record<string, string>) } })
  const body = await res.json().catch(() => ({}))
  // No error of ours in the body: the request never reached the score server
  // (in development, `npm run server` is not running).
  if (!res.ok) throw new ApiError(body.error ?? `the score server is not reachable (${res.status})`, res.status, body)
  return body as T
}
const post = <T>(path: string, body: unknown) => call<T>(path, { method: 'POST', body: JSON.stringify(body) })

/** Codes go in URLs with a dash: BORK#4821 → BORK-4821. */
export const codeForUrl = (code: string) => code.replace('#', '-')

/* ─── Games ─── */

/** `design` names a shared design the run was played on; `cheats` says whether real cheats were used. */
export const saveGame = (game: { score: number; level: number; cheated: boolean; mode: Mode; replay: Replay; design?: string; cheats?: boolean; seconds?: number }) =>
  post<{ code: string }>('/api/games', game)
export const fetchGame = (code: string) => call<GameEntry>(`/api/games/${encodeURIComponent(codeForUrl(code))}`)
export const searchGames = (q: string) => call<{ games: GameRow[] }>(`/api/games?q=${encodeURIComponent(q)}`).then((r) => r.games)
export const myGames = () => call<{ games: GameRow[] }>('/api/me/games').then((r) => r.games)

/* ─── Players ─── */

/** Join: a name (blank: the server makes one up). The server still takes an email, but the game no longer asks for one. */
export const createUser = (name: string, email = '') => post<{ name: string; code: string }>('/api/users', { name, email })

/** Claim a name (or a made-up one) and sign in as it; a taken name throws an ApiError with `extra.suggestions`. */
export async function claimName(name: string, email = '') {
  const made = await createUser(name, email)
  signIn(made.name, made.code)
  return made
}

/** Change your name; the old one is free for others straight away. */
export async function renameAccount(name: string) {
  const { name: next } = await call<{ name: string }>('/api/me', { method: 'PATCH', body: JSON.stringify({ name }) })
  account.name = next
  return next
}

/** What unlocks go by: best score, games played, seconds played. */
export interface PlayerStats { best: number; games: number; seconds: number }
export interface Look { color?: string; hat?: string; trail?: string }
export const fetchMe = () => call<{ name: string; look: Look | null; stats: PlayerStats }>('/api/me')
export const saveLook = (look: Look) => call<{ look: Look }>('/api/me/look', { method: 'PUT', body: JSON.stringify(look) })
export const myScores = () => call<{ scores: ScoreRow[] }>('/api/me/scores').then((r) => r.scores)
export const removeScore = (id: number) => call<{ removed: number }>(`/api/me/scores/${id}`, { method: 'DELETE' })

/** Sign in on this device with a login code. */
export async function signInWithCode(code: string) {
  const clean = code.trim().toUpperCase()
  const { name } = await post<{ name: string }>('/api/login', { code: clean })
  signIn(name, clean)
  return name
}

/* ─── High scores ─── */

export const fetchScores = (limit = BOARD_SIZE, mode: Mode = 'normal') =>
  call<{ scores: ScoreRow[] }>(`/api/scores?limit=${limit}&mode=${mode}`).then((r) => r.scores)
export const fetchScore = (id: number) => call<ScoreEntry>(`/api/scores/${id}`)
export const submitScore = (entry: { game: string; email: string }) =>
  post<{ id: number; rank: number }>('/api/scores', entry)

/** Who has played longest, with their saved games' time added up. */
/** A player on the play-time board; `level` is the furthest they got in a clean run. */
export interface TimeRow { name: string; seconds: number; games: number; level: number }
export const fetchPlayTime = () => call<{ players: TimeRow[] }>('/api/scores/time').then((r) => r.players)

/** Would this score make the board? The server says, without sending the board. True when it cannot be reached, so nobody loses a run. */
export async function placesOnBoard(score: number, mode: Mode): Promise<boolean> {
  if (score <= 0) return false
  try {
    return (await call<{ places: boolean }>(`/api/scores/rank?score=${score}&mode=${mode}`)).places
  } catch {
    return true
  }
}

/* ─── Explore ─── */

export interface DesignRow {
  slug: string
  name: string
  about: string
  author: string
  plays: number
  likes: number
  /** Liked by the signed-in player. */
  liked: boolean
  /** Levels with changes, and home-made items. */
  levels: number
  items: number
  created_at: string
}
export interface DesignEntry extends DesignRow {
  mine: boolean
  /** On Explore, or only reachable by its code and link. */
  listed: boolean
  design: Design
  /** Its own board: the best clean runs on it. */
  scores: GameRow[]
}
export type DesignSort = 'new' | 'played' | 'liked'

export const listDesigns = (sort: DesignSort, q = '', mine = false) =>
  call<{ designs: DesignRow[] }>(`/api/designs?sort=${sort}&q=${encodeURIComponent(q)}${mine ? '&mine=1' : ''}`).then((r) => r.designs)
export const fetchDesign = (slug: string) => call<DesignEntry>(`/api/designs/${encodeURIComponent(slug)}`)
/** Share a design: on Explore (signed in), or `listed: false` for a code and link only. */
export const publishDesign = (entry: { name: string; about: string; design: Design; listed?: boolean }) => post<{ slug: string }>('/api/designs', entry)
export const likeDesign = (slug: string) => post<{ likes: number; liked: boolean }>(`/api/designs/${encodeURIComponent(slug)}/like`, {})
export const countPlay = (slug: string) => post<{ ok: true }>(`/api/designs/${encodeURIComponent(slug)}/play`, {})
export const removeDesign = (slug: string) => call<{ ok: true }>(`/api/designs/${encodeURIComponent(slug)}`, { method: 'DELETE' })
