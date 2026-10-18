<script setup lang="ts">
/**
 * Explore: game designs other players shared. Browse the newest, the most
 * played or the most liked (or search by name or player), open one to see
 * what it changes and its own board, then play it, like it, or copy it into
 * your own game to change further. Signed in, you can share yours.
 */
import { computed, ref, watch } from 'vue'
import { account } from '../account'
import { codeForUrl, countPlay, fetchDesign, likeDesign, listDesigns, publishDesign, removeDesign, type DesignEntry, type DesignRow, type DesignSort } from '../api'
import { compact, design, isStock, playShared, replaceDesign, shared, stopShared } from '../design'
import { reset } from '../game'

const emit = defineEmits<{ close: [] }>()

type View = DesignSort | 'mine'
const VIEWS: { id: View; name: string }[] = [
  { id: 'new', name: 'Newest' },
  { id: 'played', name: 'Most played' },
  { id: 'liked', name: 'Most liked' },
  { id: 'mine', name: 'Mine' },
]
const view = ref<View>('new')
const query = ref('')
const list = ref<DesignRow[]>([])
const loading = ref(false)
const error = ref('')

let searchTimer = 0
async function load() {
  loading.value = true
  error.value = ''
  try {
    list.value = await listDesigns(view.value === 'mine' ? 'new' : view.value, query.value.trim(), view.value === 'mine')
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
    list.value = []
  } finally {
    loading.value = false
  }
}
watch(view, load, { immediate: true })
watch(query, () => {
  clearTimeout(searchTimer)
  searchTimer = window.setTimeout(load, 250)
})

/* ─── One design ─── */

const open = ref<DesignEntry | null>(null)
const busy = ref(false)
async function show(slug: string) {
  busy.value = true
  error.value = ''
  try {
    open.value = await fetchDesign(slug)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

function play(entry: DesignEntry) {
  playShared({ slug: entry.slug, name: entry.name, author: entry.author }, entry.design)
  void countPlay(entry.slug).catch(() => {})
  reset()
  emit('close')
}
function stop() {
  stopShared()
  reset()
}

async function like(entry: DesignEntry) {
  if (!account.code) return (error.value = 'Sign in (☰ → Account) to like designs')
  try {
    const r = await likeDesign(entry.slug)
    entry.likes = r.likes
    entry.liked = r.liked
    const row = list.value.find((d) => d.slug === entry.slug)
    if (row) Object.assign(row, r)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

const confirmCopy = ref(false)
function copyIn(entry: DesignEntry) {
  if (!confirmCopy.value) {
    confirmCopy.value = true
    setTimeout(() => (confirmCopy.value = false), 3000)
    return
  }
  confirmCopy.value = false
  stopShared()
  replaceDesign(compact(JSON.parse(JSON.stringify(entry.design))))
  copied.value = entry.name
}
const copied = ref('')

const confirmRemove = ref(false)
async function remove(entry: DesignEntry) {
  if (!confirmRemove.value) {
    confirmRemove.value = true
    setTimeout(() => (confirmRemove.value = false), 3000)
    return
  }
  confirmRemove.value = false
  try {
    await removeDesign(entry.slug)
    open.value = null
    await load()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

/* ─── Sharing yours ─── */

const publishing = ref(false)
const pubName = ref('')
const pubAbout = ref('')
const pubNote = ref('')
const changedLevels = computed(() => design.levels.filter((l) => Object.keys(l).length).length)
const stock = computed(() => isStock(design))
async function publish() {
  if (!pubName.value.trim() || stock.value) return
  pubNote.value = 'Sharing…'
  try {
    const { slug } = await publishDesign({ name: pubName.value.trim(), about: pubAbout.value.trim(), design: compact(design) })
    pubNote.value = ''
    publishing.value = false
    pubName.value = ''
    pubAbout.value = ''
    view.value = 'mine'
    await load()
    await show(slug)
  } catch (err) {
    pubNote.value = err instanceof Error ? err.message : String(err)
  }
}

const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
</script>

<template>
  <div class="explore">
    <p v-if="shared.slug" class="playing">
      Playing <b>{{ shared.name }}</b> by {{ shared.author }}
      <button class="tool" @click="stop">Back to yours</button>
    </p>

    <!-- One design, opened -->
    <section v-if="open" class="detail">
      <button class="back" @click="open = null">‹ All designs</button>
      <header>
        <h3>{{ open.name }}</h3>
        <span class="by">by {{ open.author }} · {{ when(open.created_at) }}</span>
      </header>
      <p v-if="open.about" class="about">{{ open.about }}</p>
      <p class="stats">
        <span>♥ {{ open.likes }}</span><span>▶ {{ open.plays }}</span><span>{{ open.levels }} levels changed</span><span>{{ open.items }} items</span>
      </p>
      <div class="actions">
        <button class="tool go" @click="play(open)">Play it</button>
        <button class="tool" :class="{ on: open.liked }" :aria-pressed="open.liked" @click="like(open)">{{ open.liked ? '♥ Liked' : '♡ Like' }}</button>
        <button class="tool" title="Replace the game on this device with this design, to change it further" @click="copyIn(open)">
          {{ confirmCopy ? 'Replace yours?' : 'Copy into my game' }}
        </button>
        <button v-if="open.mine" class="tool danger" @click="remove(open)">{{ confirmRemove ? 'Sure?' : 'Remove' }}</button>
      </div>
      <p v-if="copied" class="note">Copied “{{ copied }}” into your game: change it in Global and Levels.</p>
      <h4>Its board</h4>
      <p v-if="!open.scores.length" class="empty">No runs yet. Be the first: runs without cheats count here.</p>
      <ol v-else class="board">
        <li v-for="(g, i) in open.scores" :key="g.code">
          <span class="rank">{{ i + 1 }}</span>
          <span class="who">{{ g.name ?? 'guest' }}</span>
          <span class="lvl">L{{ g.level }}</span>
          <b>{{ g.score.toLocaleString() }}</b>
          <a :href="`#/game/${codeForUrl(g.code)}`" @click="emit('close')">watch</a>
        </li>
      </ol>
    </section>

    <!-- The list -->
    <template v-else>
      <div class="bar">
        <nav class="views">
          <button v-for="v in VIEWS" :key="v.id" class="view" :class="{ on: view === v.id }" :disabled="v.id === 'mine' && !account.code" @click="view = v.id">{{ v.name }}</button>
        </nav>
        <input v-model="query" class="search" placeholder="Search names or players" aria-label="Search designs" />
        <button class="tool go" @click="publishing = !publishing">{{ publishing ? 'Cancel' : 'Share mine' }}</button>
      </div>

      <section v-if="publishing" class="publish">
        <p v-if="!account.code" class="note">Sign in first (☰ → Account): shared designs carry your name.</p>
        <p v-else-if="stock" class="note">Your game is the stock game. Change something in Global or Levels first.</p>
        <template v-else>
          <p class="note">Shares your whole game as it is now: the global feel, {{ changedLevels }} changed level{{ changedLevels === 1 ? '' : 's' }}, {{ design.custom.length }} item{{ design.custom.length === 1 ? '' : 's' }}.</p>
          <input v-model="pubName" class="text" maxlength="40" placeholder="Name it" aria-label="Design name" />
          <textarea v-model="pubAbout" class="text" maxlength="400" rows="2" placeholder="What makes it fun (optional)" aria-label="About"></textarea>
          <div class="actions">
            <button class="tool go" :disabled="!pubName.trim()" @click="publish">Share</button>
            <span class="note">{{ pubNote }}</span>
          </div>
        </template>
      </section>

      <p v-if="error" class="error">{{ error }}</p>
      <p v-else-if="loading" class="empty">Loading…</p>
      <p v-else-if="!list.length" class="empty">{{ query ? 'Nothing matches.' : view === 'mine' ? 'You have not shared anything yet.' : 'Nothing shared yet. Be the first!' }}</p>
      <div v-else class="cards">
        <button v-for="d in list" :key="d.slug" class="card" :disabled="busy" @click="show(d.slug)">
          <span class="name">{{ d.name }}</span>
          <span class="by">by {{ d.author }}</span>
          <span v-if="d.about" class="about">{{ d.about }}</span>
          <span class="stats"><span :class="{ liked: d.liked }">♥ {{ d.likes }}</span><span>▶ {{ d.plays }}</span><span>{{ d.levels }} lv</span><span v-if="d.items">{{ d.items }} items</span></span>
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.explore { display: grid; gap: 10px; }
.playing { display: flex; align-items: center; gap: 10px; margin: 0; padding: 8px 12px; border-radius: 10px; background: #0F2A28; font-size: 16px; text-transform: uppercase; color: var(--text-dim); }
.playing b { font-weight: 400; color: var(--mint); }
.playing .tool { margin-left: auto; }
.bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.views { display: flex; gap: 4px; padding: 3px; border-radius: 10px; background: var(--bg-off); }
.view { padding: 5px 10px; border: 0; border-radius: 8px; background: none; font-size: 15px; text-transform: uppercase; color: var(--text-muted); }
.view.on { background: var(--bg-warm); color: var(--sage); }
.view:hover:not(:disabled) { color: var(--text); }
.view:disabled { opacity: 0.4; cursor: default; }
.search, .text {
  flex: 1;
  min-width: 10rem;
  padding: 6px 10px;
  border: 2px solid var(--border);
  border-radius: 8px;
  background: var(--bg-warm);
  color: var(--text);
  font: inherit;
  font-size: 17px;
}
textarea.text { resize: vertical; }
.search:focus, .text:focus { outline: none; border-color: var(--mint); }
.publish { display: grid; gap: 8px; padding: 10px; border: 2px dashed var(--border); border-radius: 10px; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr)); gap: 8px; }
.card {
  display: grid;
  gap: 4px;
  align-content: start;
  padding: 10px 12px;
  border: 2px solid var(--border);
  border-radius: 12px;
  background: var(--bg-off);
  text-align: left;
  color: var(--text-dim);
}
.card:hover { border-color: var(--mint); }
.card .name { font-family: var(--font-pixel); font-size: 11px; line-height: 1.4; color: var(--text); }
.by { font-size: 14px; text-transform: uppercase; color: var(--text-muted); }
.card .about { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 15px; }
.stats { display: flex; flex-wrap: wrap; gap: 10px; margin: 0; font-size: 14px; text-transform: uppercase; color: var(--text-muted); }
.stats .liked { color: var(--coral); }
.detail { display: grid; gap: 8px; }
.detail header { display: grid; gap: 2px; }
.detail h3 { margin: 0; font-family: var(--font-pixel); font-size: 14px; font-weight: 400; color: var(--mint); }
.detail h4 { margin: 6px 0 0; font-size: 15px; font-weight: 400; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }
.about { margin: 0; font-size: 17px; color: var(--text-dim); }
.back { justify-self: start; padding: 0; border: 0; background: none; font-size: 15px; text-transform: uppercase; color: var(--text-muted); }
.back:hover { color: var(--text); }
.actions { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.board { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; }
.board li { display: grid; grid-template-columns: 2.5ch 1fr auto auto auto; gap: 12px; align-items: center; padding: 4px 8px; border-radius: 6px; background: var(--bg-off); font-size: 16px; }
.board .rank { font-family: var(--font-pixel); font-size: 9px; color: var(--text-muted); }
.board .who { text-transform: uppercase; color: var(--text); }
.board .lvl { color: var(--text-muted); }
.board b { font-weight: 400; color: var(--sun); }
.board a { font-size: 14px; text-transform: uppercase; color: var(--sky); }
.tool {
  padding: 5px 10px;
  border: 2px solid var(--border);
  border-radius: 8px;
  background: var(--bg-off);
  font-size: 15px;
  text-transform: uppercase;
  color: var(--text-dim);
  white-space: nowrap;
}
.tool:hover:not(:disabled) { border-color: var(--sage); color: var(--text); }
.tool:disabled { opacity: 0.4; cursor: default; }
.tool.go { border-color: var(--sage); color: var(--sage); }
.tool.on { border-color: var(--coral); color: var(--coral); }
.tool.danger:hover { border-color: var(--coral); color: var(--coral); }
.note, .empty { margin: 0; font-size: 15px; color: var(--text-muted); }
.error { margin: 0; font-size: 16px; color: var(--coral); }
.view:focus-visible, .card:focus-visible, .tool:focus-visible, .back:focus-visible { outline: 3px solid var(--sun); outline-offset: 2px; }
</style>
