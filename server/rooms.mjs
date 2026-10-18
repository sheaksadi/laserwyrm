/**
 * Multiplayer rooms, over one WebSocket per player at /mp.
 *
 * A room has a six-digit code, up to MAX_PLAYERS players and a host, who
 * picks the game (the main one or a custom design) and the mode, then
 * starts it. The server hands everyone the same seed and grid, so all play
 * the same game; it does not run the game itself.
 *
 * Text frames are JSON control messages (create, join, settings, start,
 * final, signal, leave). Binary frames are the players' snake updates: the
 * server stamps the sender's index into byte 1 and passes them on to the
 * rest of the room. Players who manage a WebRTC link send those updates
 * peer to peer instead; the server relays the signalling for that.
 */
import { randomInt } from 'node:crypto'
import { WebSocketServer } from 'ws'

const MAX_PLAYERS = 6
const MAX_DESIGN_BYTES = 96 * 1024
const COUNTDOWN_MS = 3000
/** Binary updates a player may send per second before the extras are dropped. */
const PACKETS_PER_SECOND = 40
const MODES = {
  score: { respawn: true },
  sprint: { respawn: true },
  survival: { respawn: false },
}
const MINUTES = [1, 2, 3, 5]
const TARGETS = [1000, 2500, 5000]

/** @type {Map<string, Room>} */
const rooms = new Map()

/**
 * @typedef {{ index: number; name: string; ws: import('ws').WebSocket; final: null | { score: number; ms: number } }} Player
 * @typedef {{ code: string; host: number; players: Map<number, Player>; phase: 'lobby' | 'playing' | 'results'; settings: object; design: object | null; timer: NodeJS.Timeout | null; results: object[] | null }} Room
 */

function newCode() {
  for (;;) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
    if (!rooms.has(code)) return code
  }
}

const cleanName = (name) => (String(name ?? '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 16) || 'Wyrm')

function cleanSettings(raw, core) {
  const s = raw && typeof raw === 'object' ? raw : {}
  const mode = s.mode in MODES ? s.mode : 'score'
  const out = {
    mode,
    minutes: MINUTES.includes(s.minutes) ? s.minutes : 3,
    target: TARGETS.includes(s.target) ? s.target : 2500,
    game: String(s.game ?? 'Main game').slice(0, 40),
  }
  let design = null
  if (s.design && typeof s.design === 'object' && JSON.stringify(s.design).length <= MAX_DESIGN_BYTES) {
    try {
      design = core.compact(core.cleanDesign(s.design))
    } catch {
      design = null
    }
  }
  if (!design) out.game = 'Main game'
  return { settings: out, design }
}

const send = (ws, msg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg))

function snapshot(room) {
  return {
    t: 'room',
    code: room.code,
    host: room.host,
    phase: room.phase,
    settings: room.settings,
    hasDesign: !!room.design,
    players: [...room.players.values()].map((p) => ({ index: p.index, name: p.name })),
    results: room.results,
  }
}
function broadcast(room, msg, except) {
  for (const p of room.players.values()) if (p.index !== except) send(p.ws, msg)
}
const announce = (room) => {
  for (const p of room.players.values()) send(p.ws, { ...snapshot(room), you: p.index })
}

/** Everyone has finished (or the clock ran out): rank them and say so. */
function finish(room) {
  if (room.phase !== 'playing') return
  clearTimeout(room.timer)
  room.timer = null
  room.phase = 'results'
  const survival = room.settings.mode === 'survival'
  room.results = [...room.players.values()]
    .map((p) => ({ index: p.index, name: p.name, score: p.final?.score ?? 0, ms: p.final?.ms ?? 0, left: !p.final }))
    .sort((a, b) => (survival ? b.ms - a.ms || b.score - a.score : b.score - a.score))
  announce(room)
}
const allFinal = (room) => [...room.players.values()].every((p) => p.final)

function leave(room, player) {
  room.players.delete(player.index)
  if (!room.players.size) {
    clearTimeout(room.timer)
    rooms.delete(room.code)
    return
  }
  if (room.host === player.index) room.host = [...room.players.keys()][0]
  broadcast(room, { t: 'left', index: player.index })
  if (room.phase === 'playing' && allFinal(room)) finish(room)
  announce(room)
}

export function attachRooms(server, core) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 128 * 1024 })
  server.on('upgrade', (req, socket, head) => {
    if (new URL(req.url ?? '/', 'http://local').pathname !== '/mp') return socket.destroy()
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws))
  })

  wss.on('connection', (ws) => {
    /** @type {Room | null} */
    let room = null
    /** @type {Player | null} */
    let me = null
    let budget = PACKETS_PER_SECOND
    const refill = setInterval(() => (budget = PACKETS_PER_SECOND), 1000)
    // Dead connections (a phone gone to sleep) are noticed by a missed ping.
    let alive = true
    ws.on('pong', () => (alive = true))
    const ping = setInterval(() => {
      if (!alive) return ws.terminate()
      alive = false
      ws.ping()
    }, 15000)

    const enter = (target, name) => {
      if (target.players.size >= MAX_PLAYERS) return send(ws, { t: 'error', message: 'That room is full.' })
      if (target.phase === 'playing') return send(ws, { t: 'error', message: 'That room is mid-game; try again when it ends.' })
      let index = 0
      while (target.players.has(index)) index++
      room = target
      // Two of the same name get a number, so the scoreboard tells them apart.
      const base = cleanName(name)
      const taken = new Set([...target.players.values()].map((p) => p.name))
      let unique = base
      for (let n = 2; taken.has(unique); n++) unique = `${base.slice(0, 13)} ${n}`
      me = { index, name: unique, ws, final: null }
      target.players.set(index, me)
      announce(target)
      if (target.design) send(ws, { t: 'design', design: target.design })
    }

    ws.on('message', (data, binary) => {
      if (binary) {
        // A snake update: stamp who sent it, pass it on.
        if (!room || !me || room.phase !== 'playing' || budget-- <= 0) return
        const buf = Buffer.from(data)
        if (buf.length < 15 || buf.length > 2048) return
        buf[1] = me.index
        for (const p of room.players.values()) if (p !== me && p.ws.readyState === p.ws.OPEN) p.ws.send(buf, { binary: true })
        return
      }
      let msg
      try {
        msg = JSON.parse(String(data))
      } catch {
        return
      }
      if (!msg || typeof msg !== 'object') return
      const isHost = room && me && room.host === me.index
      switch (msg.t) {
        case 'create': {
          if (room) return
          const fresh = { code: newCode(), host: 0, players: new Map(), phase: 'lobby', settings: null, design: null, timer: null, results: null }
          Object.assign(fresh, cleanSettings(msg.settings, core))
          rooms.set(fresh.code, fresh)
          enter(fresh, msg.name)
          return
        }
        case 'join': {
          if (room) return
          const target = rooms.get(String(msg.code ?? '').replace(/\D/g, ''))
          if (!target) return send(ws, { t: 'error', message: 'No room with that code.' })
          enter(target, msg.name)
          return
        }
        case 'settings': {
          if (!isHost || room.phase === 'playing') return
          Object.assign(room, cleanSettings(msg.settings, core))
          room.phase = 'lobby'
          room.results = null
          if (room.design) broadcast(room, { t: 'design', design: room.design })
          announce(room)
          return
        }
        case 'start': {
          if (!isHost || room.phase === 'playing') return
          const cols = Math.max(12, Math.min(80, Number(msg.cols) | 0))
          const rows = Math.max(8, Math.min(60, Number(msg.rows) | 0))
          room.phase = 'playing'
          room.results = null
          for (const p of room.players.values()) p.final = null
          const start = { t: 'start', seed: randomInt(0, 2 ** 32), cols, rows, in: COUNTDOWN_MS, settings: room.settings }
          broadcast(room, start)
          announce(room)
          // Timed games end on the clock even if someone never reports.
          const limit = room.settings.mode === 'score' ? room.settings.minutes * 60_000 + COUNTDOWN_MS + 8000 : 30 * 60_000
          room.timer = setTimeout(() => finish(room), limit)
          return
        }
        case 'final': {
          if (!room || !me || room.phase !== 'playing' || me.final) return
          me.final = { score: Math.max(0, Number(msg.score) | 0), ms: Math.max(0, Number(msg.ms) | 0) }
          // A sprint ends when the first player reaches the target.
          if (room.settings.mode === 'sprint' && msg.reached) broadcast(room, { t: 'end' }, me.index)
          if (allFinal(room)) finish(room)
          return
        }
        case 'lobby': {
          // Back from the results to pick the next game.
          if (!isHost || room.phase !== 'results') return
          room.phase = 'lobby'
          room.results = null
          announce(room)
          return
        }
        case 'signal': {
          if (!room || !me) return
          const to = room.players.get(Number(msg.to))
          if (to) send(to.ws, { t: 'signal', from: me.index, data: msg.data })
          return
        }
        case 'leave': {
          if (room && me) leave(room, me)
          room = null
          me = null
          return
        }
      }
    })

    ws.on('close', () => {
      clearInterval(refill)
      clearInterval(ping)
      if (room && me) leave(room, me)
    })
  })
}
