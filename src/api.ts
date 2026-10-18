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
export const saveGame = (game: { score: number; level: number; cheated: boolean; mode: Mode; replay: Replay; design?: string; cheats?: boolean }) =>
  post<{ code: string }>('/api/games', game)
export const fetchGame = (code: string) => call<GameEntry>(`/api/games/${encodeURIComponent(codeForUrl(code))}`)
export const searchGames = (q: string) => call<{ games: GameRow[] }>(`/api/games?q=${encodeURIComponent(q)}`).then((r) => r.games)
export const myGames = () => call<{ games: GameRow[] }>('/api/me/games').then((r) => r.games)

/* ─── Players ─── */

export const createUser = (name: string) => post<{ name: string; code: string }>('/api/users', { name })

/** Claim a name and sign in as it; a taken name throws an ApiError with `extra.suggestions`. */
export async function claimName(name: string) {
  const made = await createUser(name)
  signIn(made.name, made.code)
  return made
}

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

/** Would this score make the board? True when the board cannot be reached, so nobody loses a run. */
export async function placesOnBoard(score: number, mode: Mode): Promise<boolean> {
  if (score <= 0) return false
  try {
    const board = await fetchScores(BOARD_SIZE, mode)
    return board.length < BOARD_SIZE || score > board[board.length - 1]!.score
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
  design: Design
  /** Its own board: the best clean runs on it. */
  scores: GameRow[]
}
export type DesignSort = 'new' | 'played' | 'liked'

export const listDesigns = (sort: DesignSort, q = '', mine = false) =>
  call<{ designs: DesignRow[] }>(`/api/designs?sort=${sort}&q=${encodeURIComponent(q)}${mine ? '&mine=1' : ''}`).then((r) => r.designs)
export const fetchDesign = (slug: string) => call<DesignEntry>(`/api/designs/${encodeURIComponent(slug)}`)
export const publishDesign = (entry: { name: string; about: string; design: Design }) => post<{ slug: string }>('/api/designs', entry)
export const likeDesign = (slug: string) => post<{ likes: number; liked: boolean }>(`/api/designs/${encodeURIComponent(slug)}/like`, {})
export const countPlay = (slug: string) => post<{ ok: true }>(`/api/designs/${encodeURIComponent(slug)}/play`, {})
export const removeDesign = (slug: string) => call<{ ok: true }>(`/api/designs/${encodeURIComponent(slug)}`, { method: 'DELETE' })
