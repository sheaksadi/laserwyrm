<script setup lang="ts">
/**
 * Settings, in tabs: sound, controls (controller, phone, keyboard), display
 * (full screen, the board renderer, the frame-rate meter), cheats, and
 * about. Every choice is saved in this browser and applies at once. The
 * ☰ menu's switches (music, sound, phone controls) are all here too.
 */
import { muted, musicOn, musicVolume, previewSfx, sfxVolume } from '../audio'
import { canFullscreen, fullscreenOn } from '../fullscreen'
import { pad, rumbleFor, vibrationOn, vibrationStrength } from '../gamepad'
import { touchControls } from '../controls'
import { isTouch } from '../game'
import { showFps, showGraph, showLow } from '../perf'
import { htmlInCanvas, renderer } from '../renderer'
import { go } from '../app/route'
import { openAgent, openCustom, showHowToPlay, ui, type SettingsTab } from '../app/ui'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { ACTIONS, bind, bindings, FIXED, keyLabel, resetKeys, type Action } from '../keys'
import AccountPanel from './AccountPanel.vue'
import CheatsPanel from './CheatsPanel.vue'

const emit = defineEmits<{ close: [] }>()

const TABS: { id: SettingsTab; name: string; icon: string }[] = [
  { id: 'sound', name: 'Sound', icon: 'M11 5 6 9H2v6h4l5 4V5z M15.5 8.5a5 5 0 0 1 0 7' },
  { id: 'controls', name: 'Controls', icon: 'M6 8h12a4 4 0 0 1 4 4l1 5a3 3 0 0 1-5 2l-3-3H9l-3 3a3 3 0 0 1-5-2l1-5a4 4 0 0 1 4-4z M8 11v4M6 13h4' },
  { id: 'display', name: 'Display', icon: 'M3 4h18v12H3z M8 20h8 M12 16v4' },
  { id: 'account', name: 'Account', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0' },
  { id: 'cheats', name: 'Cheats', icon: 'M12 2l2.5 6.5L21 9l-5 4.5L17.5 21 12 17l-5.5 4L8 13.5 3 9l6.5-.5z' },
  { id: 'about', name: 'About', icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 11v6 M12 7.5v.5' },
]

/* ─── Changing a key: click it, then press the new one (Esc cancels, Backspace clears) ─── */
const listening = ref<{ action: Action; slot: 0 | 1 } | null>(null)
function listen(action: Action, slot: 0 | 1) {
  listening.value = listening.value?.action === action && listening.value.slot === slot ? null : { action, slot }
}
function onKeyCapture(event: KeyboardEvent) {
  const l = listening.value
  if (!l) return
  // This key is the answer, not a command for the game.
  event.preventDefault()
  event.stopImmediatePropagation()
  listening.value = null
  if (event.key === 'Escape') return
  if (event.key === 'Backspace' || event.key === 'Delete') return bind(l.action, l.slot, '')
  if (FIXED.has(event.key) || event.key === 'Shift' || event.key === 'Control' || event.key === 'Alt' || event.key === 'Meta') return
  bind(l.action, l.slot, event.key)
}
onMounted(() => window.addEventListener('keydown', onKeyCapture, { capture: true }))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeyCapture, { capture: true }))

const pct = (v: number) => `${Math.round(v * 100)}%`
const num = (e: Event) => Number((e.target as HTMLInputElement).value)

/** Let the change be heard or felt straight away. */
function setSfx(e: Event) {
  sfxVolume.value = num(e)
  previewSfx()
}
function setStrength(e: Event) {
  vibrationStrength.value = num(e)
  rumbleFor('hurt', 3, true)
}
</script>

<template>
  <div class="settings" role="dialog" aria-label="Settings">
    <header>
      <h2>Settings</h2>
      <button class="close" aria-label="Close settings" @click="emit('close')">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </header>

    <nav class="tabs" role="tablist" aria-label="Settings">
      <button
        v-for="t in TABS"
        :key="t.id"
        class="tab"
        role="tab"
        :class="{ on: ui.settingsTab === t.id, cheat: t.id === 'cheats' }"
        :aria-selected="ui.settingsTab === t.id"
        :data-nav-first="ui.settingsTab === t.id ? '' : undefined"
        @click="ui.settingsTab = t.id"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="t.icon" /></svg>
        <span>{{ t.name }}</span>
      </button>
    </nav>

    <div class="body">
      <!-- Sound -->
      <template v-if="ui.settingsTab === 'sound'">
        <section>
          <h3>Sound</h3>
        <button class="row" role="switch" :aria-checked="!muted" @click="muted = !muted">
          <span><b>All sound</b></span>
          <span class="state" :class="{ on: !muted }">{{ muted ? 'off' : 'on' }}</span>
        </button>
        <div class="slider-row" :class="{ off: muted || !musicOn }">
          <button class="mini" role="switch" :aria-checked="musicOn" :aria-label="musicOn ? 'Music on' : 'Music off'" @click="musicOn = !musicOn">
            <span class="state" :class="{ on: musicOn }">{{ musicOn ? 'on' : 'off' }}</span>
          </button>
          <label for="music-vol"><b>Music</b></label>
          <input id="music-vol" type="range" min="0" max="1" step="0.05" :value="musicVolume" @input="musicVolume = num($event)" />
          <span class="pct">{{ pct(musicVolume) }}</span>
        </div>
        <div class="slider-row" :class="{ off: muted }">
          <span class="mini-space"></span>
          <label for="sfx-vol"><b>Effects</b></label>
          <input id="sfx-vol" type="range" min="0" max="1" step="0.05" :value="sfxVolume" @input="setSfx" />
          <span class="pct">{{ pct(sfxVolume) }}</span>
        </div>
        </section>
      </template>

      <!-- Controls: controller, phone, keyboard -->
      <template v-else-if="ui.settingsTab === 'controls'">
        <section>
          <h3>Controller</h3>
        <button class="row" role="switch" :aria-checked="vibrationOn" @click="vibrationOn = !vibrationOn">
          <span><b>Vibration</b> hits, cuts and game over, by how hard they land</span>
          <span class="state" :class="{ on: vibrationOn }">{{ vibrationOn ? 'on' : 'off' }}</span>
        </button>
        <div class="slider-row" :class="{ off: !vibrationOn }">
          <span class="mini-space"></span>
          <label for="rumble"><b>Strength</b></label>
          <input id="rumble" type="range" min="0.2" max="1" step="0.1" :value="vibrationStrength" :disabled="!vibrationOn" @change="setStrength" @input="vibrationStrength = num($event)" />
          <span class="pct">{{ pct(vibrationStrength) }}</span>
        </div>
        <p v-if="!pad.connected" class="note">No controller connected. Press any button on one to use it.</p>
        </section>
        <section>
          <h3>Phone controls <span class="h3-note" v-if="!isTouch()">(on phones and tablets)</span></h3>
        <!-- Each choice with a picture of a phone held sideways, as it plays -->
        <div class="pads" role="radiogroup" aria-label="Phone controls">
          <button class="pad-pick" role="radio" :aria-checked="touchControls === 'dpad'" :class="{ on: touchControls === 'dpad' }" @click="touchControls = 'dpad'">
            <svg viewBox="0 0 160 84" aria-hidden="true">
              <rect x="2" y="2" width="156" height="80" rx="12" class="phone" />
              <rect x="22" y="10" width="116" height="64" class="screen-area" />
              <path d="M35 30h11v11H35zM24 41h11v11H24zM35 41h11v11H35zM46 41h11v11H46zM35 52h11v11H35z" class="dpad-shape" />
              <path d="M35 30h11v11H35z" class="dpad-hot" />
              <rect x="80" y="10" width="58" height="64" class="action-half" />
              <circle cx="110" cy="42" r="9" class="tap" />
              <text x="110" y="70" class="tag">use</text>
            </svg>
            <span><b>D-pad</b> in the corner: tap a way to turn, or hold and slide</span>
          </button>
          <button class="pad-pick" role="radio" :aria-checked="touchControls === 'stick'" :class="{ on: touchControls === 'stick' }" @click="touchControls = 'stick'">
            <svg viewBox="0 0 160 84" aria-hidden="true">
              <rect x="2" y="2" width="156" height="80" rx="12" class="phone" />
              <rect x="22" y="10" width="116" height="64" class="screen-area" />
              <rect x="22" y="10" width="58" height="64" class="stick-half" />
              <circle cx="48" cy="46" r="15" class="stick-ring" />
              <circle cx="56" cy="40" r="7" class="stick-knob" />
              <rect x="80" y="10" width="58" height="64" class="action-half" />
              <circle cx="110" cy="42" r="9" class="tap" />
              <text x="51" y="70" class="tag">steer</text>
              <text x="110" y="70" class="tag">use</text>
            </svg>
            <span><b>Stick</b> wherever your left thumb lands on the left half</span>
          </button>
        </div>
        </section>
        <section>
          <h3>Keyboard <span class="h3-note">click a key to change it</span></h3>
          <div class="binds">
            <div v-for="a in ACTIONS" :key="a.id" class="bind">
              <span class="bind-name">{{ a.name }}</span>
              <button
                v-for="slot in ([0, 1] as const)"
                :key="slot"
                class="key"
                :class="{ waiting: listening?.action === a.id && listening.slot === slot, empty: !bindings[a.id][slot] }"
                :aria-label="`${a.name}, key ${slot + 1}: ${bindings[a.id][slot] ? keyLabel(bindings[a.id][slot]!) : 'none'}`"
                @click="listen(a.id, slot)"
              >{{ listening?.action === a.id && listening.slot === slot ? 'press a key' : bindings[a.id][slot] ? keyLabel(bindings[a.id][slot]!) : '+' }}</button>
            </div>
          </div>
          <div class="bind-foot">
            <span class="note">Esc goes back and pauses, Enter starts and resumes; those two stay. Backspace clears a key.</span>
            <button class="link small" @click="resetKeys">Reset keys</button>
          </div>
        </section>
      </template>

      <!-- Display: full screen, how the board is drawn, the frame-rate meter -->
      <template v-else-if="ui.settingsTab === 'display'">
        <section>
          <h3>Screen</h3>
          <button v-if="canFullscreen()" class="row" role="switch" :aria-checked="fullscreenOn" @click="fullscreenOn = !fullscreenOn">
            <span><b>Full screen</b> while playing</span>
            <span class="state" :class="{ on: fullscreenOn }">{{ fullscreenOn ? 'on' : 'off' }}</span>
          </button>
        </section>
        <section>
          <h3>Board renderer</h3>
          <button class="row" role="radio" :aria-checked="renderer === 'svg'" @click="renderer = 'svg'">
            <span><b>SVG</b> the browser draws each thing (recommended)</span>
            <span class="state" :class="{ on: renderer === 'svg' }">{{ renderer === 'svg' ? 'on' : '' }}</span>
          </button>
          <button class="row" role="radio" :aria-checked="renderer === 'canvas'" @click="renderer = 'canvas'">
            <span><b>Canvas</b> experimental: one canvas, redrawn every frame{{ htmlInCanvas ? ', with HTML-in-Canvas' : '' }}</span>
            <span class="state" :class="{ on: renderer === 'canvas' }">{{ renderer === 'canvas' ? 'on' : '' }}</span>
          </button>
          <p class="note">Both draw at your screen's refresh rate. Compare them with the frame-rate meter below.</p>
        </section>
        <section>
          <h3>Frame rate</h3>
          <button class="row" role="switch" :aria-checked="showFps" @click="showFps = !showFps">
            <span><b>Show FPS</b> frames per second, in the corner</span>
            <span class="state" :class="{ on: showFps }">{{ showFps ? 'on' : 'off' }}</span>
          </button>
          <button class="row sub" :class="{ off: !showFps }" role="switch" :aria-checked="showLow" :disabled="!showFps" @click="showLow = !showLow">
            <span><b>1% low</b> the slowest frames: shows stutter</span>
            <span class="state" :class="{ on: showLow }">{{ showLow ? 'on' : 'off' }}</span>
          </button>
          <button class="row sub" :class="{ off: !showFps }" role="switch" :aria-checked="showGraph" :disabled="!showFps" @click="showGraph = !showGraph">
            <span><b>Graph</b> recent frame times</span>
            <span class="state" :class="{ on: showGraph }">{{ showGraph ? 'on' : 'off' }}</span>
          </button>
        </section>
      </template>

      <!-- Account: the whole account page, here -->
      <AccountPanel v-else-if="ui.settingsTab === 'account'" embedded />

      <!-- Cheats: for this run only -->
      <CheatsPanel v-else-if="ui.settingsTab === 'cheats'" />

      <!-- About, and the way to everything else in the ☰ menu -->
      <template v-else>
        <section>
          <h3>More</h3>
          <div class="links">
            <button class="link" @click="showHowToPlay">How to play</button>
            <button class="link" @click="go('#/scores')">High scores</button>
            <button class="link" @click="go('#/replays')">Replays</button>
            <button class="link" @click="ui.settingsTab = 'account'">Account</button>
            <button class="link" @click="openCustom">Custom games</button>
            <button class="link" @click="openAgent">AI agent</button>
          </div>
        </section>
        <section>
          <h3>About</h3>
      <p class="source">
        Laserwyrm is free software under the AGPL-3.0, with music by
        <a href="https://strudel.cc" target="_blank" rel="noopener">Strudel</a>.
        <a href="https://github.com/sheaksadi/laserwyrm" target="_blank" rel="noopener">Source code</a>
      </p>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  width: min(36rem, 100%);
  /* One height for every tab, so switching does not make the card jump. */
  height: min(40rem, 100%);
  padding: 1.4rem 1.6rem;
  background: var(--bg);
  border: 3px solid var(--sky);
  box-shadow: 0 0 0 3px var(--ink), 0 0 0 6px var(--lavender), 10px 10px 0 6px var(--ink);
}
header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.8rem; }
/* Tabs along the top; the tab's content scrolls below them. */
.tabs { display: flex; gap: 2px; margin-bottom: 1rem; border-bottom: 2px solid var(--border); overflow-x: auto; scrollbar-width: none; }
.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: -2px;
  flex: 1 0 auto;
  justify-content: center;
  padding: 7px 6px;
  border: 2px solid transparent;
  border-bottom-color: var(--border);
  border-radius: 8px 8px 0 0;
  background: none;
  font-family: var(--font-pixel);
  font-size: 8px;
  text-transform: uppercase;
  white-space: nowrap;
  color: var(--text-muted);
}
.tab:hover { color: var(--text); }
.tab.on { border-color: var(--border); border-bottom-color: var(--bg); color: var(--sky); }
.tab.cheat.on { color: var(--coral); }
.body { flex: 1; min-height: 0; overflow: auto; padding-right: 2px; }
.h3-note { letter-spacing: 0; text-transform: none; font-size: 14px; }
.links { display: grid; grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr)); gap: 6px; }
.link {
  padding: 8px 10px;
  border: 2px solid var(--border);
  border-radius: 8px;
  background: var(--bg-off);
  font-size: 17px;
  text-transform: uppercase;
  color: var(--text-dim);
}
.link:hover { border-color: var(--sky); color: var(--text); }
.link.small { padding: 4px 10px; font-size: 15px; }
/* Phone controls: two pictures to pick from. */
.pads { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.pad-pick {
  display: grid;
  gap: 6px;
  padding: 8px;
  border: 2px solid var(--border);
  border-radius: 10px;
  background: var(--bg-off);
  font-size: 15px;
  line-height: 1.15;
  text-align: left;
  color: var(--text-dim);
}
.pad-pick:hover { border-color: var(--sky); }
.pad-pick.on { border-color: var(--sage); box-shadow: 0 0 0 2px rgba(92, 255, 92, 0.2); }
.pad-pick b { font-weight: 400; color: var(--text); text-transform: uppercase; margin-right: 4px; }
.pad-pick svg { width: 100%; height: auto; }
.phone { fill: #12121f; stroke: var(--text-muted); stroke-width: 2; }
.screen-area { fill: #05050c; stroke: var(--sky); stroke-width: 1; }
.action-half { fill: rgba(255, 95, 176, 0.08); }
.stick-half { fill: rgba(0, 240, 200, 0.07); }
.tap { fill: none; stroke: var(--rose); stroke-width: 2; stroke-dasharray: 3 2; }
.dpad-shape { fill: rgba(232, 232, 255, 0.25); stroke: var(--text-dim); stroke-width: 1; }
.dpad-hot { fill: var(--mint); }
.stick-ring { fill: rgba(232, 232, 255, 0.08); stroke: var(--text-dim); stroke-width: 1.5; }
.stick-knob { fill: var(--mint); }
.tag { font-family: var(--font-pixel); font-size: 6px; text-anchor: middle; fill: var(--text-muted); text-transform: uppercase; }
/* The keyboard: each action with two keys to set. */
.binds { display: grid; gap: 4px; }
.bind { display: grid; grid-template-columns: 1fr 5.5rem 5.5rem; align-items: center; gap: 6px; }
.bind-name { font-size: 16px; color: var(--text-dim); }
.key {
  height: 28px;
  border: 2px solid var(--border);
  border-radius: 6px;
  background: var(--bg-warm);
  font-family: var(--font-pixel);
  font-size: 9px;
  color: var(--text);
}
.key:hover { border-color: var(--sky); }
.key.empty { color: var(--text-muted); }
.key.waiting { border-color: var(--sun); color: var(--sun); animation: wait 0.8s ease-in-out infinite alternate; }
@keyframes wait { from { opacity: 0.55; } to { opacity: 1; } }
.bind-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 8px; }
.bind-foot .note { margin: 0; }
.source { margin: 1.2rem 0 0; font-size: 15px; line-height: 1.4; color: var(--text-muted); }
.source a { color: var(--sky); }
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
section { margin-bottom: 1.1rem; }
h3 {
  margin: 0 0 0.5rem;
  font-size: 16px;
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-muted);
}
.row + .row { margin-top: 6px; }
.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 8px 10px;
  border: 2px solid var(--border);
  background: var(--bg-off);
  font-size: 17px;
  text-align: left;
  color: var(--text-dim);
}
.row:hover { border-color: var(--sky); }
/* The FPS meter's extras sit under it, stepped in. */
.row.sub { width: calc(100% - 22px); margin-left: 22px; }
.row.off { opacity: 0.5; }
.row:disabled:hover { border-color: var(--border); }
.row b, .slider-row b { font-weight: 400; color: var(--text); margin-right: 6px; text-transform: uppercase; }
.state {
  flex: none;
  font-family: var(--font-pixel);
  font-size: 9px;
  text-transform: uppercase;
  color: var(--text-muted);
}
.state.on { color: var(--sage); }
.slider-row {
  display: grid;
  grid-template-columns: 44px 5.5rem 1fr 3.5rem;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  padding: 6px 10px;
  border: 2px solid var(--border);
  background: var(--bg-off);
  font-size: 17px;
}
.slider-row.off { opacity: 0.5; }
.slider-row input { width: 100%; accent-color: var(--sky); }
.mini {
  display: grid;
  place-items: center;
  height: 24px;
  border: 2px solid var(--border);
  background: var(--bg);
}
.mini:hover { border-color: var(--sky); }
.pct { text-align: right; font-variant-numeric: tabular-nums; color: var(--text-dim); }
.note { margin: 6px 0 0; font-size: 16px; color: var(--text-muted); }
.close:focus-visible, .row:focus-visible, .mini:focus-visible, .tab:focus-visible, .link:focus-visible, .key:focus-visible, .pad-pick:focus-visible { outline: 3px solid var(--sun); outline-offset: 2px; }
</style>
