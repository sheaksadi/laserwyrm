/**
 * Pages, by the URL's hash: the game (#/), high scores (#/scores/12),
 * replays (#/replays), watching a run (#/watch/12 or #/game/BORK-4821).
 * Two hashes are actions, not pages: #/d/K7QM2X loads a shared game and
 * #/mp/123456 joins a multiplayer room; both then go back to #/.
 */
import { ref } from 'vue'
import { pause, reset } from '../game'
import { account, localGames } from '../account'
import { countPlay, fetchDesign, fetchGame, fetchScore } from '../api'
import { playShared } from '../design'
import { joinRoom, mp } from '../multiplayer'
import { stopWatching, watch as watchRun } from '../replayPlayer'
import { openMultiplayer, ui } from './ui'

export type Route =
  | { name: 'game' }
  | { name: 'scores'; highlight?: number }
  | { name: 'replays' }
  | { name: 'watch'; id: number }
  | { name: 'watch'; code: string }

export function parseRoute(): Route {
  const hash = location.hash
  const watching = hash.match(/^#\/watch\/(\d+)/)
  if (watching) return { name: 'watch', id: Number(watching[1]) }
  const game = hash.match(/^#\/game\/([A-Za-z]{4}-\d{4})/)
  if (game) return { name: 'watch', code: game[1]!.toUpperCase().replace('-', '#') }
  const scores = hash.match(/^#\/scores(?:\/(\d+))?/)
  if (scores) return { name: 'scores', highlight: scores[1] ? Number(scores[1]) : undefined }
  if (hash.startsWith('#/replays')) return { name: 'replays' }
  return { name: 'game' }
}

export const route = ref<Route>(parseRoute())

export const go = (hash: string) => {
  location.hash = hash
}

/** Why the run being opened for watching could not be loaded. */
export const watchError = ref('')
/** Bumped on every page change, so a slow load cannot open after the player has moved on. */
let navigation = 0

/** A shared game's link (#/d/K7QM2X): load it and set it up to play, then carry on at the start screen. */
async function playLink(slug: string) {
  try {
    const entry = await fetchDesign(slug.length === 6 ? slug.toUpperCase() : slug)
    playShared({ slug: entry.slug, name: entry.name, author: entry.author }, entry.design)
    void countPlay(entry.slug).catch(() => {})
    reset()
  } catch {
    ui.customOpen = true
  }
}

/** The hash changed (or the page opened on one): act on it and show its page. */
export async function onRoute() {
  const room = location.hash.match(/^#\/mp\/(\d{6})/)
  if (room) {
    history.replaceState(null, '', `${location.pathname}${location.search}#/`)
    openMultiplayer()
    if (mp.phase === 'off') void joinRoom(room[1]!)
  }
  const link = location.hash.match(/^#\/d\/(\w+)/)
  if (link) {
    history.replaceState(null, '', `${location.pathname}${location.search}#/`)
    void playLink(link[1]!)
  }
  const here = ++navigation
  const next = parseRoute()
  const was = route.value
  route.value = next
  if (was.name === 'watch') stopWatching()
  if (next.name !== 'game') {
    ui.menuOpen = false
    ui.cheatOpen = false
    ui.accountOpen = false
    pause()
  }
  if (next.name === 'watch') {
    watchError.value = ''
    const still = () => navigation === here
    try {
      if ('id' in next) {
        const entry = await fetchScore(next.id)
        if (still()) watchRun(entry.replay, entry)
      } else {
        const game = await fetchGame(next.code).catch((err) => {
          // Saved offline: watchable without the server.
          const kept = localGames.offline[next.code]
          if (!kept) throw err
          return { replay: kept, name: account.name, score: localGames.list.find((g) => g.code === next.code)?.score ?? 0, level: 0, code: next.code }
        })
        if (still()) watchRun(game.replay, { name: game.name, score: game.score, level: game.level, code: game.code })
      }
    } catch (err) {
      watchError.value = err instanceof Error ? err.message : String(err)
    }
  }
}
