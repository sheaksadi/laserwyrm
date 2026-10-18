<script setup lang="ts">
/**
 * AI agents (☰ → AI agent): let an agent such as Claude Code, Codex,
 * OpenCode, Cursor or Gemini CLI make and change your custom games over
 * MCP. Signed in, switch on "Connect AI agents" (your games sync to your
 * account), make a key, and paste the setup for your agent. Agents work the
 * editor: games, levels, walls, items, rules, music. They cannot play, post
 * scores, or reach anything but your custom games.
 */
import { computed, onMounted, ref } from 'vue'
import { account } from '../account'
import { ApiError } from '../api'
import { library } from '../design'
import { sync } from '../sync'

const emit = defineEmits<{ close: [] }>()

interface AgentKey { id: number; label: string; created_at: string; last_used: string | null }
const keys = ref<AgentKey[]>([])
const fresh = ref<string | null>(null)
const label = ref('')
const error = ref('')

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { 'content-type': 'application/json', authorization: `Bearer ${account.code}` } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(body.error ?? `failed (${res.status})`, res.status)
  return body as T
}
async function loadKeys() {
  if (!account.code) return
  try {
    keys.value = (await call<{ keys: AgentKey[] }>('/api/me/agent-keys')).keys
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}
onMounted(loadKeys)
async function makeKey() {
  error.value = ''
  try {
    const made = await call<{ key: string }>('/api/me/agent-keys', { method: 'POST', body: JSON.stringify({ label: label.value || client.value }) })
    fresh.value = made.key
    label.value = ''
    sync.on = true
    await loadKeys()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}
async function revoke(k: AgentKey) {
  await call(`/api/me/agent-keys/${k.id}`, { method: 'DELETE' }).catch(() => {})
  await loadKeys()
}

/* ─── Setting up each agent ─── */

const url = `${location.origin}/mcp`
const key = computed(() => fresh.value ?? 'lwa_YOUR_KEY')
type Client = 'Claude Code' | 'Codex' | 'OpenCode' | 'Cursor' | 'Gemini CLI' | 'Other'
const CLIENTS: Client[] = ['Claude Code', 'Codex', 'OpenCode', 'Cursor', 'Gemini CLI', 'Other']
const client = ref<Client>('Claude Code')
const setup = computed(() => {
  const k = key.value
  switch (client.value) {
    case 'Claude Code':
      return { where: 'Run in a terminal:', code: `claude mcp add --transport http laserwyrm ${url} --header "Authorization: Bearer ${k}"` }
    case 'Codex':
      return {
        where: 'Add to ~/.codex/config.toml, and set the key in your shell (export LASERWYRM_KEY=…):',
        code: `[mcp_servers.laserwyrm]\nurl = "${url}"\nbearer_token_env_var = "LASERWYRM_KEY"\n\n# export LASERWYRM_KEY=${k}`,
      }
    case 'OpenCode':
      return {
        where: 'Add to opencode.json (in your project, or ~/.config/opencode/):',
        code: JSON.stringify({ $schema: 'https://opencode.ai/config.json', mcp: { laserwyrm: { type: 'remote', url, headers: { Authorization: `Bearer ${k}` }, enabled: true } } }, null, 2),
      }
    case 'Cursor':
      return { where: 'Add to ~/.cursor/mcp.json:', code: JSON.stringify({ mcpServers: { laserwyrm: { url, headers: { Authorization: `Bearer ${k}` } } } }, null, 2) }
    case 'Gemini CLI':
      return { where: 'Add to ~/.gemini/settings.json:', code: JSON.stringify({ mcpServers: { laserwyrm: { httpUrl: url, headers: { Authorization: `Bearer ${k}` } } } }, null, 2) }
    default:
      return {
        where: 'Any MCP client: Streamable HTTP at this URL with the header below. For clients that only run local (stdio) servers, such as Claude Desktop, bridge with mcp-remote:',
        code: `URL: ${url}\nHeader: Authorization: Bearer ${k}\n\n${JSON.stringify({ mcpServers: { laserwyrm: { command: 'npx', args: ['-y', 'mcp-remote', url, '--header', `Authorization: Bearer ${k}`] } } }, null, 2)}`,
      }
  }
})
const copied = ref('')
async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = what
  } catch {
    copied.value = 'select and copy by hand'
  }
  setTimeout(() => (copied.value = ''), 2500)
}
const ago = (at: number) => {
  const s = Math.round((Date.now() - at) / 1000)
  return s < 5 ? 'just now' : s < 60 ? `${s}s ago` : `${Math.round(s / 60)} min ago`
}
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never')
</script>

<template>
  <div class="agent" role="dialog" aria-label="AI agents">
    <header>
      <h2>AI agent</h2>
      <button class="close" aria-label="Close" @click="emit('close')">✕</button>
    </header>
    <p class="lead">
      Let an AI agent make and change your custom games: levels, walls, items, rules, music. It works the editor, like you do. It cannot play,
      post scores, or reach anything but your custom games.
    </p>

    <p v-if="!account.code" class="note">Sign in first (☰ → Account): agents work on your account's games.</p>
    <template v-else>
      <button class="row" role="switch" :aria-checked="sync.on" @click="sync.on = !sync.on">
        <span><b>Connect AI agents</b> your {{ library.games.length }} game{{ library.games.length === 1 ? '' : 's' }} sync to your account, and agents' changes come back live</span>
        <span class="state" :class="{ on: sync.on }">{{ sync.on ? 'on' : 'off' }}</span>
      </button>
      <p v-if="sync.on" class="status">
        <template v-if="sync.error"><span class="bad">{{ sync.error }}</span></template>
        <template v-else-if="sync.lastAt">Synced {{ ago(sync.lastAt) }}</template>
        <template v-else>Syncing…</template>
        <template v-if="sync.incoming"> · an agent changed “{{ sync.incoming.name }}” {{ ago(sync.incoming.at) }}</template>
      </p>

      <section>
        <h3>1 · Pick your agent</h3>
        <div class="clients" role="tablist">
          <button v-for="c in CLIENTS" :key="c" class="client" role="tab" :aria-selected="client === c" :class="{ on: client === c }" @click="client = c">{{ c }}</button>
        </div>
      </section>

      <section>
        <h3>2 · Make a key</h3>
        <div class="line">
          <input v-model="label" class="text" maxlength="40" :placeholder="`What it is for (${client})`" aria-label="Key label" />
          <button class="tool go" @click="makeKey">New key</button>
        </div>
        <div v-if="fresh" class="fresh">
          <code>{{ fresh }}</code>
          <button class="tool" @click="copy(fresh!, 'key copied')">Copy</button>
          <span class="muted">Shown once. It only opens these tools for your games; revoke it any time.</span>
        </div>
        <ul v-if="keys.length" class="keys">
          <li v-for="k in keys" :key="k.id">
            <span>{{ k.label || 'key' }}</span>
            <span class="muted">used {{ when(k.last_used) }}</span>
            <button class="tool danger" @click="revoke(k)">Revoke</button>
          </li>
        </ul>
      </section>

      <section>
        <h3>3 · Add it to {{ client }}</h3>
        <p class="muted">{{ setup.where }}</p>
        <pre class="snippet">{{ setup.code }}</pre>
        <div class="line">
          <button class="tool" @click="copy(setup.code, 'setup copied')">Copy setup</button>
          <span class="muted">{{ copied || (fresh ? 'Your new key is filled in.' : 'Make a key above to fill it in.') }}</span>
        </div>
        <p class="muted">Then ask it something like: “Make me a Laserwyrm game called Maze Rush: walls that close in level by level, faster tempo, a power-up that gives shield and ghost.”</p>
      </section>
      <p v-if="error" class="bad">{{ error }}</p>
    </template>
  </div>
</template>

<style scoped>
.agent {
  display: grid;
  gap: 12px;
  width: min(40rem, 100%);
  max-height: 100%;
  overflow: auto;
  padding: 1.25rem 1.6rem 1.4rem;
  background: var(--bg);
  border: 3px solid var(--lavender);
  border-radius: 16px;
  box-shadow: 0 0 0 3px var(--ink), 0 0 0 6px var(--mint), 8px 8px 0 6px var(--ink);
}
header { display: flex; justify-content: space-between; align-items: center; }
h2 { margin: 0; font-family: var(--font-pixel); font-size: 1.1rem; font-weight: 400; text-transform: uppercase; color: var(--lavender); text-shadow: 3px 3px 0 var(--ink); }
h3 { margin: 0 0 6px; font-size: 15px; font-weight: 400; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }
section { display: grid; gap: 6px; }
.lead { margin: 0; font-size: 17px; color: var(--text-dim); }
.note, .muted { margin: 0; font-size: 14px; color: var(--text-muted); }
.status { margin: 0; font-size: 14px; text-transform: uppercase; color: var(--sage); }
.bad { color: var(--coral); }
.close { width: 34px; height: 34px; border: 2px solid var(--border); border-radius: 8px; background: var(--bg-off); color: var(--text-dim); }
.close:hover { border-color: var(--sage); color: var(--text); }
.row { display: flex; justify-content: space-between; align-items: center; gap: 12px; width: 100%; padding: 8px 10px; border: 2px solid var(--border); border-radius: 10px; background: var(--bg-off); font-size: 16px; text-align: left; color: var(--text-dim); }
.row b { font-weight: 400; color: var(--text); margin-right: 6px; text-transform: uppercase; }
.row:hover { border-color: var(--sage); }
.state { flex: none; font-family: var(--font-pixel); font-size: 9px; text-transform: uppercase; color: var(--text-muted); }
.state.on { color: var(--sage); }
.clients { display: flex; flex-wrap: wrap; gap: 6px; }
.client { padding: 5px 10px; border: 2px solid var(--border); border-radius: 8px; background: var(--bg-off); font-size: 15px; text-transform: uppercase; color: var(--text-muted); }
.client.on { border-color: var(--lavender); color: var(--text); }
.line { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.text { flex: 1; min-width: 10rem; padding: 6px 10px; border: 2px solid var(--border); border-radius: 8px; background: var(--bg-warm); color: var(--text); font: inherit; font-size: 16px; }
.text:focus { outline: none; border-color: var(--mint); }
.fresh { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 8px 10px; border: 2px dashed var(--sun); border-radius: 10px; }
.fresh code { font-size: 14px; color: var(--sun); user-select: all; overflow-wrap: anywhere; }
.keys { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
.keys li { display: grid; grid-template-columns: 1fr auto auto; gap: 10px; align-items: center; padding: 4px 8px; border-radius: 8px; background: var(--bg-off); font-size: 15px; text-transform: uppercase; }
.snippet { margin: 0; padding: 10px 12px; overflow: auto; border: 2px solid var(--border); border-radius: 10px; background: var(--bg-off); font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.5; color: #CFE8FF; white-space: pre; user-select: all; }
.tool { padding: 5px 10px; border: 2px solid var(--border); border-radius: 8px; background: var(--bg-off); font-size: 15px; text-transform: uppercase; color: var(--text-dim); white-space: nowrap; }
.tool:hover { border-color: var(--sage); color: var(--text); }
.tool.go { border-color: var(--sage); color: var(--sage); }
.tool.danger:hover { border-color: var(--coral); color: var(--coral); }
.close:focus-visible, .row:focus-visible, .client:focus-visible, .tool:focus-visible { outline: 3px solid var(--sun); outline-offset: 2px; }
</style>
