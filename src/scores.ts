/**
 * High-score entries. For now they live only in this browser's storage;
 * nothing is sent anywhere until there is a server to send them to.
 */
export interface ScoreEntry {
  name: string
  email: string
  score: number
  level: number
  at: string
}

const SCORES_KEY = 'laserwyrm-scores'

export function readScores(): ScoreEntry[] {
  try {
    const list = JSON.parse(localStorage.getItem(SCORES_KEY) ?? '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

/** Keep the ten best. Returns false if storage is blocked. */
export function saveScore(entry: ScoreEntry): boolean {
  try {
    const list = [...readScores(), entry].sort((a, b) => b.score - a.score).slice(0, 10)
    localStorage.setItem(SCORES_KEY, JSON.stringify(list))
    return true
  } catch {
    return false
  }
}
