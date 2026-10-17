/**
 * Laserwyrm's server: the built game, plus a small high-score API.
 *
 *   GET  /api/scores?limit=50   the board, best first (no emails)
 *   GET  /api/scores/:id        one entry with its replay
 *   POST /api/scores            { name, email?, score, level, replay }
 *   GET  /api/health
 *
 * Scores live in Postgres (DATABASE_URL). Without it the server keeps them in
 * memory, which is enough for local work and is said loudly on start.
 * A replay is the run's seed, grid and inputs; the game replays it exactly.
 */
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = Number(process.env.PORT) || 8080
const DIST = resolve(fileURLToPath(new URL('../dist', import.meta.url)))
const MAX_BODY = 256 * 1024
const BOARD_MAX = 100

/* ─── Storage ─────────────────────────────────────────────────────────── */

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS scores (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    email       TEXT,
    score       INTEGER NOT NULL,
    level       INTEGER NOT NULL,
    steps       INTEGER NOT NULL,
    replay      JSONB NOT NULL,
    ip_hash     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS scores_score_idx ON scores (score DESC, created_at ASC);
`

function memoryStore() {
  const rows = []
  let id = 0
  return {
    kind: 'memory',
    async top(limit) {
      return [...rows].sort((a, b) => b.score - a.score || a.created_at - b.created_at).slice(0, limit).map(publicRow)
    },
    async get(wanted) {
      const row = rows.find((r) => r.id === wanted)
      return row ? { ...publicRow(row), replay: row.replay } : null
    },
    async add(entry) {
      const row = { ...entry, id: ++id, created_at: new Date() }
      rows.push(row)
      return { id: row.id, rank: rows.filter((r) => r.score > row.score).length + 1 }
    },
  }
}

async function postgresStore(url) {
  const { default: pg } = await import('pg')
  // Managed databases often sit behind TLS with their own certificates.
  const ssl = /sslmode=(require|verify)/.test(url) ? { rejectUnauthorized: false } : undefined
  const pool = new pg.Pool({ connectionString: url, ssl, max: 5 })
  await pool.query(SCHEMA)
  return {
    kind: 'postgres',
    async top(limit) {
      const { rows } = await pool.query(
        'SELECT id, name, score, level, steps, created_at FROM scores ORDER BY score DESC, created_at ASC LIMIT $1',
        [limit],
      )
      return rows.map(publicRow)
    },
    async get(id) {
      const { rows } = await pool.query(
        'SELECT id, name, score, level, steps, created_at, replay FROM scores WHERE id = $1',
        [id],
      )
      return rows[0] ? { ...publicRow(rows[0]), replay: rows[0].replay } : null
    },
    async add(entry) {
      const { rows } = await pool.query(
        `INSERT INTO scores (name, email, score, level, steps, replay, ip_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [entry.name, entry.email, entry.score, entry.level, entry.steps, entry.replay, entry.ip_hash],
      )
      const ahead = await pool.query('SELECT count(*)::int AS n FROM scores WHERE score > $1', [entry.score])
      return { id: Number(rows[0].id), rank: ahead.rows[0].n + 1 }
    },
  }
}

/** What anyone may see of an entry: never the email or IP. */
const publicRow = (r) => ({
  id: Number(r.id),
  name: r.name,
  score: r.score,
  level: r.level,
  steps: r.steps,
  created_at: new Date(r.created_at).toISOString(),
})

/* ─── Checking a submission ───────────────────────────────────────────── */

const CODES = new Set(['u', 'd', 'l', 'r', 'i'])
const int = (v, min, max) => Number.isInteger(v) && v >= min && v <= max

/** Returns the cleaned entry, or a reason it was refused. */
function validate(body) {
  if (!body || typeof body !== 'object') return 'expected a JSON object'
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name || name.length > 12) return 'name must be 1 to 12 characters'
  if (/[\u0000-\u001f\u007f]/.test(name)) return 'name has control characters'
  let email = null
  if (body.email != null && body.email !== '') {
    if (typeof body.email !== 'string' || body.email.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
      return 'email does not look right'
    }
    email = body.email.trim()
  }
  if (!int(body.score, 0, 2_000_000_000)) return 'score must be a whole number'
  if (!int(body.level, 1, 100)) return 'level must be 1 to 100'
  const r = body.replay
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
  const replay = { v: 1, seed: r.seed, cols: r.cols, rows: r.rows, steps: r.steps, events: r.events }
  return { name, email, score: body.score, level: body.level, steps: r.steps, replay }
}

/* ─── HTTP ────────────────────────────────────────────────────────────── */

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
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)
  res.writeHead(status, {
    'content-type': typeof body === 'object' && !Buffer.isBuffer(body) ? 'application/json' : 'text/plain; charset=utf-8',
    'x-content-type-options': 'nosniff',
    ...headers,
  })
  res.end(data)
}

function readBody(req) {
  return new Promise((ok, fail) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY) {
        fail(Object.assign(new Error('too large'), { status: 413 }))
        req.destroy()
      } else chunks.push(chunk)
    })
    req.on('end', () => ok(Buffer.concat(chunks).toString('utf8')))
    req.on('error', fail)
  })
}

/** At most 6 submissions a minute from one address. */
const recent = new Map()
function limited(ip) {
  const now = Date.now()
  const times = (recent.get(ip) ?? []).filter((t) => now - t < 60_000)
  times.push(now)
  recent.set(ip, times)
  return times.length > 6
}

const clientIp = (req) => (req.headers['x-forwarded-for']?.split(',')[0] ?? req.socket.remoteAddress ?? '').trim()

async function serveStatic(req, res, pathname) {
  const wanted = normalize(join(DIST, decodeURIComponent(pathname)))
  let file = wanted.startsWith(DIST) ? wanted : join(DIST, 'index.html')
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

async function main() {
  let store
  if (process.env.DATABASE_URL) {
    store = await postgresStore(process.env.DATABASE_URL)
  } else {
    console.warn('DATABASE_URL is not set: scores are kept in memory and vanish on restart.')
    store = memoryStore()
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://local')
    const path = url.pathname
    try {
      if (path === '/api/health') return send(res, 200, { ok: true, store: store.kind })

      if (path === '/api/scores' && req.method === 'GET') {
        const limit = Math.min(BOARD_MAX, Math.max(1, Number(url.searchParams.get('limit')) || 50))
        return send(res, 200, { scores: await store.top(limit) }, { 'cache-control': 'no-cache' })
      }

      if (path === '/api/scores' && req.method === 'POST') {
        const ip = clientIp(req)
        if (limited(ip)) return send(res, 429, { error: 'too many scores at once, try again in a minute' })
        let body
        try {
          body = JSON.parse(await readBody(req))
        } catch (err) {
          return send(res, err.status ?? 400, { error: err.status === 413 ? 'replay too large' : 'not valid JSON' })
        }
        const entry = validate(body)
        if (typeof entry === 'string') return send(res, 400, { error: entry })
        const ip_hash = createHash('sha256').update(ip).digest('hex').slice(0, 16)
        const saved = await store.add({ ...entry, ip_hash })
        return send(res, 201, saved)
      }

      const one = path.match(/^\/api\/scores\/(\d+)$/)
      if (one && req.method === 'GET') {
        const entry = await store.get(Number(one[1]))
        return entry ? send(res, 200, entry) : send(res, 404, { error: 'no such score' })
      }

      if (path.startsWith('/api/')) return send(res, 404, { error: 'not found' })
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed')
      return serveStatic(req, res, path)
    } catch (err) {
      console.error(err)
      send(res, 500, { error: 'server error' })
    }
  })

  server.listen(PORT, () => console.log(`Laserwyrm on :${PORT} (${store.kind} scores)`))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
