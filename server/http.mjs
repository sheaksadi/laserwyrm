/**
 * HTTP plumbing: JSON replies (compressed when big), reading request
 * bodies, errors with a status, per-address rate limits, and serving the
 * built game from dist/ with caching.
 */
import { createHash } from 'node:crypto'
import { brotliCompressSync, constants as zlib, gzipSync } from 'node:zlib'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIST = resolve(fileURLToPath(new URL('../dist', import.meta.url)))
const MAX_BODY = 512 * 1024

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

/** The best compression the client takes: br, gzip, or none. */
function encodingFor(req) {
  const accept = String(req?.headers['accept-encoding'] ?? '')
  return /\bbr\b/.test(accept) ? 'br' : /\bgzip\b/.test(accept) ? 'gzip' : null
}
const compress = (data, enc) =>
  enc === 'br' ? brotliCompressSync(data, { params: { [zlib.BROTLI_PARAM_QUALITY]: 5 } }) : gzipSync(data, { level: 6 })

export function send(res, status, body, headers = {}) {
  const raw = typeof body === 'string' || Buffer.isBuffer(body)
  if (body === null) {
    res.writeHead(status, { 'x-content-type-options': 'nosniff', ...headers })
    return res.end()
  }
  let data = Buffer.from(raw ? body : JSON.stringify(body))
  const extra = {}
  // Bigger answers (a library, a replay, a design) go compressed; small ones are not worth it.
  const enc = data.length > 1024 ? encodingFor(res.req) : null
  if (enc) {
    data = compress(data, enc)
    extra['content-encoding'] = enc
    extra.vary = 'accept-encoding'
  }
  res.writeHead(status, {
    'content-type': raw ? 'text/plain; charset=utf-8' : 'application/json',
    'x-content-type-options': 'nosniff',
    'content-length': data.length,
    ...extra,
    ...headers,
  })
  res.end(data)
}

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message)
    this.status = status
    this.extra = extra
  }
}

export function readBody(req) {
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

export async function readJson(req) {
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
// Forget addresses quiet for a minute, so the map does not grow forever.
setInterval(() => {
  const now = Date.now()
  for (const [key, times] of recent) if (!times.length || now - times[times.length - 1] > 60_000) recent.delete(key)
}, 60_000).unref()
export function limit(ip, kind, max) {
  const key = `${kind}:${ip}`
  const now = Date.now()
  const times = (recent.get(key) ?? []).filter((t) => now - t < 60_000)
  times.push(now)
  recent.set(key, times)
  if (times.length > max) throw new HttpError(429, 'too many at once, try again in a minute')
}

export const clientIp = (req) => (req.headers['x-forwarded-for']?.split(',')[0] ?? req.socket.remoteAddress ?? '').trim()
export const ipHash = (ip) => createHash('sha256').update(ip).digest('hex').slice(0, 16)

export async function serveStatic(res, pathname) {
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
    const entry = await staticEntry(file)
    // Hashed build assets never change; the page itself always revalidates (cheaply: its ETag).
    const cache = file.includes(`${DIST}/assets/`) ? 'public, max-age=31536000, immutable' : 'no-cache'
    const type = MIME[extname(file)] ?? 'application/octet-stream'
    if (res.req.headers['if-none-match'] === entry.etag) {
      res.writeHead(304, { etag: entry.etag, 'cache-control': cache })
      return res.end()
    }
    const enc = entry.compressible ? encodingFor(res.req) : null
    const data = enc ? (entry[enc] ??= compress(entry.raw, enc)) : entry.raw
    res.writeHead(200, {
      'content-type': type,
      'cache-control': cache,
      etag: entry.etag,
      'content-length': data.length,
      vary: 'accept-encoding',
      'x-content-type-options': 'nosniff',
      ...(enc ? { 'content-encoding': enc } : {}),
    })
    res.end(data)
  } catch {
    send(res, 404, 'Not found')
  }
}

/** Built files, read once and kept with their compressed forms (made the first time they are asked for). */
const staticCache = new Map()
async function staticEntry(file) {
  const mtime = (await stat(file)).mtimeMs
  const hit = staticCache.get(file)
  if (hit && hit.mtime === mtime) return hit
  const raw = await readFile(file)
  const entry = {
    mtime,
    raw,
    etag: `"${createHash('sha1').update(raw).digest('base64url').slice(0, 16)}"`,
    compressible: /\.(html|js|css|json|svg|txt|map)$/.test(file) && raw.length > 512,
  }
  staticCache.set(file, entry)
  return entry
}
