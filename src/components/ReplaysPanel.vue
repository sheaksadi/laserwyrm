<script setup lang="ts">
/**
 * Replays: find any game by its code (BORK#4821) or a player's name, and
 * your own games: from the server when signed in, and every game played on
 * this device either way. A game can be saved offline, replay and all.
 */
import { computed, onMounted, ref } from 'vue'
import { account, dropOffline, keepOffline, localGames } from '../account'
import { codeForUrl, fetchGame, myGames, searchGames, type GameRow } from '../api'
import { runSeconds } from '../game'
import GameCode from './GameCode.vue'

const emit = defineEmits<{ close: [] }>()

const tab = ref<'mine' | 'search'>('mine')
const query = ref('')
const results = ref<GameRow[]>([])
const searching = ref(false)
const searchError = ref('')

const serverMine = ref<GameRow[]>([])
const mineError = ref('')

/** Mine: the server's list (signed in) plus anything played here it does not have. */
const mine = computed<GameRow[]>(() => {
  const seen = new Set(serverMine.value.map((g) => g.code))
  const local = localGames.list
    .filter((g) => !seen.has(g.code))
    .map((g) => ({ ...g, mode: g.mode ?? ('normal' as const), name: account.name, cheated: false }))
  return [...serverMine.value, ...local].sort((a, b) => b.created_at.localeCompare(a.created_at))
})

onMounted(async () => {
  if (!account.code) return
  try {
    serverMine.value = await myGames()
  } catch (err) {
    mineError.value = err instanceof Error ? err.message : String(err)
  }
})

async function search() {
  const q = query.value.trim()
  if (!q) return
  tab.value = 'search'
  searching.value = true
  searchError.value = ''
  try {
    results.value = await searchGames(q)
  } catch (err) {
    searchError.value = err instanceof Error ? err.message : String(err)
    results.value = []
  } finally {
    searching.value = false
  }
}

const saving = ref<string | null>(null)
async function toggleOffline(code: string) {
  if (localGames.offline[code]) return dropOffline(code)
  saving.value = code
  try {
    keepOffline(code, (await fetchGame(code)).replay)
  } catch (err) {
    alert(`Could not save ${code}: ${err instanceof Error ? err.message : err}`)
  } finally {
    saving.value = null
  }
}

const watch = (code: string) => (location.hash = `#/game/${codeForUrl(code)}`)
const time = (steps: number) => {
  const s = Math.round(runSeconds(steps))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
const shown = computed(() => (tab.value === 'mine' ? mine.value : results.value))
</script>

<template>
  <div class="replays" role="dialog" aria-label="Replays">
    <header>
      <h2>Replays</h2>
      <button class="close" aria-label="Close" @click="emit('close')">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </header>

    <form class="search" @submit.prevent="search">
      <input v-model="query" class="field" placeholder="BORK#4821 or a player name" aria-label="Game code or player name" spellcheck="false" />
      <button class="go" type="submit" :disabled="searching">Find</button>
    </form>

    <div class="tabs" role="tablist">
      <button role="tab" :aria-selected="tab === 'mine'" :class="{ on: tab === 'mine' }" @click="tab = 'mine'">My games <span class="n">{{ mine.length }}</span></button>
      <button role="tab" :aria-selected="tab === 'search'" :class="{ on: tab === 'search' }" @click="tab = 'search'">Found <span class="n">{{ results.length }}</span></button>
    </div>

    <p v-if="tab === 'mine' && !account.name" class="msg">Games played on this device. <b>Account</b> in the menu keeps them with you everywhere.</p>
    <p v-if="tab === 'mine' && mineError" class="msg err">{{ mineError }}</p>
    <p v-if="tab === 'search' && searchError" class="msg err">{{ searchError }}</p>
    <p v-else-if="tab === 'search' && !searching && query && !results.length" class="msg">Nothing found.</p>
    <p v-if="tab === 'mine' && !mine.length" class="msg">No games yet. Play one!</p>

    <ul v-if="shown.length" class="list">
      <li v-for="g in shown" :key="g.code">
        <GameCode :code="g.code" link />
        <span class="who">{{ g.name ?? '—' }}<span v-if="g.mode === 'hardcore'" class="hc" title="Hardcore">HC</span></span>
        <span class="score">{{ g.score.toLocaleString() }}</span>
        <span class="meta">L{{ g.level }} · {{ time(g.steps) }} · {{ when(g.created_at) }}<template v-if="g.cheated"> · cheats</template></span>
        <span class="actions">
          <button
            class="offline"
            :class="{ on: localGames.offline[g.code] }"
            :title="localGames.offline[g.code] ? 'Saved in this browser; click to remove' : 'Keep the replay in this browser'"
            :disabled="saving === g.code"
            @click="toggleOffline(g.code)"
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
            {{ localGames.offline[g.code] ? 'Saved' : 'Save' }}
          </button>
          <button class="watch" @click="watch(g.code)">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M7 4v16l13-8z" /></svg>
            Watch
          </button>
        </span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.replays {
  width: min(40rem, 100%);
  max-height: 100%;
  overflow: auto;
  padding: 1.4rem 1.6rem;
  background: var(--bg);
  border: 3px solid var(--sky);
  box-shadow: 0 0 0 3px var(--ink), 0 0 0 6px var(--mint), 10px 10px 0 6px var(--ink);
}
header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
h2 {
  margin: 0;
  font-family: var(--font-pixel);
  font-size: 1.1rem;
  font-weight: 400;
  text-transform: uppercase;
  color: var(--sky);
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
.close:hover { border-color: var(--sky); color: var(--text); }
.search { display: flex; gap: 6px; margin-bottom: 0.8rem; }
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
.field::placeholder { color: var(--text-muted); text-transform: uppercase; }
.field:focus { outline: none; border-color: var(--sun); }
.go {
  padding: 6px 14px;
  border: 2px solid var(--sky);
  background: var(--bg-off);
  font-size: 17px;
  text-transform: uppercase;
  color: var(--sky);
}
.go:hover { background: var(--sky); color: var(--ink); }
.tabs { display: flex; gap: 4px; margin-bottom: 0.6rem; border-bottom: 2px dashed var(--border); }
.tabs button {
  padding: 4px 10px 6px;
  border: 0;
  border-bottom: 3px solid transparent;
  background: none;
  font-size: 17px;
  text-transform: uppercase;
  color: var(--text-muted);
}
.tabs button.on { border-bottom-color: var(--sky); color: var(--text); }
.n { color: var(--text-muted); }
.msg { margin: 0.6rem 0; font-size: 17px; color: var(--text-muted); }
.msg b { font-weight: 400; color: var(--text-dim); }
.msg.err { color: var(--coral); }
.list { margin: 0; padding: 0; list-style: none; }
.list li {
  display: grid;
  grid-template-columns: auto 1fr auto;
  grid-template-areas: 'code who score' 'meta meta actions';
  align-items: center;
  gap: 4px 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}
.list :deep(.game-code) { grid-area: code; }
.who { grid-area: who; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 18px; text-transform: uppercase; color: var(--text); }
.hc { margin-left: 8px; padding: 0 5px; background: var(--coral); color: var(--ink); font-size: 14px; }
.score { grid-area: score; text-align: right; font-size: 19px; color: var(--sun); font-variant-numeric: tabular-nums; }
.meta { grid-area: meta; font-size: 15px; text-transform: uppercase; color: var(--text-muted); }
.actions { grid-area: actions; display: flex; gap: 4px; }
.offline, .watch {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border: 2px solid var(--border);
  background: var(--bg-off);
  font-size: 15px;
  text-transform: uppercase;
  color: var(--text-dim);
}
.offline.on { border-color: var(--sage); color: var(--sage); }
.watch { border-color: var(--sky); color: var(--sky); }
.watch:hover { background: var(--sky); color: var(--ink); }
.offline:hover { border-color: var(--sage); }
button:focus-visible { outline: 3px solid var(--sun); outline-offset: 2px; }
</style>
