<script setup lang="ts">
/**
 * Multiplayer, before the game: create a room or type a six-digit code to
 * join one; then the lobby, where the host picks the game and the mode and
 * starts it, and everyone else sees who is in and what is coming.
 */
import { computed, ref } from 'vue'
import { library } from '../design'
import { colorOf, createRoom, isHost, joinRoom, leaveRoom, MINUTES, MODES, mp, setSettings, startMatch, TARGETS, type MpMode } from '../multiplayer'
import NameEdit from './NameEdit.vue'

const emit = defineEmits<{ close: [] }>()

const code = ref('')
const digits = computed(() => code.value.replace(/\D/g, '').slice(0, 6))
function typed() {
  code.value = digits.value
  if (digits.value.length === 6) void joinRoom(digits.value)
}
const join = () => digits.value.length === 6 && void joinRoom(digits.value)

const inRoom = computed(() => mp.phase === 'lobby' && mp.code)
const link = computed(() => `${location.origin}${location.pathname}#/mp/${mp.code}`)
const copied = ref(false)
async function copyLink() {
  try {
    await navigator.clipboard.writeText(link.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    /* no clipboard: the code is on screen */
  }
}

function close() {
  if (mp.phase !== 'off') leaveRoom()
  emit('close')
}
const modes = Object.entries(MODES) as [MpMode, (typeof MODES)[MpMode]][]
</script>

<template>
  <div class="mp" role="dialog" aria-label="Multiplayer">
    <header>
      <h2>Multiplayer</h2>
      <button class="close" aria-label="Close" @click="close">✕</button>
    </header>

    <!-- Your snake's name, here and in the room: rename any time -->
    <div class="field-row">
      <span class="label">Your snake</span>
      <NameEdit />
    </div>

    <!-- Not in a room yet: create or join -->
    <template v-if="!inRoom">
      <div class="split">
        <section class="box">
          <h3>Start a room</h3>
          <p class="note">You pick the game; friends join with the code.</p>
          <button class="act go big" :disabled="mp.phase === 'connecting'" data-nav-first @click="createRoom()">Create room</button>
        </section>
        <section class="box">
          <h3>Join a room</h3>
          <input
            :value="code"
            class="field code"
            inputmode="numeric"
            maxlength="6"
            placeholder="000000"
            aria-label="Six-digit room code"
            @input="code = ($event.target as HTMLInputElement).value; typed()"
            @keydown.enter="join"
          />
          <button class="act big" :disabled="digits.length !== 6 || mp.phase === 'connecting'" @click="join">Join</button>
        </section>
      </div>
      <p v-if="mp.phase === 'connecting'" class="note">Connecting…</p>
    </template>

    <!-- The lobby -->
    <template v-else>
      <div class="room">
        <div class="code-box">
          <span class="label">Room code</span>
          <b class="room-code">{{ mp.code.slice(0, 3) }} {{ mp.code.slice(3) }}</b>
          <button class="act" @click="copyLink">{{ copied ? 'Copied' : 'Copy invite link' }}</button>
        </div>
        <ul class="players">
          <li v-for="p in mp.players" :key="p.index" :style="{ '--pc': p.index === mp.you ? 'var(--sage)' : colorOf(p.index) }">
            <i class="swatch"></i>
            <span class="pname">{{ p.name }}</span>
            <span v-if="p.index === mp.host" class="tag">host</span>
            <span v-if="p.index === mp.you" class="tag you">you</span>
          </li>
          <li v-for="n in Math.max(0, 2 - mp.players.length)" :key="`e${n}`" class="empty">waiting for a player…</li>
        </ul>
      </div>

      <section>
        <h3>Game</h3>
        <div v-if="isHost()" class="chips">
          <button class="chip" :class="{ on: mp.gameId === 'main' }" @click="setSettings({ gameId: 'main' })">Main game</button>
          <button v-for="g in library.games" :key="g.id" class="chip" :class="{ on: mp.gameId === g.id }" @click="setSettings({ gameId: g.id })">{{ g.name }}</button>
        </div>
        <p v-else class="picked">{{ mp.settings.game }}</p>
      </section>

      <section>
        <h3>Mode</h3>
        <div class="modes">
          <button
            v-for="[id, m] in modes"
            :key="id"
            class="mode"
            :class="{ on: mp.settings.mode === id }"
            :disabled="!isHost()"
            @click="setSettings({ mode: id })"
          >
            <b>{{ m.name }}</b>
            <span>{{ m.blurb }}</span>
          </button>
        </div>
        <div v-if="mp.settings.mode === 'score'" class="chips">
          <span class="label">Time</span>
          <button v-for="m in MINUTES" :key="m" class="chip" :class="{ on: mp.settings.minutes === m }" :disabled="!isHost()" @click="setSettings({ minutes: m })">{{ m }} min</button>
        </div>
        <div v-else-if="mp.settings.mode === 'sprint'" class="chips">
          <span class="label">First to</span>
          <button v-for="t in TARGETS" :key="t" class="chip" :class="{ on: mp.settings.target === t }" :disabled="!isHost()" @click="setSettings({ target: t })">{{ t.toLocaleString() }}</button>
        </div>
      </section>

      <div class="foot">
        <button class="act" @click="close">Leave</button>
        <button v-if="isHost()" class="act go big" data-nav-first @click="startMatch">
          Start{{ mp.players.length < 2 ? ' alone' : ` · ${mp.players.length} players` }}
        </button>
        <p v-else class="note">Waiting for the host to start…</p>
      </div>
    </template>

    <p v-if="mp.error" class="error">{{ mp.error }}</p>
  </div>
</template>

<style scoped>
.mp {
  display: grid;
  gap: 14px;
  width: min(40rem, 100%);
  max-height: 100%;
  overflow: auto;
  padding: 1.25rem 1.6rem 1.4rem;
  background: var(--bg);
  border: 3px solid var(--sky);
  border-radius: 16px;
  box-shadow: 0 0 0 3px var(--ink), 0 0 0 6px var(--rose), 8px 8px 0 6px var(--ink);
}
header { display: flex; justify-content: space-between; align-items: center; }
h2 { margin: 0; font-family: var(--font-pixel); font-size: 1.1rem; font-weight: 400; text-transform: uppercase; color: var(--sky); text-shadow: 3px 3px 0 var(--rose); }
h3 { margin: 0 0 8px; font-size: 15px; font-weight: 400; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); }
.close { width: 34px; height: 34px; border: 2px solid var(--border); border-radius: 8px; background: var(--bg-off); color: var(--text-dim); }
.close:hover { border-color: var(--sage); color: var(--text); }
.label { font-size: 14px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }
.note { margin: 0; font-size: 15px; text-transform: uppercase; color: var(--text-muted); }
.error { margin: 0; font-size: 16px; text-transform: uppercase; color: var(--coral); }
.field-row { display: grid; gap: 4px; }
.field {
  padding: 8px 12px;
  border: 2px solid var(--border);
  border-radius: 10px;
  background: var(--bg-off);
  color: var(--text);
  font: inherit;
  font-size: 18px;
}
.field:focus { outline: none; border-color: var(--sky); }
.code { font-family: var(--font-pixel); font-size: 18px; letter-spacing: 0.3em; text-align: center; }
.split { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.box { display: grid; gap: 10px; align-content: start; padding: 12px; border: 2px solid var(--border); border-radius: 12px; background: var(--bg-warm); }
.box h3 { margin: 0; }
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
.act:hover:not(:disabled) { border-color: var(--sky); color: var(--text); }
.act:disabled { opacity: 0.4; cursor: default; }
.act.go { border-color: var(--sky); background: var(--sky); color: var(--ink); }
.act.go:hover:not(:disabled) { background: #6FC0FF; }
.act.big { padding: 12px 16px; font-size: 10px; }
.room { display: grid; grid-template-columns: auto 1fr; gap: 14px; align-items: start; }
.code-box { display: grid; gap: 6px; justify-items: center; padding: 12px 16px; border: 2px solid var(--sky); border-radius: 12px; background: #0B1A2A; }
.room-code { font-family: var(--font-pixel); font-size: 1.5rem; font-weight: 400; letter-spacing: 0.08em; color: var(--sky); text-shadow: 3px 3px 0 var(--ink); }
.players { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
.players li { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border: 2px solid var(--border); border-radius: 10px; background: var(--bg-warm); font-size: 17px; text-transform: uppercase; }
.players li.empty { border-style: dashed; color: var(--text-muted); font-size: 15px; }
.swatch { width: 12px; height: 12px; border-radius: 3px; background: var(--pc); box-shadow: 0 0 8px var(--pc); }
.pname { flex: 1; color: var(--text); }
.tag { font-size: 13px; color: var(--text-muted); }
.tag.you { color: var(--sage); }
.chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 8px; }
.chips:first-of-type { margin-top: 0; }
.chip { padding: 6px 12px; border: 2px solid var(--border); border-radius: 999px; background: var(--bg-off); font-size: 16px; text-transform: uppercase; color: var(--text-dim); }
.chip:hover:not(:disabled) { border-color: var(--sky); color: var(--text); }
.chip.on { border-color: var(--sky); background: #0B1A2A; color: var(--sky); }
.chip:disabled:not(.on) { opacity: 0.4; }
.picked { margin: 0; font-family: var(--font-pixel); font-size: 11px; text-transform: uppercase; color: var(--text); }
.modes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.mode { display: grid; gap: 4px; align-content: start; padding: 10px; border: 2px solid var(--border); border-radius: 12px; background: var(--bg-warm); text-align: left; color: var(--text-dim); }
.mode b { font-family: var(--font-pixel); font-size: 9px; font-weight: 400; text-transform: uppercase; color: var(--text); }
.mode span { font-size: 14px; line-height: 1.15; text-transform: uppercase; color: var(--text-muted); }
.mode:hover:not(:disabled) { border-color: var(--sky); }
.mode.on { border-color: var(--sky); background: #0B1A2A; }
.mode.on b { color: var(--sky); }
.mode:disabled { cursor: default; }
.mode:disabled:not(.on) { opacity: 0.5; }
.foot { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.act:focus-visible, .chip:focus-visible, .mode:focus-visible, .close:focus-visible { outline: 3px solid var(--sun); outline-offset: 2px; }
@media (max-width: 560px) {
  .split, .room { grid-template-columns: 1fr; }
  .modes { grid-template-columns: 1fr; }
  .mp { padding: 1rem; }
}
</style>
