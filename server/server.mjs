/**
 * Laserwyrm's server: the built game, plus games, players, high scores and
 * shared game designs.
 *
 * Games: every finished run is saved with a code like BORK#4821 (a silly
 * four-letter word and four digits) that anyone can use to watch it.
 *   POST /api/games                    { score, level, cheated, mode, replay, design?, cheats? } → { code }
 *   GET  /api/games/:code              one game with its replay (BORK-4821 or BORK%234821)
 *   GET  /api/games?q=…                search: a game code, or a player's name
 *   GET  /api/me/games                 the signed-in player's games
 *
 * Players: claim a name, get a secret login code back; send it as
 * `Authorization: Bearer <code>` to act as that player.
 *   POST /api/users                    { name } → { name, code } or 409 { suggestions }
 *   POST /api/login                    { code } → { name }
 *   GET  /api/me                       { name }
 *
 * High scores (signed-in players put their own saved games on the board):
 *   GET  /api/scores?mode=normal&limit=50   a board (normal or hardcore), best first (no emails)
 *   GET  /api/scores/:id               one entry with its replay
 *   POST /api/scores                   { game, email? }
 *
 * Explore: players share game designs (the workshop's levels, feel and
 * items). Each has its own board of clean runs played on it.
 *   GET    /api/designs?sort=new|played|liked&q=…&mine=1
 *   GET    /api/designs/:slug          one design, with its board
 *   POST   /api/designs                { name, about, design, listed? } → { slug }
 *                                      (listed: false makes an unlisted share, no sign-in needed)
 *   POST   /api/designs/:slug/like     like or unlike → { likes, liked }
 *   POST   /api/designs/:slug/play     count a play
 *   DELETE /api/designs/:slug          take down your own
 *
 *   GET  /api/health
 *
 * Data lives in Postgres (DATABASE_URL). Without it, for local work, the
 * server runs PGlite, Postgres in-process (kept in .data/pglite), so the same
 * SQL runs everywhere.
 * A replay is the run's seed, grid and inputs (and the design, if changed);
 * the game replays it exactly.
 */
import { createServer } from 'node:http'
import { createHash, randomBytes, randomInt } from 'node:crypto'
import { mkdir, readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WORDS } from './words.mjs'

const PORT = Number(process.env.PORT) || 8080
const DIST = resolve(fileURLToPath(new URL('../dist', import.meta.url)))
const MAX_BODY = 512 * 1024
const BOARD_MAX = 100

/* ─── Database ────────────────────────────────────────────────────────── */

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    name_key    TEXT NOT NULL UNIQUE,
    token_hash  TEXT NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS games (
    id          BIGSERIAL PRIMARY KEY,
    code        TEXT NOT NULL UNIQUE,
    user_id     BIGINT REFERENCES users(id),
    score       INTEGER NOT NULL,
    level       INTEGER NOT NULL,
    steps       INTEGER NOT NULL,
    cheated     BOOLEAN NOT NULL DEFAULT false,
    replay      JSONB NOT NULL,
    ip_hash     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS games_user_idx ON games (user_id, created_at DESC);
  ALTER TABLE games ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'normal';
  CREATE TABLE IF NOT EXISTS scores (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    email       TEXT,
    score       INTEGER NOT NULL,
    level       INTEGER NOT NULL,
    steps       INTEGER NOT NULL,
    replay      JSONB,
    ip_hash     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  ALTER TABLE scores ALTER COLUMN replay DROP NOT NULL;
  ALTER TABLE scores ADD COLUMN IF NOT EXISTS game_id BIGINT REFERENCES games(id);
  ALTER TABLE scores ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id);
  CREATE UNIQUE INDEX IF NOT EXISTS scores_game_idx ON scores (game_id);
  CREATE INDEX IF NOT EXISTS scores_score_idx ON scores (score DESC, created_at ASC);
  CREATE TABLE IF NOT EXISTS designs (
    id          BIGSERIAL PRIMARY KEY,
    slug        TEXT NOT NULL UNIQUE,
    user_id     BIGINT NOT NULL REFERENCES users(id),
    name        TEXT NOT NULL,
    about       TEXT NOT NULL DEFAULT '',
    design      JSONB NOT NULL,
    plays       INTEGER NOT NULL DEFAULT 0,
    likes       INTEGER NOT NULL DEFAULT 0,
    removed     BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS designs_new_idx ON designs (created_at DESC);
  CREATE TABLE IF NOT EXISTS design_likes (
    design_id   BIGINT NOT NULL REFERENCES designs(id),
    user_id     BIGINT NOT NULL REFERENCES users(id),
    PRIMARY KEY (design_id, user_id)
  );
  ALTER TABLE designs ALTER COLUMN user_id DROP NOT NULL;
  ALTER TABLE designs ADD COLUMN IF NOT EXISTS listed BOOLEAN NOT NULL DEFAULT true;
  ALTER TABLE games ADD COLUMN IF NOT EXISTS design_id BIGINT REFERENCES designs(id);
  ALTER TABLE games ADD COLUMN IF NOT EXISTS design_clean BOOLEAN NOT NULL DEFAULT false;
  CREATE INDEX IF NOT EXISTS games_design_idx ON games (design_id, score DESC);
`

/** Postgres when DATABASE_URL is set, PGlite otherwise; both answer `query(sql, params) → { rows }`. */
async function openDatabase() {
  const url = process.env.DATABASE_URL
  if (url) {
    const { default: pg } = await import('pg')
    // Managed databases often sit behind TLS with their own certificates.
    const ssl = /sslmode=(require|verify)/.test(url) ? { rejectUnauthorized: false } : undefined
    const pool = new pg.Pool({ connectionString: url, ssl, max: 5 })
    await pool.query(SCHEMA)
    return { kind: 'postgres', query: (sql, params) => pool.query(sql, params) }
  }
  // Kept on disk, so restarting the local server keeps accounts and games.
  const dir = process.env.PGLITE_DIR ?? resolve(fileURLToPath(new URL('../.data/pglite', import.meta.url)))
  console.warn(`DATABASE_URL is not set: using PGlite in ${dir}.`)
  await mkdir(dir, { recursive: true })
  const { PGlite } = await import('@electric-sql/pglite')
  const db = new PGlite(dir)
  await db.exec(SCHEMA)
  return { kind: 'pglite', query: (sql, params) => db.query(sql, params) }
}

/* ─── Codes and names ─────────────────────────────────────────────────── */

const CODE_RE = /^([A-Za-z]{4})[#\-_ ]?(\d{4})$/
/** BORK#4821, bork-4821, BORK4821 → BORK#4821; anything else → null. */
function normalizeCode(raw) {
  const m = String(raw ?? '').trim().match(CODE_RE)
  return m ? `${m[1].toUpperCase()}#${m[2]}` : null
}
const newGameCode = () => `${WORDS[randomInt(WORDS.length)]}#${String(randomInt(10000)).padStart(4, '0')}`

/** A secret login code: four groups of four, no look-alike letters. */
const LOGIN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function newLoginCode() {
  const bytes = randomBytes(16)
  const chars = [...bytes].map((b) => LOGIN_ALPHABET[b % LOGIN_ALPHABET.length])
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join('')).join('-')
}
const hashToken = (code) => createHash('sha256').update(String(code).trim().toUpperCase()).digest('hex')

const NAME_RE = /^[A-Za-z0-9_-]{1,12}$/
const nameKey = (name) => name.toLowerCase()

/* ─── Checking input ──────────────────────────────────────────────────── */

const CODES = new Set(['u', 'd', 'l', 'r', 'i'])
const int = (v, min, max) => Number.isInteger(v) && v >= min && v <= max

/** A cleaned replay, or a reason it was refused. */
function checkReplay(r) {
  if (!r || r.v !== 1) return 'replay missing or unknown version'
  if (!int(r.seed, 0, 2 ** 32 - 1)) return 'replay seed is invalid'
  if (!int(r.cols, 12, 400) || !int(r.rows, 12, 400)) return 'replay grid is invalid'
  if (!int(r.steps, 1, 2_000_000)) return 'replay length is invalid'
  if (!Array.isArray(r.events) || r.events.length > r.steps * 2 + 16) return 'replay inputs are invalid'
  let last = 0
  for (const e of r.events) {
    if (!Array.isArray(e) || e.length !== 2 || !int(e[0], last, r.steps) || !CODES.has(e[1])) return 'replay inputs are invalid'
    last = e[0]
  }
  const mode = r.mode === 'hardcore' ? 'hardcore' : 'normal'
  const out = { v: 1, mode, seed: r.seed, cols: r.cols, rows: r.rows, steps: r.steps, events: r.events }
  // A changed game's design rides along so the run plays back the same; the game checks it on load.
  if (r.design !== undefined) {
    if (!r.design || typeof r.design !== 'object' || Array.isArray(r.design) || JSON.stringify(r.design).length > 200_000) return 'replay design is invalid'
    out.design = r.design
  }
  return out
}

/** JSON with keys sorted, so two designs compare equal however their keys were ordered (JSONB reorders them). */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`
  return JSON.stringify(value)
}

/** A shared design: a plain object of reasonable size. The game cleans it again when it loads it. */
function checkDesign(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return 'design missing'
  if (JSON.stringify(d).length > 200_000) return 'design is too big'
  if (!d.global || typeof d.global !== 'object') return 'design has no global settings'
  return null
}
/** A design's share code: six letters and digits, no look-alikes (K7QM2X), easy to read out or type. */
const newSlug = () => [...randomBytes(6)].map((b) => LOGIN_ALPHABET[b % LOGIN_ALPHABET.length]).join('')

function checkEmail(raw) {
  if (raw == null || raw === '') return null
  if (typeof raw !== 'string' || raw.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim())) return false
  return raw.trim()
}

/* ─── HTTP helpers ────────────────────────────────────────────────────── */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

function send(res, status, body, headers = {}) {
  const raw = typeof body === 'string' || Buffer.isBuffer(body)
  res.writeHead(status, {
    'content-type': raw ? 'text/plain; charset=utf-8' : 'application/json',
    'x-content-type-options': 'nosniff',
    ...headers,
  })
  res.end(raw ? body : JSON.stringify(body))
}

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message)
    this.status = status
    this.extra = extra
  }
}

function readBody(req) {
  return new Promise((ok, fail) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY) {
        fail(new HttpError(413, 'request too large'))
        req.destroy()
      } else chunks.push(chunk)
    })
    req.on('end', () => ok(Buffer.concat(chunks).toString('utf8')))
    req.on('error', fail)
  })
}

async function readJson(req) {
  try {
    const body = JSON.parse(await readBody(req))
    if (!body || typeof body !== 'object') throw new Error()
    return body
  } catch (err) {
    throw err instanceof HttpError ? err : new HttpError(400, 'expected a JSON object')
  }
}

/** Per address and kind: at most `max` in a minute. */
const recent = new Map()
function limit(ip, kind, max) {
  const key = `${kind}:${ip}`
  const now = Date.now()
  const times = (recent.get(key) ?? []).filter((t) => now - t < 60_000)
  times.push(now)
  recent.set(key, times)
  if (times.length > max) throw new HttpError(429, 'too many at once, try again in a minute')
}

const clientIp = (req) => (req.headers['x-forwarded-for']?.split(',')[0] ?? req.socket.remoteAddress ?? '').trim()
const ipHash = (ip) => createHash('sha256').update(ip).digest('hex').slice(0, 16)

async function serveStatic(res, pathname) {
  let file
  try {
    file = normalize(join(DIST, decodeURIComponent(pathname)))
  } catch {
    file = ''
  }
  if (!file.startsWith(DIST)) file = join(DIST, 'index.html')
  try {
    if (!(await stat(file)).isFile()) file = join(DIST, 'index.html')
  } catch {
    file = join(DIST, 'index.html')
  }
  try {
    const data = await readFile(file)
    // Hashed build assets never change; the page itself always revalidates.
    const cache = file.includes(`${DIST}/assets/`) ? 'public, max-age=31536000, immutable' : 'no-cache'
    send(res, 200, data, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': cache })
  } catch {
    send(res, 404, 'Not found')
  }
}

/* ─── The API ─────────────────────────────────────────────────────────── */

const MODES = new Set(['normal', 'hardcore'])
const gameRow = (r) => ({
  code: r.code,
  mode: r.mode ?? 'normal',
  name: r.name ?? null,
  score: r.score,
  level: r.level,
  steps: r.steps,
  cheated: r.cheated,
  created_at: new Date(r.created_at).toISOString(),
})
const scoreRow = (r) => ({
  id: Number(r.id),
  mode: r.mode ?? 'normal',
  name: r.name,
  code: r.code ?? null,
  score: r.score,
  level: r.level,
  steps: r.steps,
  created_at: new Date(r.created_at).toISOString(),
})

function api(db) {
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

  return {
    async health() {
      return { ok: true, store: db.kind }
    },

    async createUser(req) {
      limit(clientIp(req), 'user', 10)
      const { name: raw } = await readJson(req)
      const name = typeof raw === 'string' ? raw.trim() : ''
      if (!NAME_RE.test(name)) throw new HttpError(400, 'names are 1 to 12 letters, digits, - or _')
      const code = newLoginCode()
      try {
        await db.query('INSERT INTO users (name, name_key, token_hash) VALUES ($1, $2, $3)', [name, nameKey(name), hashToken(code)])
      } catch (err) {
        if (err.code === '23505') throw new HttpError(409, `${name} is taken`, { suggestions: await suggestions(name) })
        throw err
      }
      return { status: 201, body: { name, code } }
    },

    async login(req) {
      limit(clientIp(req), 'login', 10)
      const { code } = await readJson(req)
      const { rows } = await db.query('SELECT name FROM users WHERE token_hash = $1', [hashToken(code ?? '')])
      if (!rows[0]) throw new HttpError(401, 'that login code is not recognised')
      return { name: rows[0].name }
    },

    async me(req) {
      const user = await userFrom(req, true)
      return { name: user.name }
    },

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
      for (let attempt = 0; attempt < 8; attempt++) {
        const code = newGameCode()
        try {
          await db.query(
            `INSERT INTO games (code, user_id, score, level, steps, cheated, mode, replay, ip_hash, design_id, design_clean)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [code, user?.id ?? null, body.score, body.level, replay.steps, body.cheated === true, mode, replay, ipHash(clientIp(req)), designId, clean],
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

    /* ─── Explore: shared designs ─── */

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

const designRow = (r) => ({
  slug: r.slug,
  name: r.name,
  about: r.about,
  author: r.author ?? 'guest',
  plays: r.plays,
  likes: r.likes,
  liked: !!r.liked,
  levels: Number(r.levels ?? 0),
  items: Number(r.items ?? 0),
  created_at: new Date(r.created_at).toISOString(),
})

/* ─── Routing ─────────────────────────────────────────────────────────── */

async function main() {
  const db = await openDatabase()
  const routes = api(db)

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://local')
    const path = url.pathname
    const get = req.method === 'GET'
    const post = req.method === 'POST'
    try {
      let out
      let m
      if (path === '/api/health' && get) out = await routes.health()
      else if (path === '/api/users' && post) out = await routes.createUser(req)
      else if (path === '/api/login' && post) out = await routes.login(req)
      else if (path === '/api/me' && get) out = await routes.me(req)
      else if (path === '/api/me/games' && get) out = await routes.myGames(req)
      else if (path === '/api/games' && post) out = await routes.saveGame(req)
      else if (path === '/api/games' && get) out = await routes.searchGames(url.searchParams.get('q'))
      else if ((m = path.match(/^\/api\/games\/([^/]+)$/)) && get) out = await routes.getGame(decodeURIComponent(m[1]))
      else if (path === '/api/scores' && get) out = await routes.board(url.searchParams.get('limit'), url.searchParams.get('mode'))
      else if (path === '/api/scores' && post) out = await routes.addScore(req)
      else if ((m = path.match(/^\/api\/scores\/(\d+)$/)) && get) out = await routes.boardEntry(Number(m[1]))
      else if (path === '/api/designs' && get) out = await routes.listDesigns(req, url.searchParams)
      else if (path === '/api/designs' && post) out = await routes.publishDesign(req)
      else if ((m = path.match(/^\/api\/designs\/([\w]{1,16})$/)) && get) out = await routes.getDesign(req, m[1])
      else if ((m = path.match(/^\/api\/designs\/([\w]{1,16})$/)) && req.method === 'DELETE') out = await routes.removeDesign(req, m[1])
      else if ((m = path.match(/^\/api\/designs\/([\w]{1,16})\/like$/)) && post) out = await routes.likeDesign(req, m[1])
      else if ((m = path.match(/^\/api\/designs\/([\w]{1,16})\/play$/)) && post) out = await routes.playedDesign(req, m[1])
      else if (path.startsWith('/api/')) throw new HttpError(404, 'not found')
      else if (!get && req.method !== 'HEAD') throw new HttpError(405, 'method not allowed')
      else return serveStatic(res, path)
      const { status, body } = out && 'status' in out && 'body' in out ? out : { status: 200, body: out }
      send(res, status, body, { 'cache-control': 'no-store' })
    } catch (err) {
      if (err instanceof HttpError) return send(res, err.status, { error: err.message, ...err.extra })
      console.error(err)
      send(res, 500, { error: 'server error' })
    }
  })

  server.listen(PORT, () => console.log(`Laserwyrm on :${PORT} (${db.kind})`))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
