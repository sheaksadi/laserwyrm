/**
 * The player's custom games, synced between their browsers and AI agents,
 * the agent keys that let an agent in, and the MCP endpoint agents talk to
 * (the tools themselves are in ../mcp.mjs).
 */
import * as core from '../../src/designCore.ts'
import { handleMcp } from '../mcp.mjs'
import { hashToken, newAgentKey, newGid } from '../checks.mjs'
import { clientIp, HttpError, limit, readBody, readJson } from '../http.mjs'
import { authFor } from './auth.mjs'

export function libraryRoutes(db) {
  const { userFrom } = authFor(db)
  return {
    /* ─── The player's games, synced (the game and AI agents share them) ─── */

    /** The player's games; with ?since=<time>, only those changed after it (the game polls this way). */
    async library(req, since) {
      const user = await userFrom(req, true)
      const after = Number.isFinite(Date.parse(since)) ? new Date(since) : null
      // Taken before reading, so a change made meanwhile is caught next time.
      const now = new Date().toISOString()
      const { rows } = await db.query(
        `SELECT gid, name, design, deleted, updated_at FROM user_games
         WHERE user_id = $1 AND ($2::timestamptz IS NULL OR updated_at > $2) ORDER BY updated_at DESC LIMIT 100`,
        [user.id, after],
      )
      const { rows: all } = after ? await db.query('SELECT gid FROM user_games WHERE user_id = $1', [user.id]) : { rows }
      return {
        games: rows.map((r) => ({ id: r.gid, name: r.name, design: r.design, deleted: r.deleted, updated_at: new Date(r.updated_at).toISOString() })),
        // Every game the server knows (changed or not), so the game can tell which of its own to send up.
        ids: all.map((r) => r.gid),
        now,
      }
    },

    async putGame(req, gid) {
      limit(clientIp(req), 'sync', 120)
      const user = await userFrom(req, true)
      const body = await readJson(req)
      if (JSON.stringify(body.design ?? {}).length > 200_000) throw new HttpError(400, 'design is too big')
      const design = core.compact(core.cleanDesign(body.design))
      const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 40) : 'My game'
      // Last change wins: an older copy from the browser does not overwrite a newer one (an agent's).
      const when = Number.isFinite(Date.parse(body.updated_at)) ? new Date(body.updated_at) : new Date()
      const { rows } = await db.query(
        `INSERT INTO user_games (user_id, gid, name, design, deleted, updated_at) VALUES ($1, $2, $3, $4, false, $5)
         ON CONFLICT (user_id, gid) DO UPDATE SET name = EXCLUDED.name, design = EXCLUDED.design, deleted = false, updated_at = EXCLUDED.updated_at
           WHERE user_games.updated_at < EXCLUDED.updated_at
         RETURNING updated_at`,
        [user.id, gid, name, design, when],
      )
      return { stored: rows.length > 0 }
    },

    async deleteGame(req, gid) {
      const user = await userFrom(req, true)
      await db.query('UPDATE user_games SET deleted = true, updated_at = now() WHERE user_id = $1 AND gid = $2', [user.id, gid])
      return { ok: true }
    },

    /* ─── AI agent keys ─── */

    async agentKeys(req) {
      const user = await userFrom(req, true)
      const { rows } = await db.query(
        'SELECT id, label, created_at, last_used FROM agent_keys WHERE user_id = $1 AND NOT revoked ORDER BY created_at DESC',
        [user.id],
      )
      return { keys: rows.map((r) => ({ id: Number(r.id), label: r.label, created_at: new Date(r.created_at).toISOString(), last_used: r.last_used ? new Date(r.last_used).toISOString() : null })) }
    },

    async newAgentKey(req) {
      limit(clientIp(req), 'agentkey', 10)
      const user = await userFrom(req, true)
      const body = await readJson(req).catch(() => ({}))
      const key = newAgentKey()
      const label = typeof body.label === 'string' ? body.label.trim().slice(0, 40) : ''
      const { rows } = await db.query('INSERT INTO agent_keys (user_id, key_hash, label) VALUES ($1, $2, $3) RETURNING id', [user.id, hashToken(key), label])
      return { status: 201, body: { id: Number(rows[0].id), key } }
    },

    async revokeAgentKey(req, id) {
      const user = await userFrom(req, true)
      await db.query('UPDATE agent_keys SET revoked = true WHERE id = $1 AND user_id = $2', [id, user.id])
      return { ok: true }
    },

    /* ─── MCP: AI agents edit this player's games ─── */

    async mcp(req) {
      limit(clientIp(req), 'mcp', 600)
      const auth = req.headers.authorization ?? ''
      const key = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
      if (!key.startsWith('lwa_')) throw new HttpError(401, 'an agent key (lwa_…) is needed: make one in the game, under ☰ → AI agent')
      const { rows } = await db.query(
        `SELECT k.id, u.id AS user_id, u.name FROM agent_keys k JOIN users u ON u.id = k.user_id WHERE k.key_hash = $1 AND NOT k.revoked`,
        [hashToken(key)],
      )
      if (!rows[0]) throw new HttpError(401, 'that agent key is not recognised (it may have been revoked)')
      const user = { id: Number(rows[0].user_id), name: rows[0].name }
      void db.query('UPDATE agent_keys SET last_used = now() WHERE id = $1', [rows[0].id])
      const notFound = (gid) => Object.assign(new Error(`no game ${gid} (list_games shows them)`), { status: 404 })
      const store = {
        list: async () =>
          (await db.query('SELECT gid, name, design, updated_at FROM user_games WHERE user_id = $1 AND NOT deleted ORDER BY updated_at DESC', [user.id])).rows.map((r) => ({ ...r, updated_at: new Date(r.updated_at).toISOString() })),
        get: async (gid) => {
          const r = (await db.query('SELECT gid, name, design FROM user_games WHERE user_id = $1 AND gid = $2 AND NOT deleted', [user.id, String(gid)])).rows[0]
          if (!r) throw notFound(gid)
          return r
        },
        create: async (name, design) => {
          const gid = newGid()
          await db.query('INSERT INTO user_games (user_id, gid, name, design) VALUES ($1, $2, $3, $4)', [user.id, gid, name, core.compact(core.cleanDesign(design))])
          return gid
        },
        save: async (gid, name, design) =>
          db.query('UPDATE user_games SET name = $3, design = $4, updated_at = now() WHERE user_id = $1 AND gid = $2', [user.id, gid, name, design]),
        remove: async (gid) => db.query('UPDATE user_games SET deleted = true, updated_at = now() WHERE user_id = $1 AND gid = $2', [user.id, String(gid)]),
      }
      const body = JSON.parse((await readBody(req)) || 'null')
      const messages = Array.isArray(body) ? body : [body]
      const replies = (await Promise.all(messages.map((m) => handleMcp(m, { user, store })))).filter(Boolean)
      if (!replies.length) return { status: 202, body: null }
      return Array.isArray(body) ? replies : replies[0]
    },
  }
}
