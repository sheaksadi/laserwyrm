<script setup lang="ts">
/**
 * Settings: sound and music levels, controller rumble, full screen. Every
 * choice is saved in this browser and applies at once.
 */
import { muted, musicOn, musicVolume, previewSfx, sfxVolume } from '../audio'
import { canFullscreen, fullscreenOn } from '../fullscreen'
import { pad, rumbleFor, vibrationOn, vibrationStrength } from '../gamepad'
import { touchControls } from '../controls'
import { isTouch } from '../game'
import { showFps, showGraph, showLow } from '../perf'

const emit = defineEmits<{ close: [] }>()

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

    <section v-if="isTouch()">
      <h3>Phone controls</h3>
      <button class="row" role="radio" :aria-checked="touchControls === 'dpad'" @click="touchControls = 'dpad'">
        <span><b>D-pad</b> in the corner: tap, or hold and slide</span>
        <span class="state" :class="{ on: touchControls === 'dpad' }">{{ touchControls === 'dpad' ? 'on' : '' }}</span>
      </button>
      <button class="row" role="radio" :aria-checked="touchControls === 'stick'" @click="touchControls = 'stick'">
        <span><b>Stick</b> wherever your left thumb lands</span>
        <span class="state" :class="{ on: touchControls === 'stick' }">{{ touchControls === 'stick' ? 'on' : '' }}</span>
      </button>
    </section>

    <section>
      <h3>Screen</h3>
      <button v-if="canFullscreen()" class="row" role="switch" :aria-checked="fullscreenOn" @click="fullscreenOn = !fullscreenOn">
        <span><b>Full screen</b> while playing</span>
        <span class="state" :class="{ on: fullscreenOn }">{{ fullscreenOn ? 'on' : 'off' }}</span>
      </button>
      <button class="row" role="switch" :aria-checked="showFps" @click="showFps = !showFps">
        <span><b>Show FPS</b> frames per second, in the corner</span>
        <span class="state" :class="{ on: showFps }">{{ showFps ? 'on' : 'off' }}</span>
      </button>
      <!-- Extras for the meter: only with it on -->
      <button class="row sub" :class="{ off: !showFps }" role="switch" :aria-checked="showLow" :disabled="!showFps" @click="showLow = !showLow">
        <span><b>1% low</b> the slowest frames: shows stutter</span>
        <span class="state" :class="{ on: showLow }">{{ showLow ? 'on' : 'off' }}</span>
      </button>
      <button class="row sub" :class="{ off: !showFps }" role="switch" :aria-checked="showGraph" :disabled="!showFps" @click="showGraph = !showGraph">
        <span><b>Graph</b> recent frame times</span>
        <span class="state" :class="{ on: showGraph }">{{ showGraph ? 'on' : 'off' }}</span>
      </button>
    </section>

    <!-- The AGPL asks for the source to be offered to everyone who plays -->
    <p class="source">
      Laserwyrm is free software under the AGPL-3.0, with music by
      <a href="https://strudel.cc" target="_blank" rel="noopener">Strudel</a>.
      <a href="https://github.com/sheaksadi/laserwyrm" target="_blank" rel="noopener">Source code</a>
    </p>
  </div>
</template>

<style scoped>
.settings {
  width: min(30rem, 100%);
  max-height: 100%;
  overflow: auto;
  padding: 1.4rem 1.6rem;
  background: var(--bg);
  border: 3px solid var(--sky);
  box-shadow: 0 0 0 3px var(--ink), 0 0 0 6px var(--lavender), 10px 10px 0 6px var(--ink);
}
header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
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
.close:focus-visible, .row:focus-visible, .mini:focus-visible { outline: 3px solid var(--sun); outline-offset: 2px; }
</style>
