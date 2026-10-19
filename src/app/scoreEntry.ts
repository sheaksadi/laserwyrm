/**
 * After a game: every run is saved (signed in or not) for a code to share,
 * and a run that makes the high scores can go on the board. Joined players'
 * runs go up by themselves; others can Join from the game-over card.
 */
import { reactive, watch } from 'vue'
import { lastReplay, match, replay, runSeconds, state } from '../game'
import { account, rememberGame, signOut } from '../account'
import { ApiError, claimName, placesOnBoard, saveGame, submitScore as sendScore } from '../api'
import { shared } from '../design'
import { refreshMe } from '../looks'

export const scoreEntry = reactive({
  /** The finished game's code once the server has it; null while saving or if it could not. */
  gameCode: null as string | null,
  gameSave: 'saved' as 'saving' | 'saved' | 'failed',
  saveError: '',
  /** The server did not know this device's login code (an old or wiped account): signed out, game saved anyway. */
  signedOutNote: '',
  name: '',
  nameSuggestions: [] as string[],
  /** Just signed up from this form: show the login code once, with a nudge to keep it. */
  newLoginCode: null as string | null,
  /** Whether this run makes the board, then how sending it went. */
  entry: { phase: 'none' } as { phase: 'checking' | 'open' | 'none' | 'sending' | 'saved' | 'failed'; rank?: number; id?: number; error?: string },
})

let saving: Promise<string | null> = Promise.resolve(null)

/** Save every finished game, and check whether it makes the board. Call once. */
export function watchGameOver() {
  watch(
    () => state.status,
    async (status) => {
      if (status !== 'over' || replay.active || match.on) return
      // Every game is saved, signed in or not, so it can be found and shared.
      const run = lastReplay()
      const summary = { score: state.score, level: state.level + 1, steps: run.steps, mode: state.mode }
      scoreEntry.gameCode = null
      scoreEntry.gameSave = 'saving'
      scoreEntry.newLoginCode = null
      scoreEntry.nameSuggestions = []
      scoreEntry.name = account.name ?? scoreEntry.name
      scoreEntry.saveError = ''
      scoreEntry.signedOutNote = ''
      const payload = { ...summary, cheated: state.cheated, replay: run, design: shared.slug ?? undefined, cheats: state.usedCheats, seconds: Math.round(runSeconds(run.steps)) }
      saving = saveGame(payload)
        .catch((err) => {
          // A login code this server does not know: sign out here and save the game without it.
          if (!(err instanceof ApiError) || err.status !== 401 || !account.code) throw err
          scoreEntry.signedOutNote = `${account.name ?? 'Your account'} was not recognised by the server, so you are signed out on this device.`
          signOut()
          return saveGame(payload)
        })
        .then(({ code }) => {
          scoreEntry.gameCode = code
          scoreEntry.gameSave = 'saved'
          rememberGame({ code, ...summary, created_at: new Date().toISOString() })
          // New numbers for the unlocks.
          void refreshMe()
          return code
        })
        .catch((err) => {
          scoreEntry.gameSave = 'failed'
          scoreEntry.saveError = err instanceof Error ? err.message : String(err)
          return null
        })
      scoreEntry.entry = { phase: 'checking' }
      const places = !state.cheated && (await placesOnBoard(state.score, state.mode))
      if (state.status !== 'over') return
      // Joined: every run that places goes up by itself (take it off from the account page). Otherwise: Join to post it.
      if (places && account.name) void submitScore()
      else scoreEntry.entry = { phase: places ? 'open' : 'none' }
    },
  )
}

export async function submitScore(name = scoreEntry.name.trim()) {
  scoreEntry.entry = { phase: 'sending' }
  scoreEntry.nameSuggestions = []
  try {
    const code = await saving
    if (!code) throw new Error(`this game could not be saved (${scoreEntry.saveError}), so it cannot go on the board`)
    // Not joined: Join here (the name is optional; one is made up if blank).
    if (!account.name) {
      const made = await claimName(name)
      scoreEntry.newLoginCode = made.code
      scoreEntry.name = made.name
    }
    const saved = await sendScore({ game: code, email: '' })
    scoreEntry.entry = { phase: 'saved', rank: saved.rank, id: saved.id }
  } catch (err) {
    if (err instanceof ApiError && Array.isArray(err.extra.suggestions)) scoreEntry.nameSuggestions = err.extra.suggestions as string[]
    scoreEntry.entry = { phase: 'failed', error: err instanceof Error ? err.message : String(err) }
  }
}
