/**
 * Syncing this device's custom games with the player's account, so AI
 * agents (through the MCP server) can work on them. On while "Connect AI
 * agents" is switched on (☰ → AI agent) and the player is signed in.
 *
 * Changes here go up a second or two after they are made; changes from
 * the server (an agent's) come down every few seconds, while the page is
 * visible. Each game carries when it last changed: the newest copy wins,
 * on both sides. A change an agent makes to the game open in the editor
 * lands in it, and can be undone like any other.
 */
import { reactive, watch } from 'vue'
import { account } from './account'
import { ApiError } from './api'
import { cleanDesign, compact, deletedGames, design, fingerprint, library, replaceDesign, type Design, type SavedGame } from './design'

const KEY = 'laserwyrm-agent-sync'
const readOn = () => {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export const sync = reactive({
  /** The player's switch. */
  on: readOn(),
  /** Last time the server answered, and what went wrong if it did not. */
  lastAt: 0,
  error: '',
  /** The last change that came from the server (an agent's): which game, and when. */
  incoming: null as { name: string; at: number } | null,
})
watch(
  () => sync.on,
  (on) => {
    try {
      localStorage.setItem(KEY, on ? '1' : '0')
    } catch {
      /* storage blocked: on for this visit */
    }
    cursor = null
    if (on) void pull()
  },
)
// Signed in as someone else: start from everything again.
watch(
  () => account.code,
  () => {
    cursor = null
    inStep.clear()
  },
)

const active = () => sync.on && !!account.code
/** What each game was when last in step with the server: pushing skips games that match. */
const inStep = new Map<string, string>()
const stamp = (g: Pick<SavedGame, 'name' | 'design'>) => `${g.name}|${fingerprint(g.design)}`

async function call(path: string, init?: RequestInit) {
  const res = await fetch(path, { ...init, headers: { 'content-type': 'application/json', authorization: `Bearer ${account.code}` } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(body.error ?? `sync failed (${res.status})`, res.status)
  return body
}

async function push(game: SavedGame) {
  await call(`/api/me/library/${encodeURIComponent(game.id)}`, {
    method: 'PUT',
    body: JSON.stringify({ name: game.name, design: compact(game.design), updated_at: new Date(game.updatedAt ?? Date.now()).toISOString() }),
  })
  inStep.set(game.id, stamp(game))
}

/** The server's time at the last pull: the next asks only for games changed since (null: everything). */
let cursor: string | null = null

/** Bring server changes in, and send up what the server lacks. */
async function pull() {
  if (!active() || document.visibilityState === 'hidden') return
  try {
    const { games, ids, now } = (await call(`/api/me/library${cursor ? `?since=${encodeURIComponent(cursor)}` : ''}`)) as {
      games: { id: string; name: string; design: Design; deleted: boolean; updated_at: string }[]
      ids: string[]
      now: string
    }
    cursor = now
    for (const remote of games) {
      const at = Date.parse(remote.updated_at)
      const local = library.games.find((g) => g.id === remote.id)
      if (remote.deleted) {
        if (local && (local.updatedAt ?? 0) <= at && library.games.length > 1) {
          library.games = library.games.filter((g) => g.id !== remote.id)
          if (library.active === remote.id) {
            library.active = library.games[0]!.id
            replaceDesign(cleanDesign(library.games[0]!.design))
          }
        }
        continue
      }
      const incoming = { name: remote.name, design: cleanDesign(remote.design) }
      if (!local) {
        library.games.push({ id: remote.id, ...incoming, design: compact(incoming.design), updatedAt: at })
        inStep.set(remote.id, stamp(incoming))
        sync.incoming = { name: remote.name, at: Date.now() }
      } else if (at > (local.updatedAt ?? 0) + 250 && stamp(incoming) !== stamp(local)) {
        inStep.set(remote.id, stamp(incoming))
        local.name = incoming.name
        local.design = compact(incoming.design)
        local.updatedAt = at
        if (library.active === local.id) replaceDesign(incoming.design)
        sync.incoming = { name: remote.name, at: Date.now() }
      } else if (!inStep.has(remote.id)) {
        inStep.set(remote.id, stamp(incoming))
      }
    }
    // Games the server has never seen.
    for (const g of library.games) if (!ids.includes(g.id)) await push(g)
    sync.lastAt = Date.now()
    sync.error = ''
  } catch (err) {
    sync.error = err instanceof Error ? err.message : String(err)
  }
}

/** Send up what changed here. */
let timer = 0
watch(
  [library, design],
  () => {
    if (!active()) return
    clearTimeout(timer)
    timer = window.setTimeout(async () => {
      try {
        for (const id of deletedGames.splice(0)) await call(`/api/me/library/${encodeURIComponent(id)}`, { method: 'DELETE' })
        for (const g of library.games) if (inStep.get(g.id) !== stamp(g)) await push(g)
        sync.lastAt = Date.now()
        sync.error = ''
      } catch (err) {
        sync.error = err instanceof Error ? err.message : String(err)
      }
    }, 1200)
  },
  { deep: true },
)

if (typeof window !== 'undefined') {
  window.setInterval(() => void pull(), 4000)
  document.addEventListener('visibilitychange', () => void pull())
  void pull()
}
