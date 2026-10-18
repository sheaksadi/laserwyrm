<script setup lang="ts">
/**
 * Custom play, from the start screen. Normal play is always the stock game;
 * here you play your own games instead (made in the editor), or ones other
 * players shared. Your games: play, edit, invite (a multiplayer room with it), rename,
 * delete, and + for a new one. Play a code: paste a code or link someone
 * sent. Below, Explore: everyone's published games.
 */
import { computed, ref } from 'vue'
import { countPlay, fetchDesign } from '../api'
import { custom, deleteGame, isStock, library, STOCK_GLOBAL, newGame, playShared, readShareCode, renameGame, shared, switchGame, type SavedGame } from '../design'
import { reset } from '../game'
import ExplorePanel from './ExplorePanel.vue'

const emit = defineEmits<{ close: []; play: []; editor: []; normal: []; invite: [gameId: string] }>()

const activeName = computed(() => library.games.find((g) => g.id === library.active)?.name ?? 'your game')
const changed = (g: SavedGame) => g.design.levels.filter((l) => Object.keys(l).length).length
function summary(g: SavedGame) {
  if (isStock(g.design)) return 'stock so far'
  const n = changed(g)
  const items = g.design.custom.length
  const parts = [
    JSON.stringify(g.design.global) !== JSON.stringify(STOCK_GLOBAL) ? 'feel changed' : '',
    n ? `${n} level${n === 1 ? '' : 's'} changed` : '',
    items ? `${items} item${items === 1 ? '' : 's'}` : '',
  ]
  return parts.filter(Boolean).join(' · ')
}

function play(g: SavedGame) {
  switchGame(g.id)
  emit('play')
}
function edit(g: SavedGame) {
  switchGame(g.id)
  emit('editor')
}
function create() {
  newGame()
  emit('editor')
}

const renaming = ref<string | null>(null)
function rename(g: SavedGame, value: string) {
  renameGame(g.id, value)
  renaming.value = null
}
const confirmDelete = ref<string | null>(null)
function remove(g: SavedGame) {
  if (confirmDelete.value !== g.id) {
    confirmDelete.value = g.id
    setTimeout(() => (confirmDelete.value = null), 2500)
    return
  }
  confirmDelete.value = null
  deleteGame(g.id)
}

/* ─── Playing a code someone sent ─── */

const code = ref('')
const codeError = ref('')
const loading = ref(false)
/** A share code (K7QM2X) or a link to one; a long LW2- code is added as a game of yours. */
async function playCode() {
  const text = code.value.trim()
  if (!text) return
  codeError.value = ''
  const full = readShareCode(text)
  if (full) {
    newGame('Imported game', full)
    code.value = ''
    emit('play')
    return
  }
  const slug = text.match(/#\/d\/(\w+)/)?.[1] ?? (/^[A-Za-z0-9]{6}$/.test(text) ? text.toUpperCase() : text)
  loading.value = true
  try {
    const entry = await fetchDesign(slug)
    playShared({ slug: entry.slug, name: entry.name, author: entry.author }, entry.design)
    void countPlay(entry.slug).catch(() => {})
    reset()
    code.value = ''
    emit('close')
  } catch {
    codeError.value = 'No game with that code'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="custom" role="dialog" aria-label="Custom games">
    <header>
      <h2>Custom</h2>
      <button class="close" aria-label="Close" @click="emit('close')">✕</button>
    </header>

    <p v-if="custom.on" class="now">
      Now playing: <b>{{ shared.slug ? `${shared.name} by ${shared.author}` : activeName }}</b>
      <button class="tool" @click="emit('normal')">Play normal</button>
    </p>

    <!-- Your games -->
    <section class="games">
      <h3>Your games</h3>
      <div v-for="g in library.games" :key="g.id" class="game" :class="{ active: g.id === library.active }">
        <div class="game-row">
          <div class="game-text">
            <input
              v-if="renaming === g.id"
              class="rename"
              maxlength="40"
              :value="g.name"
              aria-label="Game name"
              @keydown.enter="rename(g, ($event.target as HTMLInputElement).value)"
              @blur="rename(g, ($event.target as HTMLInputElement).value)"
            />
            <button v-else class="name" title="Rename" @click="renaming = g.id">{{ g.name }}</button>
            <span class="sum">{{ summary(g) }}</span>
          </div>
          <div class="game-buttons">
            <button class="act go" :data-nav-first="g.id === library.active ? '' : undefined" @click="play(g)">Play</button>
            <button class="act" @click="edit(g)">Edit</button>
            <button class="act invite" title="Open a multiplayer room with this game" @click="emit('invite', g.id)">Invite</button>
            <button v-if="library.games.length > 1" class="act danger" :aria-label="`Delete ${g.name}`" @click="remove(g)">{{ confirmDelete === g.id ? 'Sure?' : '✕' }}</button>
          </div>
        </div>
      </div>
      <button class="add" :disabled="library.games.length >= 50" @click="create"><span class="plus">+</span> New game</button>
    </section>

    <!-- A code or link someone sent -->
    <section>
      <h3>Play a code</h3>
      <div class="code-line">
        <input v-model="code" class="code" placeholder="K7QM2X, a link, or an LW2- code" aria-label="Game code" spellcheck="false" @keydown.enter="playCode" />
        <button class="act go" :disabled="!code.trim() || loading" @click="playCode">{{ loading ? '…' : 'Play' }}</button>
      </div>
      <p v-if="codeError" class="error">{{ codeError }}</p>
    </section>

    <!-- Everyone's published games -->
    <section>
      <h3>Explore</h3>
      <ExplorePanel @close="emit('close')" />
    </section>
  </div>
</template>

<style scoped>
.custom {
  display: grid;
  gap: 16px;
  width: min(52rem, 100%);
  max-height: 100%;
  overflow: auto;
  padding: 1.25rem 1.6rem 1.4rem;
  background: var(--bg);
  border: 3px solid var(--rose);
  border-radius: 16px;
  box-shadow: 0 0 0 3px var(--ink), 0 0 0 6px var(--mint), 8px 8px 0 6px var(--ink);
}
header { display: flex; justify-content: space-between; align-items: center; }
h2 {
  margin: 0;
  font-family: var(--font-pixel);
  font-size: 1.1rem;
  font-weight: 400;
  text-transform: uppercase;
  color: var(--mint);
  text-shadow: 3px 3px 0 var(--rose);
}
h3 { margin: 0 0 8px; font-size: 15px; font-weight: 400; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); }
.close { width: 34px; height: 34px; border: 2px solid var(--border); border-radius: 8px; background: var(--bg-off); color: var(--text-dim); }
.close:hover { border-color: var(--sage); color: var(--text); }
.now { display: flex; align-items: center; gap: 10px; margin: 0; padding: 8px 12px; border-radius: 10px; background: #0F2A28; font-size: 16px; text-transform: uppercase; color: var(--text-dim); }
.now b { font-weight: 400; color: var(--mint); }
.now .tool { margin-left: auto; }
.games { display: grid; gap: 8px; }
.games h3 { margin: 0; }
.game { display: grid; gap: 8px; padding: 10px 12px; border: 2px solid var(--border); border-radius: 12px; background: var(--bg-warm); }
.game.active { border-color: #2F6F66; }
.game-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.game-text { flex: 1; display: grid; gap: 2px; min-width: 10rem; }
.name { justify-self: start; padding: 0; border: 0; background: none; font-family: var(--font-pixel); font-size: 11px; line-height: 1.5; text-transform: uppercase; color: var(--text); text-align: left; }
.name:hover { color: var(--mint); }
.rename { padding: 3px 8px; border: 2px solid var(--mint); border-radius: 6px; background: var(--bg-off); color: var(--text); font: inherit; font-size: 17px; }
.sum { font-size: 15px; text-transform: uppercase; color: var(--text-muted); }
.game-buttons { display: flex; gap: 6px; }
.act {
  padding: 8px 12px;
  border: 2px solid var(--border);
  border-radius: 10px;
  background: var(--bg-off);
  font-family: var(--font-pixel);
  font-size: 9px;
  text-transform: uppercase;
  color: var(--text-dim);
}
.act:hover:not(:disabled) { border-color: var(--sage); color: var(--text); }
.act:disabled { opacity: 0.4; cursor: default; }
.act.go { border-color: var(--sage); background: var(--sage); color: var(--ink); }
.act.go:hover:not(:disabled) { background: #7CFF7C; }
.act.on { border-color: var(--mint); color: var(--mint); }
.act.invite { border-color: var(--sky); color: var(--sky); }
.act.invite:hover { background: var(--sky); color: var(--ink); }
.act.danger:hover { border-color: var(--coral); color: var(--coral); }
.add {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border: 2px dashed var(--border);
  border-radius: 12px;
  background: none;
  font-size: 17px;
  text-transform: uppercase;
  color: var(--sage);
}
.add:hover:not(:disabled) { border-color: var(--sage); background: rgba(92, 255, 92, 0.05); }
.plus { font-family: var(--font-pixel); font-size: 16px; }
.code-line { display: flex; gap: 8px; }
.code { flex: 1; min-width: 0; padding: 7px 10px; border: 2px solid var(--border); border-radius: 8px; background: var(--bg-warm); color: var(--text); font: inherit; font-size: 17px; }
.code:focus { outline: none; border-color: var(--mint); }
.error { margin: 6px 0 0; font-size: 15px; color: var(--coral); }
.tool { padding: 5px 10px; border: 2px solid var(--border); border-radius: 8px; background: var(--bg-off); font-size: 15px; text-transform: uppercase; color: var(--text-dim); }
.tool:hover { border-color: var(--sage); color: var(--text); }
.act:focus-visible, .close:focus-visible, .add:focus-visible, .name:focus-visible, .tool:focus-visible { outline: 3px solid var(--sun); outline-offset: 2px; }
</style>
