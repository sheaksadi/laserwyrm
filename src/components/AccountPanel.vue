<script setup lang="ts">
/**
 * The player's account. Join (a name and an email, both optional), keep the
 * login code the server gives back, sign in elsewhere with it, or sign out.
 * Joined: rename, choose the snake's look (colours, hats and trails that
 * unlock as you play), and see your runs on the high scores, where every
 * run that places goes by itself; take any off here.
 */
import { ref, watch } from 'vue'
import { account, signOut } from '../account'
import { ApiError, claimName, codeForUrl, myGames, myScores, removeScore, signInWithCode, type GameRow, type ScoreRow } from '../api'
import GameCode from './GameCode.vue'
import LookPicker from './LookPicker.vue'
import NameEdit from './NameEdit.vue'

const emit = defineEmits<{ close: [] }>()

const nameInput = ref('')
const emailInput = ref('')
const codeInput = ref('')
const busy = ref(false)
const error = ref('')
const suggestions = ref<string[]>([])
/** Show the login code in the clear; it stays hidden unless asked. */
const reveal = ref(false)
/** Just made: the code is shown open, with a nudge to save it. */
const fresh = ref(false)
const copied = ref(false)

/** Signed in: the latest few games, to watch or share. */
const games = ref<GameRow[]>([])
const gamesError = ref('')
/** Signed in: your runs on the board. */
const board = ref<ScoreRow[]>([])
const confirmRemove = ref<number | null>(null)
async function takeOff(row: ScoreRow) {
  if (confirmRemove.value !== row.id) return void (confirmRemove.value = row.id)
  try {
    await removeScore(row.id)
    board.value = board.value.filter((r) => r.id !== row.id)
  } catch (err) {
    gamesError.value = err instanceof Error ? err.message : String(err)
  }
  confirmRemove.value = null
}
watch(
  () => account.code,
  async (code) => {
    games.value = []
    board.value = []
    gamesError.value = ''
    if (!code) return
    try {
      games.value = (await myGames()).slice(0, 5)
      board.value = await myScores()
    } catch (err) {
      // The server does not know this login code (an old or wiped account): sign out here.
      if (err instanceof ApiError && err.status === 401) {
        signOut()
        error.value = 'That account was not recognised by the server, so you are signed out on this device.'
        return
      }
      gamesError.value = err instanceof Error ? err.message : String(err)
    }
  },
  { immediate: true },
)
function goTo(hash: string) {
  emit('close')
  location.hash = hash
}

async function create(name = nameInput.value.trim()) {
  busy.value = true
  error.value = ''
  suggestions.value = []
  try {
    await claimName(name, emailInput.value.trim())
    fresh.value = true
    reveal.value = true
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
    if (err instanceof ApiError && Array.isArray(err.extra.suggestions)) suggestions.value = err.extra.suggestions as string[]
  } finally {
    busy.value = false
  }
}

async function enter() {
  if (!codeInput.value.trim()) return
  busy.value = true
  error.value = ''
  try {
    await signInWithCode(codeInput.value)
    codeInput.value = ''
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

async function copyCode() {
  if (!account.code) return
  await navigator.clipboard.writeText(account.code).catch(() => {})
  copied.value = true
  setTimeout(() => (copied.value = false), 1400)
}

function leave() {
  if (!fresh.value || confirm('Signing out removes your login code from this browser. Saved it somewhere?')) {
    signOut()
    fresh.value = false
    reveal.value = false
  }
}
</script>

<template>
  <div class="account" role="dialog" aria-label="Account">
    <header>
      <h2>Account</h2>
      <button class="close" aria-label="Close" @click="emit('close')">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </header>

    <template v-if="account.name">
      <section>
        <h3>Your name</h3>
        <NameEdit />
      </section>
      <section>
        <h3>Your login code</h3>
        <div class="code-row">
          <code>{{ reveal ? account.code : '••••-••••-••••-••••' }}</code>
          <button class="small" @click="reveal = !reveal">{{ reveal ? 'Hide' : 'Show' }}</button>
          <button class="small" @click="copyCode">{{ copied ? 'Copied' : 'Copy' }}</button>
        </div>
        <p class="warn" :class="{ loud: fresh }">
          This code is your account. Keep it somewhere safe: it is the only way back in on another device,
          and anyone who has it can play as you.
        </p>
      </section>
      <section>
        <h3>Your snake</h3>
        <LookPicker />
      </section>
      <section>
        <h3>On the high scores</h3>
        <p class="hint">Every run that makes the board goes up by itself. Take any off here.</p>
        <p v-if="!board.length && !gamesError" class="hint">None yet.</p>
        <ul v-else class="games">
          <li v-for="r in board" :key="r.id" class="board-row">
            <span class="g-score">{{ r.score.toLocaleString() }}<span v-if="r.mode === 'hardcore'" class="hc">HC</span></span>
            <span class="when">lvl {{ r.level }} · {{ new Date(r.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) }}</span>
            <button class="small" :class="{ danger: confirmRemove === r.id }" @click="takeOff(r)">{{ confirmRemove === r.id ? 'Sure?' : 'Take off' }}</button>
          </li>
        </ul>
      </section>
      <section>
        <h3>Your games</h3>
        <p v-if="gamesError" class="error">{{ gamesError }}</p>
        <p v-else-if="!games.length" class="hint">No games yet. Play one!</p>
        <ul v-else class="games">
          <li v-for="g in games" :key="g.code">
            <GameCode :code="g.code" link />
            <span class="g-score">{{ g.score.toLocaleString() }}<span v-if="g.mode === 'hardcore'" class="hc">HC</span></span>
            <button class="small" @click="goTo(`#/game/${codeForUrl(g.code)}`)">Watch</button>
          </li>
        </ul>
        <button class="row-btn" @click="goTo('#/replays')">All replays</button>
      </section>
      <button class="row-btn" @click="leave">Sign out</button>
    </template>

    <template v-else>
      <section>
        <h3>Join</h3>
        <form class="join" @submit.prevent="create()">
          <input v-model="nameInput" class="field" maxlength="12" placeholder="Name (optional)" aria-label="Name, optional" autocomplete="nickname" />
          <input v-model="emailInput" class="field" type="email" maxlength="80" placeholder="Email (optional)" aria-label="Email, optional" autocomplete="email" />
          <button class="go" type="submit" :disabled="busy">Join</button>
        </form>
        <p class="hint">No name? One is made up; rename any time. Joined, your runs go on the high scores by themselves.</p>
        <div v-if="suggestions.length" class="suggest">
          <span>Free:</span>
          <button v-for="s in suggestions" :key="s" class="chip" :disabled="busy" @click="create(s)">{{ s }}</button>
        </div>
      </section>
      <section>
        <h3>Your snake</h3>
        <LookPicker />
      </section>
      <section>
        <h3>Have a login code?</h3>
        <form class="inline" @submit.prevent="enter">
          <input v-model="codeInput" class="field" placeholder="XXXX-XXXX-XXXX-XXXX" aria-label="Login code" autocomplete="off" spellcheck="false" />
          <button class="go" type="submit" :disabled="busy">Sign in</button>
        </form>
      </section>
    </template>
    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>

<style scoped>
.account {
  width: min(34rem, 100%);
  max-height: 100%;
  overflow: auto;
  padding: 1.4rem 1.6rem;
  background: var(--bg);
  border: 3px solid var(--mint);
  box-shadow: 0 0 0 3px var(--ink), 0 0 0 6px var(--sky), 10px 10px 0 6px var(--ink);
}
header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
h2 {
  margin: 0;
  font-family: var(--font-pixel);
  font-size: 1.1rem;
  font-weight: 400;
  text-transform: uppercase;
  color: var(--mint);
  text-shadow: 3px 3px 0 var(--ink);
}
.close {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 2px solid var(--border);
  background: var(--bg-off);
  color: var(--text-dim);
}
.close:hover { border-color: var(--mint); color: var(--text); }
section { margin-bottom: 1.1rem; }
h3 {
  margin: 0 0 0.5rem;
  font-size: 16px;
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-muted);
}
.who { margin: 0 0 1rem; font-size: 20px; color: var(--text-dim); }
.who b { font-weight: 400; color: var(--sun); text-transform: uppercase; }
.code-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
code {
  padding: 6px 10px;
  border: 2px solid var(--border);
  background: var(--bg-off);
  font-family: var(--font-code);
  font-size: 20px;
  letter-spacing: 0.08em;
  color: var(--mint);
}
.small, .go, .row-btn, .chip {
  padding: 6px 12px;
  border: 2px solid var(--border);
  background: var(--bg-off);
  font-size: 17px;
  text-transform: uppercase;
  color: var(--text-dim);
}
.small:hover, .go:hover, .row-btn:hover, .chip:hover { border-color: var(--mint); color: var(--text); }
.go { border-color: var(--mint); color: var(--mint); }
.row-btn { width: 100%; }
.row-btn + .row-btn, section + .row-btn { margin-top: 6px; }
.games { margin: 0 0 8px; padding: 0; list-style: none; }
.games li { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 10px; padding: 5px 0; border-bottom: 1px solid var(--border); }
.g-score { text-align: right; font-size: 18px; color: var(--sun); }
.hc { margin-left: 6px; padding: 0 4px; background: var(--coral); color: var(--ink); font-size: 13px; }
.warn { margin: 8px 0 0; font-size: 16px; line-height: 1.2; color: var(--text-muted); }
.warn.loud { color: var(--sun); }
.inline { display: flex; gap: 6px; }
.join { display: grid; grid-template-columns: 1fr 1fr auto; gap: 6px; }
@media (max-width: 520px) { .join { grid-template-columns: 1fr; } }
.board-row { grid-template-columns: auto 1fr auto !important; }
.when { font-size: 15px; color: var(--text-muted); }
.small.danger { border-color: var(--coral); color: var(--coral); }
.field {
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
  border: 2px solid var(--text-muted);
  background: var(--bg-off);
  color: var(--text);
  font: inherit;
  font-size: 20px;
}
.field::placeholder { color: var(--text-muted); }
.field:focus { outline: none; border-color: var(--sun); }
.hint { margin: 6px 0 0; font-size: 15px; color: var(--text-muted); }
.suggest { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 8px; font-size: 16px; color: var(--text-muted); }
.chip { color: var(--sage); text-transform: none; }
.error { margin: 0.5rem 0 0; font-size: 17px; color: var(--coral); }
button:disabled { opacity: 0.5; }
.close:focus-visible, .small:focus-visible, .go:focus-visible, .row-btn:focus-visible, .chip:focus-visible { outline: 3px solid var(--sun); outline-offset: 2px; }
</style>
