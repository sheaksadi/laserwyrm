/**
 * Saved games: every finished run, kept with its replay under a code like
 * BORK#4821; looked up by code, searched by player, listed for the player.
 */
import { canonical, checkReplay, int, nameKey, newGameCode, normalizeCode } from '../checks.mjs'
import { clientIp, HttpError, ipHash, limit, readJson } from '../http.mjs'
import { authFor } from './auth.mjs'
import { gameRow, MODES } from './rows.mjs'

export function gameRoutes(db) {
  const { userFrom } = authFor(db)
  return {
    async saveGame(req) {
      limit(clientIp(req), 'game', 30)
      const user = await userFrom(req, false)
      const body = await readJson(req)
      if (!int(body.score, 0, 2_000_000_000)) throw new HttpError(400, 'score must be a whole number')
      if (!int(body.level, 1, 100_000)) throw new HttpError(400, 'level must be a whole number from 1')
      const replay = checkReplay(body.replay)
      if (typeof replay === 'string') throw new HttpError(400, replay)
      const mode = body.mode ?? replay.mode
      if (!MODES.has(mode) || mode !== replay.mode) throw new HttpError(400, 'mode must be normal or hardcore, as in the replay')
      // A run on a shared design counts on that design's board when it used no cheats and played the design as published.
      let designId = null
      let clean = false
      if (typeof body.design === 'string') {
        const { rows } = await db.query('SELECT id, design FROM designs WHERE slug = $1 AND NOT removed', [body.design])
        if (rows[0]) {
          designId = rows[0].id
          clean = body.cheats === false && !!replay.design && canonical(replay.design) === canonical(rows[0].design)
        }
      }
      // Time played, as the game timed it; held to what the steps allow (16ths at 40 to 400 bpm).
      const seconds = Math.round(Math.min(replay.steps * 0.375, Math.max(replay.steps * 0.0375, Number(body.seconds) || 0)))
      for (let attempt = 0; attempt < 8; attempt++) {
        const code = newGameCode()
        try {
          await db.query(
            `INSERT INTO games (code, user_id, score, level, steps, cheated, mode, replay, ip_hash, design_id, design_clean, seconds)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [code, user?.id ?? null, body.score, body.level, replay.steps, body.cheated === true, mode, replay, ipHash(clientIp(req)), designId, clean, seconds],
          )
          return { status: 201, body: { code } }
        } catch (err) {
          if (err.code !== '23505') throw err
        }
      }
      throw new HttpError(503, 'could not find a free game code, try again')
    },

    async getGame(raw) {
      const code = normalizeCode(raw)
      if (!code) throw new HttpError(400, 'game codes look like BORK#4821')
      const { rows } = await db.query(
        `SELECT g.*, u.name FROM games g LEFT JOIN users u ON u.id = g.user_id WHERE g.code = $1`,
        [code],
      )
      if (!rows[0]) throw new HttpError(404, `no game ${code}`)
      return { ...gameRow(rows[0]), replay: rows[0].replay }
    },

    async searchGames(q) {
      const text = String(q ?? '').trim()
      if (!text) return { games: [] }
      const code = normalizeCode(text)
      if (code) {
        const { rows } = await db.query(
          `SELECT g.code, g.mode, g.score, g.level, g.steps, g.cheated, g.created_at, u.name
           FROM games g LEFT JOIN users u ON u.id = g.user_id WHERE g.code = $1`,
          [code],
        )
        return { games: rows.map(gameRow) }
      }
      const { rows } = await db.query(
        `SELECT g.code, g.mode, g.score, g.level, g.steps, g.cheated, g.created_at, u.name
         FROM games g JOIN users u ON u.id = g.user_id
         WHERE u.name_key = $1 ORDER BY g.created_at DESC LIMIT 50`,
        [nameKey(text)],
      )
      return { games: rows.map(gameRow) }
    },

    async myGames(req) {
      const user = await userFrom(req, true)
      const { rows } = await db.query(
        `SELECT code, mode, score, level, steps, cheated, created_at FROM games
         WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
        [user.id],
      )
      return { games: rows.map((r) => ({ ...gameRow(r), name: user.name })) }
    },
  }
}
