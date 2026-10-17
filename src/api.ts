/**
 * The high-score server (server/server.mjs). Emails go up with a score but
 * never come back down; the board shows names, scores and replays.
 */
import type { Replay } from './game'

export interface ScoreRow {
  id: number
  name: string
  score: number
  level: number
  steps: number
  created_at: string
}
export interface ScoreEntry extends ScoreRow {
  replay: Replay
}

/** The board only keeps this many; below the last one a run does not place. */
export const BOARD_SIZE = 100

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `server said ${res.status}`)
  return body as T
}

export const fetchScores = (limit = BOARD_SIZE) =>
  call<{ scores: ScoreRow[] }>(`/api/scores?limit=${limit}`).then((r) => r.scores)

export const fetchScore = (id: number) => call<ScoreEntry>(`/api/scores/${id}`)

export const submitScore = (entry: { name: string; email: string; score: number; level: number; replay: Replay }) =>
  call<{ id: number; rank: number }>('/api/scores', { method: 'POST', body: JSON.stringify(entry) })

/** Would this score make the board? True when the board cannot be reached, so nobody loses a run. */
export async function placesOnBoard(score: number): Promise<boolean> {
  if (score <= 0) return false
  try {
    const board = await fetchScores(BOARD_SIZE)
    return board.length < BOARD_SIZE || score > board[board.length - 1]!.score
  } catch {
    return true
  }
}
