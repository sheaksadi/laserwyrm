/**
 * The snake's look: its colour, a hat, and a particle trail. More unlock as
 * you play (games played, minutes played, best score). The choice is kept on
 * this device and, signed in, on the account, so it follows you; the
 * others in a multiplayer room see your hat on your hologram.
 */
import { computed, reactive, watch } from 'vue'
import { account, localGames } from './account'
import { fetchMe, saveLook, type Look, type PlayerStats } from './api'
import { runSeconds } from './game'

export type Unlock = { kind: 'free' } | { kind: 'games' | 'minutes' | 'best'; n: number }
export interface LookItem { id: string; name: string; unlock: Unlock }
export interface ColorItem extends LookItem { value: string }

const FREE: Unlock = { kind: 'free' }
const games = (n: number): Unlock => ({ kind: 'games', n })
const minutes = (n: number): Unlock => ({ kind: 'minutes', n })
const best = (n: number): Unlock => ({ kind: 'best', n })

export const COLORS: ColorItem[] = [
  { id: 'green', name: 'Green', value: 'var(--sage)', unlock: FREE },
  { id: 'mint', name: 'Mint', value: 'var(--mint)', unlock: games(1) },
  { id: 'sky', name: 'Sky', value: 'var(--sky)', unlock: games(3) },
  { id: 'rose', name: 'Rose', value: 'var(--rose)', unlock: games(10) },
  { id: 'sun', name: 'Sun', value: 'var(--sun)', unlock: best(500) },
  { id: 'lavender', name: 'Lavender', value: 'var(--lavender)', unlock: minutes(15) },
  { id: 'peach', name: 'Peach', value: 'var(--peach)', unlock: best(1500) },
  { id: 'coral', name: 'Coral', value: 'var(--coral)', unlock: games(30) },
  { id: 'ghost', name: 'Ghost', value: '#E8E8FF', unlock: minutes(60) },
  { id: 'rainbow', name: 'Rainbow', value: 'url(#preview-rainbow)', unlock: best(4000) },
]
export const HATS: LookItem[] = [
  { id: 'none', name: 'No hat', unlock: FREE },
  { id: 'cap', name: 'Cap', unlock: games(2) },
  { id: 'party', name: 'Party hat', unlock: games(5) },
  { id: 'bow', name: 'Bow', unlock: best(300) },
  { id: 'star', name: 'Star', unlock: minutes(10) },
  { id: 'wizard', name: 'Wizard hat', unlock: minutes(20) },
  { id: 'crown', name: 'Crown', unlock: best(2000) },
  { id: 'horns', name: 'Horns', unlock: games(50) },
  { id: 'tophat', name: 'Top hat', unlock: minutes(60) },
  { id: 'halo', name: 'Halo', unlock: best(5000) },
]
export const TRAILS: LookItem[] = [
  { id: 'none', name: 'No trail', unlock: FREE },
  { id: 'sparks', name: 'Sparks', unlock: games(1) },
  { id: 'hearts', name: 'Hearts', unlock: games(10) },
  { id: 'stars', name: 'Stars', unlock: best(1000) },
  { id: 'confetti', name: 'Confetti', unlock: minutes(45) },
  { id: 'rainbow', name: 'Rainbow', unlock: minutes(120) },
]

export function unlockText(u: Unlock) {
  if (u.kind === 'free') return 'Free'
  if (u.kind === 'games') return `Play ${u.n} game${u.n === 1 ? '' : 's'}`
  if (u.kind === 'minutes') return u.n >= 60 ? `Play for ${u.n / 60} hour${u.n === 60 ? '' : 's'}` : `Play for ${u.n} minutes`
  return `Score ${u.n.toLocaleString()} in one game`
}

/* ─── What you have done: the server's count when signed in, this device's otherwise ─── */

const server = reactive<PlayerStats>({ best: 0, games: 0, seconds: 0 })
const local = computed<PlayerStats>(() => ({
  best: localGames.list.reduce((m, g) => Math.max(m, g.score), 0),
  games: localGames.list.length,
  seconds: localGames.list.reduce((t, g) => t + runSeconds(g.steps), 0),
}))
export const stats = computed<PlayerStats>(() => ({
  best: Math.max(server.best, local.value.best),
  games: Math.max(server.games, local.value.games),
  seconds: Math.max(server.seconds, local.value.seconds),
}))
export function unlocked(item: LookItem) {
  const u = item.unlock
  if (u.kind === 'free') return true
  if (u.kind === 'games') return stats.value.games >= u.n
  if (u.kind === 'minutes') return stats.value.seconds >= u.n * 60
  return stats.value.best >= u.n
}
/** How far along to an unlock, 0 to 1. */
export function progress(item: LookItem) {
  const u = item.unlock
  if (u.kind === 'free') return 1
  const have = u.kind === 'games' ? stats.value.games : u.kind === 'minutes' ? stats.value.seconds / 60 : stats.value.best
  return Math.min(1, have / u.n)
}

/* ─── The choice ─── */

const KEY = 'laserwyrm-look'
function read(): Required<Look> {
  try {
    return { color: 'green', hat: 'none', trail: 'none', ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return { color: 'green', hat: 'none', trail: 'none' }
  }
}
export const look = reactive(read())
let fromServer = false
watch(
  look,
  (value) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(value))
    } catch {
      /* blocked: it lasts this visit */
    }
    if (account.code && !fromServer) void saveLook({ ...value }).catch(() => {})
    fromServer = false
  },
  { deep: true },
)

/** What the board draws: the choice, with anything not (or no longer) unlocked put back to the plain one. */
const pick = <T extends LookItem>(list: T[], id: string) => {
  const item = list.find((i) => i.id === id)
  return item && unlocked(item) ? item : list[0]!
}
export const shown = computed(() => ({
  color: pick(COLORS, look.color),
  hat: pick(HATS, look.hat).id,
  trail: pick(TRAILS, look.trail).id,
}))

/** Signed in: the account's numbers, and its look if it has one. */
export async function refreshMe() {
  if (!account.code) {
    Object.assign(server, { best: 0, games: 0, seconds: 0 })
    return
  }
  try {
    const me = await fetchMe()
    Object.assign(server, me.stats)
    if (me.look && Object.keys(me.look).length) {
      const next = { ...look, ...me.look }
      if (JSON.stringify(next) !== JSON.stringify(look)) {
        fromServer = true
        Object.assign(look, next)
      }
    } else void saveLook({ ...look }).catch(() => {})
  } catch {
    /* offline: this device's numbers will do */
  }
}
watch(() => account.code, refreshMe, { immediate: true })
