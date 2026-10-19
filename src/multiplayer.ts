/**
 * Multiplayer: rooms with a six-digit code, everyone playing the same seed
 * on their own board, the others' snakes shown as holograms on yours.
 *
 * Control messages (create, join, the host's settings, start, results) are
 * JSON over a WebSocket at /mp. The snakes themselves go as small binary
 * packets, one per game step: peer to peer over a WebRTC data channel when
 * one opens (unordered, no resends, so a late packet never holds up a newer
 * one), otherwise through the server, which passes them on. Each packet
 * carries a sequence number, so duplicates and stragglers are dropped.
 *
 * A packet: type u8 · sender u8 · seq u16 · score u32 · hearts u8 · level u8
 * · flags u8 · head x u8 · head y u8 · length u16, then the body as 2-bit
 * steps from the head (right, down, left, up), four to a byte. A 40-cell
 * snake is 25 bytes.
 *
 * Packets are kept as they come and shown on the next game step, so the
 * others' snakes move in time with yours however the network bunches them.
 *
 * Two modes make the snakes meet. Slither: no lasers, and running into
 * another snake (as this board shows it) is a crash; a crashed snake turns to
 * food on every board (sent as a 'crash' message). Domination: eight zones;
 * whoever has the most cells in one takes it and keeps it until someone
 * outnumbers them there, and every zone held scores each beat. Each board
 * works these out for its own snake; the scores travel in the packets.
 */
import { markRaw, reactive, watch } from 'vue'
import { account } from './account'
import { shown } from './looks'
import { library, type Design } from './design'
import { crash, dropPellets, endMatch, fitGrid, goMatch, haltMatch, isActive, match, prepareMatch, state } from './game'

export type MpMode = 'score' | 'sprint' | 'survival' | 'slither' | 'zones'
export interface MpSettings { mode: MpMode; minutes: number; target: number; game: string }
interface Vec { x: number; y: number }
export interface Peer {
  index: number
  name: string
  snake: Vec[]
  score: number
  hearts: number
  level: number
  alive: boolean
  /** The last packet's sequence number, and when it came (performance.now). */
  seq: number
  seen: number
  /** How its packets get here. */
  link: 'p2p' | 'relay'
  /** Score once a second, for how fast it is climbing. */
  samples: { t: number; score: number }[]
}
export interface Standing { index: number; name: string; score: number; ms: number; left: boolean }

export const MODES: Record<MpMode, { name: string; blurb: string }> = {
  survival: { name: 'Survival', blurb: 'Your usual hearts, no respawns. The last snake alive wins.' },
  score: { name: 'Score attack', blurb: 'Most points when the clock runs out. Unlimited lives: you respawn.' },
  sprint: { name: 'Sprint', blurb: 'First to the target score wins. Unlimited lives.' },
  slither: { name: 'Slither', blurb: 'No lasers. Hit another snake and you crash, and turn to food. Most points wins.' },
  zones: { name: 'Domination', blurb: 'Eight zones: outnumber the others in one to take it. Held zones score every beat.' },
}
/** Modes that run on the clock (the rest end on a target or the last snake). */
export const timed = (mode: MpMode) => mode === 'score' || mode === 'slither' || mode === 'zones'
export const MINUTES = [1, 2, 3, 5] as const
export const TARGETS = [1000, 2500, 5000] as const
/** Each player's colour, by their place in the room; your own snake stays green. */
export const PLAYER_COLORS = ['#3FA9FF', '#FF5FB0', '#FFE14D', '#B26BFF', '#FF9966', '#00F0C8']

export const mp = reactive({
  phase: 'off' as 'off' | 'connecting' | 'lobby' | 'countdown' | 'playing' | 'done' | 'results',
  code: '',
  you: -1,
  host: -1,
  players: [] as { index: number; name: string; look?: { hat?: string; color?: string } }[],
  settings: { mode: 'survival', minutes: 3, target: 2500, game: 'Main game' } as MpSettings,
  /** Which of this device's games the host picked ('main' for the main game). */
  gameId: 'main',
  results: null as Standing[] | null,
  error: '',
  /** When play starts and (timed modes) ends, on performance.now(). */
  startsAt: 0,
  endsAt: 0,
  /** Packets out, and how many went peer to peer. */
  sent: 0,
  direct: 0,
  peers: {} as Record<number, Peer>,
  /** Your own score once a second. */
  mine: [] as { t: number; score: number }[],
  /** What this player did when the match ended (for the waiting screen). */
  final: null as null | { score: number; reached: boolean },
})

const NAME_KEY = 'laserwyrm-mp-name'
export const mpName = reactive({ value: readName() })
function readName() {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}
watch(
  () => mpName.value,
  (v) => {
    try {
      localStorage.setItem(NAME_KEY, v)
    } catch {
      /* blocked: the name lasts this visit */
    }
  },
)
/** Your snake's name: your account's, or (not joined) the one typed here. */
export const playerName = () => account.name || mpName.value.trim() || 'Wyrm'
const myName = playerName
const myLook = () => ({ hat: shown.value.hat, color: shown.value.color.id })

export const isHost = () => mp.you === mp.host && mp.you >= 0
export const colorOf = (index: number) => PLAYER_COLORS[index % PLAYER_COLORS.length]!

/* ─── The socket ─────────────────────────────────────────────────────── */

let ws: WebSocket | null = null
let roomDesign: Design | null = null

function connect(): Promise<WebSocket> {
  if (ws && ws.readyState === WebSocket.OPEN) return Promise.resolve(ws)
  mp.phase = 'connecting'
  mp.error = ''
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/mp`)
    socket.binaryType = 'arraybuffer'
    socket.onopen = () => resolve(socket)
    socket.onerror = () => reject(new Error('Could not reach the multiplayer server.'))
    socket.onclose = () => {
      if (ws !== socket) return
      ws = null
      if (mp.phase !== 'off') {
        cleanup()
        mp.error = 'Lost the connection to the room.'
      }
    }
    socket.onmessage = (event) => {
      if (typeof event.data === 'string') onControl(JSON.parse(event.data))
      else receive(event.data as ArrayBuffer, 'relay')
    }
    ws = socket
  })
}
const sendControl = (msg: object) => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify(msg))

/** The design to send for one of this device's games, or null for the main game. */
function designFor(gameId: string): { game: string; design: Design | null } {
  const game = library.games.find((g) => g.id === gameId)
  return game ? { game: game.name, design: JSON.parse(JSON.stringify(game.design)) } : { game: 'Main game', design: null }
}

/** Open a room; with a game id, that game is the one to play (an invite from the custom screen). */
export async function createRoom(gameId = 'main') {
  try {
    await connect()
  } catch (err) {
    return fail(err)
  }
  mp.gameId = gameId
  const { game, design } = designFor(gameId)
  sendControl({ t: 'create', name: myName(), look: myLook(), settings: { ...mp.settings, game, design } })
}

export async function joinRoom(code: string) {
  try {
    await connect()
  } catch (err) {
    return fail(err)
  }
  sendControl({ t: 'join', code, name: myName(), look: myLook() })
}

function fail(err: unknown) {
  mp.phase = 'off'
  mp.error = err instanceof Error ? err.message : String(err)
}

/** The host changes the game or the mode. */
export function setSettings(change: Partial<MpSettings> & { gameId?: string }) {
  if (!isHost()) return
  if (change.gameId !== undefined) mp.gameId = change.gameId
  const { game, design } = designFor(mp.gameId)
  const { gameId: _, ...rest } = change
  sendControl({ t: 'settings', settings: { ...mp.settings, ...rest, game, design } })
}

/** Your name or look changed while in a room: tell the others. */
export function sendProfile() {
  if (mp.phase !== 'off') sendControl({ t: 'profile', name: myName(), look: myLook() })
}
watch(() => [account.name, shown.value.hat, shown.value.color.id], sendProfile)

/** The host starts the game: on this device's grid, so everyone's board is the same. */
export function startMatch() {
  if (!isHost()) return
  fitGrid()
  sendControl({ t: 'start', cols: state.cols, rows: state.rows })
}

/** The host, from the results: back to the lobby to change the game. */
export const backToLobby = () => sendControl({ t: 'lobby' })

export function leaveRoom() {
  sendControl({ t: 'leave' })
  const socket = ws
  ws = null
  socket?.close()
  cleanup()
  mp.error = ''
}

function cleanup() {
  for (const index of Object.keys(links)) dropLink(Number(index))
  stopClock()
  if (match.on) endMatch()
  Object.assign(mp, { phase: 'off', code: '', you: -1, host: -1, players: [], results: null, peers: {}, mine: [], final: null })
  zones.list = []
  incoming = {}
  roomDesign = null
}

function onControl(msg: Record<string, any>) {
  switch (msg.t) {
    case 'room': {
      mp.code = msg.code
      mp.you = msg.you
      mp.host = msg.host
      mp.players = msg.players
      mp.settings = msg.settings
      if (!msg.hasDesign) roomDesign = null
      if (msg.phase === 'results') {
        mp.results = msg.results
        mp.phase = 'results'
        stopClock()
      } else if (msg.phase === 'lobby') {
        // Back to the lobby (or just arrived): any match is over.
        if (match.on) endMatch()
        stopClock()
        mp.results = null
        mp.final = null
        mp.phase = 'lobby'
      }
      for (const p of msg.players as { index: number; name: string }[]) if (mp.peers[p.index]) mp.peers[p.index]!.name = p.name
      // Gone players: no hologram, no link.
      for (const index of Object.keys(mp.peers).map(Number)) {
        if (!msg.players.some((p: { index: number }) => p.index === index)) {
          delete mp.peers[index]
          dropLink(index)
        }
      }
      return
    }
    case 'design':
      roomDesign = msg.design
      return
    case 'start':
      return begin(msg as { seed: number; cols: number; rows: number; in: number; settings: MpSettings })
    case 'end':
      return finish(false)
    case 'crash':
      // Someone crashed (slither): their snake turns to food here too.
      if (match.live && Array.isArray(msg.cells)) dropPellets(msg.cells.filter((c: unknown) => c && typeof (c as Vec).x === 'number' && typeof (c as Vec).y === 'number'))
      return
    case 'left':
      delete mp.peers[msg.index]
      dropLink(msg.index)
      return
    case 'signal':
      return void onSignal(msg.from, msg.data)
    case 'error':
      mp.error = msg.message
      if (mp.phase === 'connecting') mp.phase = 'off'
      return
  }
}

/* ─── A match ────────────────────────────────────────────────────────── */

let goTimer = 0
let clock = 0
let seq = 0

function begin(msg: { seed: number; cols: number; rows: number; in: number; settings: MpSettings }) {
  mp.settings = msg.settings
  const mode = msg.settings.mode
  prepareMatch({ seed: msg.seed, cols: msg.cols, rows: msg.rows, design: roomDesign, respawn: mode !== 'survival', calm: mode === 'slither' })
  mp.startsAt = performance.now() + msg.in
  mp.endsAt = timed(mode) ? mp.startsAt + msg.settings.minutes * 60_000 : 0
  incoming = {}
  if (mode === 'zones') layZones(msg.cols, msg.rows)
  else zones.list = []
  mp.results = null
  mp.final = null
  mp.mine = []
  seq = 0
  mp.sent = 0
  mp.direct = 0
  // Everyone else, waiting for their first packet.
  const peers: Record<number, Peer> = {}
  for (const p of mp.players) {
    if (p.index === mp.you) continue
    peers[p.index] = { index: p.index, name: p.name, snake: [], score: 0, hearts: 0, level: 0, alive: true, seq: -1, seen: 0, link: 'relay', samples: [] }
    // The lower index calls the higher one, so each pair makes one link.
    if (mp.you < p.index && !links[p.index]) void call(p.index)
  }
  mp.peers = peers
  mp.phase = 'countdown'
  clearTimeout(goTimer)
  goTimer = window.setTimeout(() => {
    mp.phase = 'playing'
    goMatch()
    sendState()
    startClock()
  }, msg.in)
}

function startClock() {
  stopClock()
  clock = window.setInterval(() => {
    const t = performance.now()
    sample(mp.mine, t, state.score)
    if (mp.phase !== 'playing') return
    if (mp.endsAt && t >= mp.endsAt) finish(false)
    else if (mp.settings.mode === 'sprint' && state.score >= mp.settings.target) finish(true)
    else if (state.status === 'over') finish(false)
  }, 200)
}
function stopClock() {
  clearInterval(clock)
  clearTimeout(goTimer)
}

/** Once a second, keep the score: the last fifteen seconds of it. */
function sample(list: { t: number; score: number }[], t: number, score: number) {
  const last = list[list.length - 1]
  if (last && t - last.t < 1000) return
  list.push({ t, score })
  while (list.length && t - list[0]!.t > 15_000) list.shift()
}
/** Points in the last ten seconds. */
export function rate(list: { t: number; score: number }[], score: number) {
  const t = performance.now()
  const then = list.find((s) => t - s.t <= 10_000)
  return then ? score - then.score : 0
}

/** This player is done: the clock, the target, or (survival) out of hearts. */
function finish(reached: boolean) {
  if (mp.phase !== 'playing' && mp.phase !== 'countdown') return
  const alive = state.status !== 'over'
  haltMatch()
  sendState(alive)
  mp.final = { score: state.score, reached }
  mp.phase = 'done'
  sendControl({ t: 'final', score: state.score, ms: Math.max(0, Math.round(performance.now() - mp.startsAt)), reached })
}

/* ─── Packets ────────────────────────────────────────────────────────── */

const DIR_CODES: Vec[] = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }]
const MAX_CELLS = 1600

export function encode(index: number, n: number, snake: Vec[], score: number, hearts: number, level: number, flags: number): ArrayBuffer {
  const len = Math.min(snake.length, MAX_CELLS)
  const buf = new ArrayBuffer(15 + Math.ceil(Math.max(0, len - 1) / 4))
  const view = new DataView(buf)
  view.setUint8(0, 1)
  view.setUint8(1, index)
  view.setUint16(2, n & 0xffff)
  view.setUint32(4, Math.max(0, Math.min(score, 0xffffffff)))
  view.setUint8(8, Math.min(hearts, 255))
  view.setUint8(9, Math.min(level, 255))
  view.setUint8(10, flags)
  view.setUint8(11, snake[0]?.x ?? 0)
  view.setUint8(12, snake[0]?.y ?? 0)
  view.setUint16(13, len)
  for (let i = 1; i < len; i++) {
    let dx = snake[i]!.x - snake[i - 1]!.x
    let dy = snake[i]!.y - snake[i - 1]!.y
    // Through a wall: a board apart, one step the other way.
    if (dx > 1) dx = -1
    else if (dx < -1) dx = 1
    if (dy > 1) dy = -1
    else if (dy < -1) dy = 1
    const code = Math.max(0, DIR_CODES.findIndex((d) => d.x === dx && d.y === dy))
    const at = 15 + ((i - 1) >> 2)
    view.setUint8(at, view.getUint8(at) | (code << (((i - 1) & 3) * 2)))
  }
  return buf
}

export function decode(buf: ArrayBuffer, cols: number, rows: number) {
  if (buf.byteLength < 15) return null
  const view = new DataView(buf)
  if (view.getUint8(0) !== 1) return null
  const len = Math.min(view.getUint16(13), MAX_CELLS)
  if (buf.byteLength < 15 + Math.ceil(Math.max(0, len - 1) / 4)) return null
  const snake: Vec[] = []
  let x = view.getUint8(11)
  let y = view.getUint8(12)
  if (len) snake.push({ x, y })
  for (let i = 1; i < len; i++) {
    const code = (view.getUint8(15 + ((i - 1) >> 2)) >> (((i - 1) & 3) * 2)) & 3
    x = (x + DIR_CODES[code]!.x + cols) % cols
    y = (y + DIR_CODES[code]!.y + rows) % rows
    snake.push({ x, y })
  }
  return {
    index: view.getUint8(1),
    seq: view.getUint16(2),
    score: view.getUint32(4),
    hearts: view.getUint8(8),
    level: view.getUint8(9),
    flags: view.getUint8(10),
    snake,
  }
}

/** Send this snake to everyone: directly where a link is open, through the server for the rest. */
function sendState(alive = state.status === 'running') {
  if (mp.you < 0) return
  const buf = encode(mp.you, seq++, state.snake, state.score, state.hearts, state.level, alive ? 1 : 0)
  let relay = false
  for (const p of Object.values(mp.peers)) {
    const channel = links[p.index]?.channel
    if (channel?.readyState === 'open') {
      channel.send(buf)
      mp.direct++
    } else relay = true
  }
  if (relay && ws?.readyState === WebSocket.OPEN) ws.send(buf)
  mp.sent++
}

function receive(buf: ArrayBuffer, link: 'p2p' | 'relay') {
  const packet = decode(buf, state.cols, state.rows)
  if (!packet) return
  const peer = mp.peers[packet.index]
  if (!peer || packet.index === mp.you) return
  // Newer only (sequence numbers wrap at 65536).
  if (peer.seq >= 0) {
    const ahead = (packet.seq - peer.seq) & 0xffff
    if (ahead === 0 || ahead >= 0x8000) return
  }
  peer.seq = packet.seq
  // Shown on the next step (see `showPeers`); nothing reactive is touched per packet.
  incoming[packet.index] = { ...packet, link: link === 'p2p' || links[peer.index]?.channel?.readyState === 'open' ? 'p2p' : 'relay', at: performance.now() }
  // Not playing yet (or any more): no steps come, so show it now.
  if (!match.live) showPeers()
}

/** The newest packet from each player, not yet shown. */
let incoming: Record<number, NonNullable<ReturnType<typeof decode>> & { link: 'p2p' | 'relay'; at: number }> = {}

/** Show what has come in since the last step: one reactive update per player, the snake itself kept raw. */
function showPeers() {
  for (const [index, packet] of Object.entries(incoming)) {
    const peer = mp.peers[Number(index)]
    if (!peer) continue
    peer.seen = packet.at
    peer.snake = markRaw(packet.snake)
    peer.score = packet.score
    peer.hearts = packet.hearts
    peer.level = packet.level
    peer.alive = (packet.flags & 1) === 1
    peer.link = packet.link
    sample(peer.samples, peer.seen, peer.score)
  }
  incoming = {}
}

// Each game step, while playing: show the others' latest, run the mode's rules, send this snake.
watch(
  () => state.step,
  (step) => {
    if (mp.phase !== 'playing' || !match.live) return
    showPeers()
    if (mp.settings.mode === 'slither') checkCrash()
    if (mp.settings.mode === 'zones') holdZones(step)
    sendState()
  },
)

/* ─── Slither ────────────────────────────────────────────────────────── */

/** This snake's head on another snake: a crash. Ghost (and the cover after a respawn) passes through. */
function checkCrash() {
  const head = state.snake[0]
  if (!head || state.status !== 'running' || isActive('ghost')) return
  for (const p of Object.values(mp.peers)) {
    if (!p.alive || !p.snake.length) continue
    if (p.snake.some((c) => c.x === head.x && c.y === head.y)) {
      const body = state.snake.map((c) => ({ x: c.x, y: c.y }))
      sendControl({ t: 'crash', cells: body.slice(0, 120) })
      crash(`ran into ${p.name}`)
      dropPellets(body)
      return
    }
  }
}

/* ─── Domination ─────────────────────────────────────────────────────── */

export interface Zone { x: number; y: number; w: number; h: number; owner: number }
/** The zones and who holds each (a player's index, -1 for nobody). */
export const zones = reactive({ list: [] as Zone[] })
/** A zone's colour: its holder's (yours is mint), or a faint white while nobody holds it. */
export const zoneColor = (owner: number) => (owner < 0 ? '#C8C8DC' : owner === mp.you ? '#00F0C8' : colorOf(owner))
/** Points a held zone scores each beat. */
const ZONE_POINTS = 10

/** Eight zones in two rows of four, evenly over the board. */
function layZones(cols: number, rows: number) {
  const w = Math.max(3, Math.round(cols / 9))
  const h = Math.max(3, Math.round(rows / 5))
  const out: Zone[] = []
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 4; c++) {
      const cx = Math.round(((c + 0.5) * cols) / 4)
      const cy = Math.round(((r + 0.5) * rows) / 2)
      out.push({ x: cx - Math.floor(w / 2), y: cy - Math.floor(h / 2), w, h, owner: -1 })
    }
  }
  zones.list = out
}

/** Who has the most cells in each zone takes it (a tie keeps the holder); each beat, this snake's zones score. */
function holdZones(step: number) {
  const snakes: [number, { x: number; y: number }[]][] = [[mp.you, state.snake]]
  for (const p of Object.values(mp.peers)) if (p.alive) snakes.push([p.index, p.snake])
  for (const z of zones.list) {
    let best = -1
    let most = 0
    let tie = false
    for (const [index, cells] of snakes) {
      let n = 0
      for (const c of cells) if (c.x >= z.x && c.x < z.x + z.w && c.y >= z.y && c.y < z.y + z.h) n++
      if (n > most) [best, most, tie] = [index, n, false]
      else if (n && n === most) tie = true
    }
    if (best >= 0 && !tie && best !== z.owner) z.owner = best
  }
  if (step % 4 === 0 && state.status === 'running') state.score += ZONE_POINTS * zones.list.filter((z) => z.owner === mp.you).length
}

/* ─── Peer to peer ───────────────────────────────────────────────────── */

const ICE: RTCConfiguration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
const links: Record<number, { pc: RTCPeerConnection; channel: RTCDataChannel | null }> = {}

function link(index: number) {
  const pc = new RTCPeerConnection(ICE)
  const entry: { pc: RTCPeerConnection; channel: RTCDataChannel | null } = { pc, channel: null }
  links[index] = entry
  pc.onicecandidate = (event) => event.candidate && sendControl({ t: 'signal', to: index, data: { candidate: event.candidate.toJSON() } })
  pc.ondatachannel = (event) => wire(entry, event.channel)
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed') dropLink(index)
  }
  return entry
}
function wire(entry: { channel: RTCDataChannel | null }, channel: RTCDataChannel) {
  channel.binaryType = 'arraybuffer'
  channel.onmessage = (event) => receive(event.data as ArrayBuffer, 'p2p')
  entry.channel = channel
}
async function call(index: number) {
  if (typeof RTCPeerConnection === 'undefined') return
  const entry = link(index)
  wire(entry, entry.pc.createDataChannel('snake', { ordered: false, maxRetransmits: 0 }))
  try {
    await entry.pc.setLocalDescription(await entry.pc.createOffer())
    sendControl({ t: 'signal', to: index, data: { sdp: entry.pc.localDescription } })
  } catch {
    dropLink(index)
  }
}
async function onSignal(from: number, data: { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }) {
  if (typeof RTCPeerConnection === 'undefined') return
  try {
    if (data.sdp?.type === 'offer') {
      if (links[from]) dropLink(from)
      const entry = link(from)
      await entry.pc.setRemoteDescription(data.sdp)
      await entry.pc.setLocalDescription(await entry.pc.createAnswer())
      sendControl({ t: 'signal', to: from, data: { sdp: entry.pc.localDescription } })
    } else if (data.sdp?.type === 'answer') {
      await links[from]?.pc.setRemoteDescription(data.sdp)
    } else if (data.candidate) {
      await links[from]?.pc.addIceCandidate(data.candidate)
    }
  } catch {
    /* no direct link: the server relays instead */
  }
}
function dropLink(index: number) {
  const entry = links[index]
  if (!entry) return
  delete links[index]
  entry.channel?.close()
  entry.pc.close()
}
