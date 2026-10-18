<script setup lang="ts">
/**
 * Multiplayer, after the game: while the others finish, your score; then
 * the standings, the winner on top. The host plays again or changes the
 * game; anyone can leave.
 */
import { computed } from 'vue'
import { backToLobby, colorOf, isHost, leaveRoom, MODES, mp, startMatch } from '../multiplayer'

const emit = defineEmits<{ left: [] }>()

const winner = computed(() => mp.results?.[0] ?? null)
/** Level at the top (not in survival, where who lasted longer counts first). */
const tie = computed(() => {
  const [a, b] = mp.results ?? []
  return !!a && !!b && a.score === b.score && (mp.settings.mode !== 'survival' || a.ms === b.ms)
})
const iWon = computed(() => !tie.value && winner.value?.index === mp.you && (mp.results?.length ?? 0) > 1)
const headline = computed(() => {
  if ((mp.results?.length ?? 0) < 2) return 'Done'
  if (tie.value) return "It's a tie"
  return iWon.value ? 'You win!' : `${winner.value?.name} wins`
})
const seconds = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`

function leave() {
  leaveRoom()
  emit('left')
}
</script>

<template>
  <div class="card mp-results">
    <template v-if="mp.phase === 'done'">
      <p class="label">{{ MODES[mp.settings.mode].name }} · {{ mp.final?.reached ? 'target reached' : 'finished' }}</p>
      <p class="big">{{ mp.final?.score.toLocaleString() }}</p>
      <p class="note blink">Waiting for the others to finish…</p>
    </template>
    <template v-else-if="mp.results">
      <p class="label">{{ MODES[mp.settings.mode].name }} · {{ mp.settings.game }}</p>
      <h2 :class="{ won: iWon }">{{ headline }}</h2>
      <ol class="standings">
        <li v-for="(r, i) in mp.results" :key="r.index" :class="{ you: r.index === mp.you, left: r.left }" :style="{ '--pc': r.index === mp.you ? 'var(--sage)' : colorOf(r.index) }">
          <span class="place">{{ i + 1 }}</span>
          <svg v-if="i === 0 && !tie" class="crown" viewBox="0 0 16 12" width="16" height="12" aria-label="Winner"><path d="M1 11h14V9H1zM1 8h14L13 2l-3 3-2-4-2 4-3-3z" fill="var(--sun)" /></svg>
          <span class="name">{{ r.name }}<template v-if="r.index === mp.you"> (you)</template><template v-if="r.left"> · left</template></span>
          <span v-if="mp.settings.mode === 'survival'" class="time">{{ seconds(r.ms) }}</span>
          <b class="score">{{ r.score.toLocaleString() }}</b>
        </li>
      </ol>
      <div class="buttons">
        <template v-if="isHost()">
          <button class="btn" data-nav-first @click="startMatch"><span class="text-trim">Play again</span></button>
          <button class="btn btn-line" @click="backToLobby"><span class="text-trim">Change game</span></button>
        </template>
        <p v-else class="note">The host picks what is next…</p>
        <button class="btn btn-line" @click="leave"><span class="text-trim">Leave room</span></button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.mp-results {
  width: min(26rem, 100%);
  border-color: var(--sky);
  border-radius: 16px;
  box-shadow: 0 0 0 3px var(--ink), 0 0 0 6px var(--rose), 8px 8px 0 6px var(--ink);
  text-align: center;
}
.label { margin: 0; font-size: 15px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }
.big { margin: 0.6rem 0; font-family: var(--font-pixel); font-size: 2.6rem; color: var(--sun); text-shadow: 4px 4px 0 var(--rose); }
.note { margin: 0.5rem 0 0; font-size: 16px; text-transform: uppercase; color: var(--text-muted); }
h2 { margin: 0.6rem 0 1rem; font-family: var(--font-pixel); font-size: 1.3rem; font-weight: 400; text-transform: uppercase; color: var(--sky); text-shadow: 3px 3px 0 var(--ink); }
h2.won { color: var(--sun); text-shadow: 3px 3px 0 var(--rose); }
.standings { display: grid; gap: 6px; margin: 0 0 1rem; padding: 0; list-style: none; text-align: left; }
.standings li { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border: 2px solid var(--border); border-radius: 10px; background: var(--bg-warm); }
.standings li:first-child { border-color: var(--sun); }
.standings li.you { box-shadow: inset 4px 0 0 var(--sage); }
.standings li.left { opacity: 0.5; }
.place { font-family: var(--font-pixel); font-size: 9px; color: var(--text-muted); }
.name { flex: 1; font-size: 17px; text-transform: uppercase; color: var(--pc); }
.time { font-size: 15px; color: var(--text-muted); }
.score { font-family: var(--font-pixel); font-size: 11px; font-weight: 400; color: var(--text); }
.buttons { display: grid; gap: 10px; }
/* The game's chunky buttons (the app's own styles do not reach in here). */
.btn {
  display: grid;
  place-items: center;
  width: 100%;
  padding: calc(0.7rem + 0.38em) 1.25rem;
  border: 3px solid var(--ink);
  background: var(--coral);
  color: var(--text);
  box-shadow: inset -4px -4px 0 rgba(0, 0, 0, 0.3), inset 4px 4px 0 rgba(255, 255, 255, 0.25), 4px 4px 0 var(--ink);
  font-family: var(--font-pixel);
  font-size: 0.7rem;
  text-transform: uppercase;
  text-shadow: 2px 2px 0 var(--ink);
}
.btn:hover { background: #FF5571; }
.btn:active { transform: translate(4px, 4px); box-shadow: inset -4px -4px 0 rgba(0, 0, 0, 0.3); }
.btn-line { background: var(--bg-warm); color: var(--text-dim); }
.btn-line:hover { background: var(--border); }
.btn:focus-visible { outline: 3px solid var(--sun); outline-offset: 3px; }
</style>
