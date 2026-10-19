/**
 * Who is asking: the player behind a request's login code, and free names
 * to suggest when one is taken.
 */
import { randomInt } from 'node:crypto'
import { hashToken, nameKey } from '../checks.mjs'
import { HttpError } from '../http.mjs'

export function authFor(db) {
  async function userFrom(req, required) {
    const auth = req.headers.authorization ?? ''
    const code = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
    if (code) {
      const { rows } = await db.query('SELECT id, name FROM users WHERE token_hash = $1', [hashToken(code)])
      if (rows[0]) return { id: Number(rows[0].id), name: rows[0].name }
      throw new HttpError(401, 'that login code is not recognised')
    }
    if (required) throw new HttpError(401, 'sign in first')
    return null
  }

  async function suggestions(base) {
    const stem = base.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 9) || 'wyrm'
    const candidates = new Set()
    while (candidates.size < 8) candidates.add(`${stem}${randomInt(10, 1000)}`.slice(0, 12))
    const { rows } = await db.query('SELECT name_key FROM users WHERE name_key = ANY($1)', [[...candidates].map(nameKey)])
    const taken = new Set(rows.map((r) => r.name_key))
    return [...candidates].filter((c) => !taken.has(nameKey(c))).slice(0, 3)
  }

  return { userFrom, suggestions }
}
