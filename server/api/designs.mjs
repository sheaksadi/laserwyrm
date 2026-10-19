/**
 * Explore: game designs players share. Listed ones show on Explore (sorted,
 * searched, liked); unlisted ones are reached by their code or link. Each
 * keeps its own board of clean runs.
 */
import { checkDesign, newSlug } from '../checks.mjs'
import { clientIp, HttpError, limit, readJson } from '../http.mjs'
import { authFor } from './auth.mjs'
import { designRow, gameRow } from './rows.mjs'

export function designRoutes(db) {
  const { userFrom } = authFor(db)
  return {
    async listDesigns(req, params) {
      const me = await userFrom(req, false).catch(() => null)
      const sort = params.get('sort')
      const order = sort === 'played' ? 'd.plays DESC' : sort === 'liked' ? 'd.likes DESC' : 'd.created_at DESC'
      const q = String(params.get('q') ?? '').trim().slice(0, 40)
      const mine = params.get('mine') === '1' && me
      const { rows } = await db.query(
        `SELECT d.slug, d.name, d.about, d.plays, d.likes, d.created_at, u.name AS author,
                jsonb_array_length(COALESCE(d.design->'levels', '[]'::jsonb)) AS levels,
                jsonb_array_length(COALESCE(d.design->'custom', '[]'::jsonb)) AS items,
                EXISTS (SELECT 1 FROM design_likes l WHERE l.design_id = d.id AND l.user_id = $2) AS liked
         FROM designs d JOIN users u ON u.id = d.user_id
         WHERE NOT d.removed AND d.listed
           AND ($1 = '' OR d.name ILIKE '%' || $1 || '%' OR u.name_key = lower($1))
           AND ($3::bigint IS NULL OR d.user_id = $3)
         ORDER BY ${order}, d.created_at DESC LIMIT 40`,
        [q, me?.id ?? 0, mine ? me.id : null],
      )
      return { designs: rows.map(designRow) }
    },

    async getDesign(req, slug) {
      const me = await userFrom(req, false).catch(() => null)
      const { rows } = await db.query(
        `SELECT d.*, u.name AS author,
                EXISTS (SELECT 1 FROM design_likes l WHERE l.design_id = d.id AND l.user_id = $2) AS liked
         FROM designs d LEFT JOIN users u ON u.id = d.user_id WHERE d.slug = $1 AND NOT d.removed`,
        [slug, me?.id ?? 0],
      )
      const d = rows[0]
      if (!d) throw new HttpError(404, 'no such design')
      const top = await db.query(
        `SELECT g.code, g.mode, g.score, g.level, g.steps, g.cheated, g.created_at, u.name
         FROM games g LEFT JOIN users u ON u.id = g.user_id
         WHERE g.design_id = $1 AND g.design_clean ORDER BY g.score DESC, g.created_at ASC LIMIT 20`,
        [d.id],
      )
      return {
        ...designRow({ ...d, levels: d.design?.levels?.length ?? 0, items: d.design?.custom?.length ?? 0 }),
        mine: me != null && d.user_id != null && Number(d.user_id) === me.id,
        listed: d.listed,
        design: d.design,
        scores: top.rows.map(gameRow),
      }
    },

    async publishDesign(req) {
      limit(clientIp(req), 'design', 20)
      const body = await readJson(req)
      // Listed on Explore needs a player; an unlisted share (link, code, QR) does not.
      const listed = body.listed !== false
      const user = await userFrom(req, listed)
      const name = typeof body.name === 'string' ? body.name.trim().slice(0, 40) : ''
      if (!name) throw new HttpError(400, 'give it a name')
      const about = typeof body.about === 'string' ? body.about.trim().slice(0, 400) : ''
      const problem = checkDesign(body.design)
      if (problem) throw new HttpError(400, problem)
      for (let attempt = 0; attempt < 8; attempt++) {
        const slug = newSlug()
        try {
          await db.query('INSERT INTO designs (slug, user_id, name, about, design, listed) VALUES ($1, $2, $3, $4, $5, $6)', [
            slug, user?.id ?? null, name, about, body.design, listed,
          ])
          return { status: 201, body: { slug } }
        } catch (err) {
          if (err.code !== '23505') throw err
        }
      }
      throw new HttpError(503, 'could not find a free name, try again')
    },

    async likeDesign(req, slug) {
      limit(clientIp(req), 'like', 60)
      const user = await userFrom(req, true)
      const { rows } = await db.query('SELECT id FROM designs WHERE slug = $1 AND NOT removed', [slug])
      if (!rows[0]) throw new HttpError(404, 'no such design')
      const id = rows[0].id
      const gone = await db.query('DELETE FROM design_likes WHERE design_id = $1 AND user_id = $2 RETURNING 1', [id, user.id])
      if (!gone.rows.length) await db.query('INSERT INTO design_likes (design_id, user_id) VALUES ($1, $2)', [id, user.id])
      const count = await db.query('SELECT count(*)::int AS n FROM design_likes WHERE design_id = $1', [id])
      await db.query('UPDATE designs SET likes = $1 WHERE id = $2', [count.rows[0].n, id])
      return { likes: count.rows[0].n, liked: !gone.rows.length }
    },

    async playedDesign(req, slug) {
      limit(clientIp(req), 'play', 30)
      await db.query('UPDATE designs SET plays = plays + 1 WHERE slug = $1 AND NOT removed', [slug])
      return { ok: true }
    },

    async removeDesign(req, slug) {
      const user = await userFrom(req, true)
      const { rows } = await db.query('UPDATE designs SET removed = true WHERE slug = $1 AND user_id = $2 RETURNING 1', [slug, user.id])
      if (!rows.length) throw new HttpError(404, 'no design of yours with that name')
      return { ok: true }
    },
  }
}
