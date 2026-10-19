/**
 * Players: joining with a name, signing in with the login code, renaming,
 * the snake's look, and the player's own numbers.
 */
import { randomInt } from 'node:crypto'
import { WORDS } from '../words.mjs'
import { checkEmail, hashToken, NAME_RE, nameKey, newLoginCode } from '../checks.mjs'
import { clientIp, HttpError, limit, readJson } from '../http.mjs'
import { authFor } from './auth.mjs'

export function playerRoutes(db) {
  const { userFrom, suggestions } = authFor(db)
  return {
    /** Join: a name (or, left blank, a free one made up here) and, if given, an email. */
    async createUser(req) {
      limit(clientIp(req), 'user', 10)
      const { name: raw, email: rawEmail } = await readJson(req)
      const email = checkEmail(rawEmail)
      if (email === false) throw new HttpError(400, 'email does not look right')
      let name = typeof raw === 'string' ? raw.trim() : ''
      if (!name) name = (await suggestions(WORDS[randomInt(WORDS.length)].toLowerCase().replace(/^./, (c) => c.toUpperCase())))[0] ?? `Wyrm${randomInt(1000, 10000)}`
      if (!NAME_RE.test(name)) throw new HttpError(400, 'names are 1 to 12 letters, digits, - or _')
      const code = newLoginCode()
      try {
        await db.query('INSERT INTO users (name, name_key, token_hash, email) VALUES ($1, $2, $3, $4)', [name, nameKey(name), hashToken(code), email])
      } catch (err) {
        if (err.code === '23505') throw new HttpError(409, `${name} is taken`, { suggestions: await suggestions(name) })
        throw err
      }
      return { status: 201, body: { name, code } }
    },

    /** A new name; the old one is free for anyone else at once. The board shows the new one. */
    async rename(req) {
      limit(clientIp(req), 'rename', 10)
      const user = await userFrom(req, true)
      const { name: raw } = await readJson(req)
      const name = typeof raw === 'string' ? raw.trim() : ''
      if (!NAME_RE.test(name)) throw new HttpError(400, 'names are 1 to 12 letters, digits, - or _')
      try {
        await db.query('UPDATE users SET name = $1, name_key = $2 WHERE id = $3', [name, nameKey(name), user.id])
      } catch (err) {
        if (err.code === '23505') throw new HttpError(409, `${name} is taken`, { suggestions: await suggestions(name) })
        throw err
      }
      await db.query('UPDATE scores SET name = $1 WHERE user_id = $2', [name, user.id])
      return { name }
    },

    /** The snake's look (colour, hat, trail): the game checks what is unlocked; this only keeps it small. */
    async saveLook(req) {
      const user = await userFrom(req, true)
      const body = await readJson(req)
      const look = {}
      for (const key of ['color', 'hat', 'trail']) if (typeof body[key] === 'string' && /^[a-z0-9-]{1,20}$/.test(body[key])) look[key] = body[key]
      await db.query('UPDATE users SET look = $1 WHERE id = $2', [look, user.id])
      return { look }
    },

    async login(req) {
      limit(clientIp(req), 'login', 10)
      const { code } = await readJson(req)
      const { rows } = await db.query('SELECT name FROM users WHERE token_hash = $1', [hashToken(code ?? '')])
      if (!rows[0]) throw new HttpError(401, 'that login code is not recognised')
      return { name: rows[0].name }
    },

    /** The player: name, look, and what their unlocks go by (best score, games, time played). */
    async me(req) {
      const user = await userFrom(req, true)
      const { rows } = await db.query(
        `SELECT u.look, COALESCE(MAX(g.score) FILTER (WHERE NOT g.cheated), 0)::int AS best,
                count(g.id)::int AS games, COALESCE(SUM(g.seconds), 0)::bigint AS seconds
         FROM users u LEFT JOIN games g ON g.user_id = u.id WHERE u.id = $1 GROUP BY u.id`,
        [user.id],
      )
      const r = rows[0] ?? {}
      return { name: user.name, look: r.look ?? null, stats: { best: r.best ?? 0, games: r.games ?? 0, seconds: Number(r.seconds ?? 0) } }
    },
  }
}
