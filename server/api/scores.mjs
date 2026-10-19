/**
 * High scores: the boards (normal and hardcore), where a score would place,
 * posting a saved game to the board, the player's own entries, and the
 * play-time board.
 */
import { checkEmail, normalizeCode } from '../checks.mjs'
import { clientIp, HttpError, ipHash, limit, readJson } from '../http.mjs'
import { authFor } from './auth.mjs'
import { BOARD_MAX, scoreRow } from './rows.mjs'

export function scoreRoutes(db) {
  const { userFrom } = authFor(db)
  return {
    /** Where a score would land on a board: whether it places, and at what rank, without sending the board. */
    async rank(scoreParam, modeParam) {
      const score = Number(scoreParam)
      if (!Number.isFinite(score)) throw new HttpError(400, 'score must be a number')
      const mode = modeParam === 'hardcore' ? 'hardcore' : 'normal'
      const { rows } = await db.query(
        `SELECT count(*)::int AS ahead,
                (SELECT count(*)::int FROM scores s2 LEFT JOIN games g2 ON g2.id = s2.game_id WHERE COALESCE(g2.mode, 'normal') = $2) AS total
         FROM scores s LEFT JOIN games g ON g.id = s.game_id
         WHERE s.score > $1 AND COALESCE(g.mode, 'normal') = $2`,
        [score, mode],
      )
      const { ahead, total } = rows[0]
      return { rank: ahead + 1, places: score > 0 && (total < BOARD_MAX || ahead < BOARD_MAX) }
    },

    async board(limitParam, modeParam) {
      const n = Math.min(BOARD_MAX, Math.max(1, Number(limitParam) || 50))
      const mode = modeParam === 'hardcore' ? 'hardcore' : 'normal'
      const { rows } = await db.query(
        `SELECT s.id, s.name, s.score, s.level, s.steps, s.created_at, g.code, COALESCE(g.mode, 'normal') AS mode
         FROM scores s LEFT JOIN games g ON g.id = s.game_id
         WHERE COALESCE(g.mode, 'normal') = $2
         ORDER BY s.score DESC, s.created_at ASC LIMIT $1`,
        [n, mode],
      )
      return { scores: rows.map(scoreRow) }
    },

    async boardEntry(id) {
      const { rows } = await db.query(
        `SELECT s.id, s.name, s.score, s.level, s.steps, s.created_at, g.code, COALESCE(g.mode, 'normal') AS mode, COALESCE(s.replay, g.replay) AS replay
         FROM scores s LEFT JOIN games g ON g.id = s.game_id WHERE s.id = $1`,
        [id],
      )
      if (!rows[0]) throw new HttpError(404, 'no such score')
      return { ...scoreRow(rows[0]), replay: rows[0].replay }
    },

    async addScore(req) {
      limit(clientIp(req), 'score', 6)
      const user = await userFrom(req, true)
      const body = await readJson(req)
      const email = checkEmail(body.email)
      if (email === false) throw new HttpError(400, 'email does not look right')
      const code = normalizeCode(body.game)
      if (!code) throw new HttpError(400, 'which game? send its code')
      const { rows } = await db.query('SELECT id, user_id, score, level, steps, cheated, mode FROM games WHERE code = $1', [code])
      const game = rows[0]
      if (!game) throw new HttpError(404, `no game ${code}`)
      if (game.cheated) throw new HttpError(400, 'games with cheats cannot go on the board')
      if (game.user_id != null && Number(game.user_id) !== user.id) throw new HttpError(403, 'that game belongs to another player')
      if (game.user_id == null) await db.query('UPDATE games SET user_id = $1 WHERE id = $2', [user.id, game.id])
      try {
        const inserted = await db.query(
          `INSERT INTO scores (name, email, score, level, steps, game_id, user_id, ip_hash)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [user.name, email, game.score, game.level, game.steps, game.id, user.id, ipHash(clientIp(req))],
        )
        const ahead = await db.query(
          `SELECT count(*)::int AS n FROM scores s LEFT JOIN games g ON g.id = s.game_id
           WHERE s.score > $1 AND COALESCE(g.mode, 'normal') = $2`,
          [game.score, game.mode],
        )
        return { status: 201, body: { id: Number(inserted.rows[0].id), rank: ahead.rows[0].n + 1 } }
      } catch (err) {
        if (err.code === '23505') throw new HttpError(409, 'that game is already on the board')
        throw err
      }
    },

    /** The player's runs on the board, to take any off. */
    async myScores(req) {
      const user = await userFrom(req, true)
      const { rows } = await db.query(
        `SELECT s.id, s.name, s.score, s.level, s.steps, s.created_at, g.code, COALESCE(g.mode, 'normal') AS mode
         FROM scores s LEFT JOIN games g ON g.id = s.game_id WHERE s.user_id = $1 ORDER BY s.score DESC LIMIT 100`,
        [user.id],
      )
      return { scores: rows.map(scoreRow) }
    },

    async removeScore(req, id) {
      const user = await userFrom(req, true)
      const { rows } = await db.query('DELETE FROM scores WHERE id = $1 AND user_id = $2 RETURNING id', [id, user.id])
      if (!rows[0]) throw new HttpError(404, 'no such score of yours')
      return { removed: id }
    },

    /** Who has played longest: their saved games' time added up. */
    async playTime(limitParam) {
      const n = Math.min(BOARD_MAX, Math.max(1, Number(limitParam) || 50))
      const { rows } = await db.query(
        `SELECT u.name, SUM(g.seconds)::bigint AS seconds, count(*)::int AS games,
                MAX(g.level) FILTER (WHERE NOT g.cheated)::int AS level
         FROM games g JOIN users u ON u.id = g.user_id
         GROUP BY u.id, u.name HAVING SUM(g.seconds) > 0
         ORDER BY seconds DESC LIMIT $1`,
        [n],
      )
      return { players: rows.map((r) => ({ name: r.name, seconds: Number(r.seconds), games: r.games, level: r.level ?? 0 })) }
    },
  }
}
