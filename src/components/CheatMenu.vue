<script setup lang="ts">
/**
 * The cheat menu, behind the C key. The game is paused while it is open.
 * Pick a level, flip god mode, hand yourself items, then play on.
 */
import { ref } from 'vue'
import { cheatGive, cheatLevel, cheats, cheatToggle, HEART_PATH, LASER_TIERS, MAX_LEVEL, play, POWER_KINDS, POWERS, reset, resetBest, state, TOTEM } from '../game'
import { pad } from '../gamepad'
import PadGlyph from './PadGlyph.vue'
import PowerIcon from './PowerIcon.vue'

const emit = defineEmits<{ close: [] }>()

const level = ref(state.level)
const bestCleared = ref(false)
function clearBest() {
  resetBest()
  bestCleared.value = true
}
const TIER_COLOR = { red: 'var(--coral)', blue: 'var(--sky)', purple: 'var(--lavender)', white: '#FFFFFF', green: 'var(--sage)', gold: 'var(--sun)', prism: 'linear-gradient(90deg, #FF3355, #FFE14D, #5CFF5C, #3FA9FF, #B26BFF)' } as const
function pickLevel(value: number) {
  level.value = value
  cheatLevel(value)
}

function start() {
  // A finished game starts over, at the level picked here.
  if (state.status === 'over') {
    reset()
    if (level.value) cheatLevel(level.value)
  }
  emit('close')
  play()
}
</script>

<template>
  <div class="cheats" role="dialog" aria-label="Cheats">
    <header>
      <h2>Cheats</h2>
      <span class="sub">runs with cheats never set a best</span>
    </header>

    <section>
      <h3>Level</h3>
      <div class="level-pick">
        <button class="step" aria-label="Level down" :disabled="state.level <= 0" @click="pickLevel(state.level - 1)">−</button>
        <input
          class="slider"
          type="range"
          min="1"
          :max="MAX_LEVEL"
          :value="state.level + 1"
          aria-label="Level"
          @input="pickLevel(Number(($event.target as HTMLInputElement).value) - 1)"
        />
        <button class="step" aria-label="Level up" :disabled="state.level >= MAX_LEVEL - 1" @click="pickLevel(state.level + 1)">+</button>
        <b class="level-now">{{ state.level + 1 }}</b>
      </div>
      <!-- Jump straight to where each new kind of laser arrives -->
      <div class="tiers">
        <button
          v-for="tier in LASER_TIERS"
          :key="tier.level"
          class="tier"
          :class="{ on: state.level >= tier.level }"
          :title="`${tier.name}: ${tier.blurb}`"
          @click="pickLevel(tier.level)"
        >
          <span class="swatch" :style="{ background: TIER_COLOR[tier.kind] }"></span>{{ tier.level + 1 }}
        </button>
      </div>
    </section>

    <section>
      <h3>Modes</h3>
      <button class="row" role="switch" :aria-checked="cheats.god" @click="cheatToggle('god')">
        <span><b>God mode</b> walls wrap around, nothing can hurt you</span>
        <span class="state" :class="{ on: cheats.god }">{{ cheats.god ? 'on' : 'off' }}</span>
      </button>
      <button class="row" role="switch" :aria-checked="cheats.noLasers" @click="cheatToggle('noLasers')">
        <span><b>No lasers</b> a quiet board, just snake</span>
        <span class="state" :class="{ on: cheats.noLasers }">{{ cheats.noLasers ? 'on' : 'off' }}</span>
      </button>
    </section>

    <section>
      <h3>Give</h3>
      <div class="gives">
        <button v-for="kind in POWER_KINDS" :key="kind" class="give" :title="POWERS[kind].blurb" @click="cheatGive(kind)">
          <svg viewBox="-0.5 -0.5 1 1" width="26" height="26"><PowerIcon :kind="kind" /></svg>
          <span>{{ POWERS[kind].name }}</span>
        </button>
        <button class="give" :title="TOTEM.blurb" :class="{ on: state.totem }" @click="cheatGive('totem')">
          <svg viewBox="-0.5 -0.5 1 1" width="26" height="26"><PowerIcon kind="totem" /></svg>
          <span>Totem</span>
        </button>
        <button class="give" @click="cheatGive('heart')"><svg viewBox="-0.5 -0.5 8 7" width="26" height="26"><path :d="HEART_PATH" fill="var(--coral)" stroke="var(--ink)" stroke-width="0.6" /></svg><span>Full hearts</span></button>
        <button class="give" @click="cheatGive('grow')"><span class="big">+10</span><span>Length</span></button>
      </div>
    </section>

    <section>
      <h3>Testing</h3>
      <button class="row" @click="clearBest">
        <span><b>Reset best score</b> on this device, to test new bests again</span>
        <span class="state" :class="{ on: bestCleared }">{{ bestCleared ? 'done' : state.best.toLocaleString() }}</span>
      </button>
    </section>

    <footer>
      <button class="play" @click="start()"><span class="text-trim">{{ state.status === 'paused' ? 'Resume' : 'Play' }}</span></button>
      <span v-if="pad.connected" class="hint"><PadGlyph button="b" /> close</span>
      <span v-else class="hint"><kbd>C</kbd> close</span>
    </footer>
  </div>
</template>

<style scoped>
.cheats {
  width: min(30rem, 100%);
  max-height: 100%;
  overflow: auto;
  padding: 1.4rem 1.6rem;
  background: var(--bg);
  border: 3px solid var(--sage);
  box-shadow: 0 0 0 3px var(--ink), 0 0 0 6px var(--coral), 10px 10px 0 6px var(--ink);
  animation: pop-in 0.25s steps(3) both;
}
header { display: grid; gap: 4px; margin-bottom: 1rem; }
h2 {
  margin: 0;
  font-family: var(--font-pixel);
  font-size: 1.1rem;
  font-weight: 400;
  text-transform: uppercase;
  color: var(--sage);
  text-shadow: 3px 3px 0 var(--ink);
}
.sub { font-size: 16px; text-transform: uppercase; color: var(--text-muted); }
section { margin-bottom: 1.1rem; }
h3 {
  margin: 0 0 0.5rem;
  font-size: 16px;
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-muted);
}
.level-pick {
  display: flex;
  align-items: center;
  gap: 8px;
}
.slider {
  flex: 1;
  min-width: 0;
  accent-color: var(--sage);
}
.step {
  width: 32px;
  height: 32px;
  border: 2px solid var(--border);
  background: var(--bg-off);
  font-family: var(--font-pixel);
  font-size: 12px;
  color: var(--text-dim);
}
.step:hover:not(:disabled) { border-color: var(--sage); color: var(--text); }
.step:disabled { opacity: 0.4; cursor: default; }
.level-now {
  min-width: 3ch;
  font-family: var(--font-pixel);
  font-size: 14px;
  font-weight: 400;
  text-align: right;
  color: var(--sage);
}
.tiers {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  margin-top: 8px;
}
.tier {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 0;
  border: 2px solid var(--border);
  background: var(--bg-off);
  font-family: var(--font-pixel);
  font-size: 10px;
  color: var(--text-muted);
}
.tier:hover { border-color: var(--sage); color: var(--text); }
.tier.on { color: var(--text); }
.swatch { width: 12px; height: 12px; border: 1px solid var(--ink); }
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
.row + .row { margin-top: 6px; }
.row b { font-weight: 400; color: var(--text); margin-right: 6px; text-transform: uppercase; }
.row:hover { border-color: var(--sage); }
.state {
  flex: none;
  font-family: var(--font-pixel);
  font-size: 9px;
  text-transform: uppercase;
  color: var(--text-muted);
}
.state.on { color: var(--sage); }
.gives {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(78px, 1fr));
  gap: 6px;
}
.give {
  display: grid;
  justify-items: center;
  align-content: center;
  gap: 4px;
  min-height: 62px;
  padding: 6px 4px;
  border: 2px solid var(--border);
  background: var(--bg-off);
  font-size: 14px;
  text-transform: uppercase;
  color: var(--text-dim);
}
.give:hover { border-color: var(--sage); color: var(--text); }
.give:active { transform: translate(2px, 2px); }
.give.on { border-color: var(--sun); }
.big { font-family: var(--font-pixel); font-size: 13px; line-height: 26px; color: var(--coral); }
footer { display: grid; gap: 10px; justify-items: center; }
.play {
  display: grid;
  place-items: center;
  width: 100%;
  padding: calc(0.7rem + 0.38em) 1.25rem;
  border: 3px solid var(--ink);
  background: var(--sage);
  color: var(--ink);
  box-shadow: inset -4px -4px 0 rgba(0, 0, 0, 0.25), inset 4px 4px 0 rgba(255, 255, 255, 0.3), 4px 4px 0 var(--ink);
  font-family: var(--font-pixel);
  font-size: 0.7rem;
  text-transform: uppercase;
}
.play:active { transform: translate(4px, 4px); box-shadow: inset -4px -4px 0 rgba(0, 0, 0, 0.25); }
.hint { display: flex; align-items: center; gap: 6px; font-size: 15px; text-transform: uppercase; color: var(--text-muted); }
.step:focus-visible, .tier:focus-visible, .row:focus-visible, .give:focus-visible {
  outline: 3px solid var(--sun);
  outline-offset: 2px;
}
</style>
