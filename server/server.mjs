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
 *
 * Layout: this file only routes. Handlers live in api/ (one file per group
 * above), database setup in db.mjs, input checks in checks.mjs, HTTP helpers
 * and static files in http.mjs, multiplayer rooms in rooms.mjs and the MCP
 * tools in mcp.mjs.
 */
import { createServer } from 'node:http'
import * as core from '../src/designCore.ts'
import { api } from './api/index.mjs'
import { openDatabase } from './db.mjs'
import { HttpError, send, serveStatic } from './http.mjs'
import { attachRooms } from './rooms.mjs'

const PORT = Number(process.env.PORT) || 8080

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
      else if (path === '/api/me' && req.method === 'PATCH') out = await routes.rename(req)
      else if (path === '/api/me/look' && req.method === 'PUT') out = await routes.saveLook(req)
      else if (path === '/api/me/scores' && get) out = await routes.myScores(req)
      else if ((m = path.match(/^\/api\/me\/scores\/(\d+)$/)) && req.method === 'DELETE') out = await routes.removeScore(req, Number(m[1]))
      else if (path === '/api/scores/time' && get) out = await routes.playTime(url.searchParams.get('limit'))
      else if (path === '/api/me/games' && get) out = await routes.myGames(req)
      else if (path === '/api/games' && post) out = await routes.saveGame(req)
      else if (path === '/api/games' && get) out = await routes.searchGames(url.searchParams.get('q'))
      else if ((m = path.match(/^\/api\/games\/([^/]+)$/)) && get) out = await routes.getGame(decodeURIComponent(m[1]))
      else if (path === '/api/scores/rank' && get) out = await routes.rank(url.searchParams.get('score'), url.searchParams.get('mode'))
      else if (path === '/api/scores' && get) out = await routes.board(url.searchParams.get('limit'), url.searchParams.get('mode'))
      else if (path === '/api/scores' && post) out = await routes.addScore(req)
      else if ((m = path.match(/^\/api\/scores\/(\d+)$/)) && get) out = await routes.boardEntry(Number(m[1]))
      else if (path === '/mcp' && post) out = await routes.mcp(req)
      else if (path === '/mcp') throw new HttpError(405, 'POST MCP messages here (Streamable HTTP, JSON replies)')
      else if (path === '/api/me/library' && get) out = await routes.library(req, url.searchParams.get('since'))
      else if ((m = path.match(/^\/api\/me\/library\/([\w-]{1,16})$/)) && req.method === 'PUT') out = await routes.putGame(req, m[1])
      else if ((m = path.match(/^\/api\/me\/library\/([\w-]{1,16})$/)) && req.method === 'DELETE') out = await routes.deleteGame(req, m[1])
      else if (path === '/api/me/agent-keys' && get) out = await routes.agentKeys(req)
      else if (path === '/api/me/agent-keys' && post) out = await routes.newAgentKey(req)
      else if ((m = path.match(/^\/api\/me\/agent-keys\/(\d+)$/)) && req.method === 'DELETE') out = await routes.revokeAgentKey(req, Number(m[1]))
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

  // Multiplayer rooms: a WebSocket at /mp.
  attachRooms(server, core)
  server.listen(PORT, () => console.log(`Laserwyrm on :${PORT} (${db.kind})`))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
