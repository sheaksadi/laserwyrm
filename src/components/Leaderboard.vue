<script setup lang="ts">
/**
 * The high-score board, from the server. Every run on it can be watched.
 */
import { onMounted, ref } from 'vue'
import { fetchScores, type ScoreRow } from '../api'
import { runSeconds } from '../game'

const props = defineProps<{ highlight?: number }>()
const emit = defineEmits<{ close: []; watch: [id: number] }>()

const rows = ref<ScoreRow[]>([])
const status = ref<'loading' | 'ok' | 'error'>('loading')
const error = ref('')

async function load() {
  status.value = 'loading'
  try {
    rows.value = await fetchScores()
    status.value = 'ok'
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
    status.value = 'error'
  }
}
onMounted(load)

const time = (steps: number) => {
  const s = Math.round(runSeconds(steps))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
</script>

<template>
  <div class="board-card" role="dialog" aria-label="High scores">
    <header>
      <h2>High scores</h2>
      <button class="close" aria-label="Close" @click="emit('close')">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </header>

    <p v-if="status === 'loading'" class="msg">Loading…</p>
    <p v-else-if="status === 'error'" class="msg err">
      Could not reach the score server ({{ error }}).
      <button class="link" @click="load">Try again</button>
    </p>
    <p v-else-if="!rows.length" class="msg">No scores yet. Be the first.</p>

    <table v-else>
      <thead>
        <tr><th>#</th><th>Name</th><th class="num">Score</th><th class="num">Lvl</th><th class="num hide-narrow">Time</th><th></th></tr>
      </thead>
      <tbody>
        <tr v-for="(row, i) in rows" :key="row.id" :class="{ mine: row.id === props.highlight, top: i < 3 }">
          <td class="rank">{{ i + 1 }}</td>
          <td class="name" :title="`${row.name} · ${when(row.created_at)}`">{{ row.name }}</td>
          <td class="num score">{{ row.score.toLocaleString() }}</td>
          <td class="num">{{ row.level }}</td>
          <td class="num hide-narrow">{{ time(row.steps) }}</td>
          <td>
            <button class="watch" :aria-label="`Watch ${row.name}'s run`" @click="emit('watch', row.id)">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M7 4v16l13-8z" /></svg>
              <span class="hide-narrow">Watch</span>
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.board-card {
  width: min(36rem, 100%);
  max-height: 100%;
  overflow: auto;
  padding: 1.4rem 1.6rem;
  background: var(--bg);
  border: 3px solid var(--sun);
  box-shadow: 0 0 0 3px var(--ink), 0 0 0 6px var(--coral), 10px 10px 0 6px var(--ink);
  animation: pop-in 0.25s steps(3) both;
}
header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
h2 {
  margin: 0;
  font-family: var(--font-pixel);
  font-size: 1.1rem;
  font-weight: 400;
  text-transform: uppercase;
  color: var(--sun);
  text-shadow: 3px 3px 0 var(--coral);
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
.close:hover { border-color: var(--sun); color: var(--text); }
.msg { margin: 1rem 0; font-size: 19px; color: var(--text-dim); }
.msg.err { color: var(--coral); }
.link { border: 0; background: none; padding: 0; color: var(--sky); text-decoration: underline; font-size: inherit; }
table { width: 100%; border-collapse: collapse; font-size: 19px; }
th {
  padding: 0 6px 6px;
  font-size: 15px;
  font-weight: 400;
  text-align: left;
  text-transform: uppercase;
  color: var(--text-muted);
  border-bottom: 2px dashed var(--border);
}
td { padding: 6px; color: var(--text-dim); border-bottom: 1px solid var(--border); }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.rank { width: 2.5ch; color: var(--text-muted); }
.name { max-width: 10rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); text-transform: uppercase; }
.score { color: var(--text); }
tr.top .rank, tr.top .score { color: var(--sun); }
tr.mine td { background: rgba(92, 255, 92, 0.12); }
tr.mine .name { color: var(--sage); }
.watch {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border: 2px solid var(--sky);
  background: var(--bg-off);
  font-size: 15px;
  text-transform: uppercase;
  color: var(--sky);
}
.watch:hover { background: var(--sky); color: var(--ink); }
.close:focus-visible, .watch:focus-visible { outline: 3px solid var(--sun); outline-offset: 2px; }
@media (max-width: 480px) {
  .hide-narrow { display: none; }
  .board-card { padding: 1rem; }
}
</style>
