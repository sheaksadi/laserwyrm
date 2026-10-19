<script setup lang="ts">
/**
 * Cheats, in Settings: jump to any level, god mode, no lasers, hand out
 * power-ups, reset the best score. They are for this run only, and a run
 * that used any of them never counts.
 */
import { computed, ref } from 'vue'
import { cheatGive, cheatLevel, cheats, cheatToggle, HEART_PATH, laserTiers, MAX_LEVEL, POWER_KINDS, POWERS, resetBest, state, TOTEM, type CustomId } from '../game'
import { design } from '../design'
import PowerIcon from './PowerIcon.vue'

const customPowers = computed(() => design.custom.filter((c) => c.kind === 'power'))

const bestCleared = ref(false)
function clearBest() {
  resetBest()
  bestCleared.value = true
}
const TIER_COLOR = { red: 'var(--coral)', blue: 'var(--sky)', purple: 'var(--lavender)', white: '#FFFFFF', green: 'var(--sage)', gold: 'var(--sun)', prism: 'linear-gradient(90deg, #FF3355, #FFE14D, #5CFF5C, #3FA9FF, #B26BFF)' } as const
const pickLevel = (value: number) => cheatLevel(value)
</script>

<template>
  <div class="cheats-panel">
    <p class="warn-note">For this run only. A run that used any cheat never counts toward a best or the boards.</p>
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
        v-for="tier in laserTiers()"
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
      <button v-for="c in customPowers" :key="c.id" class="give" :title="c.blurb" @click="cheatGive(c.id as CustomId)">
        <svg viewBox="-0.5 -0.5 1 1" width="26" height="26"><PowerIcon :kind="c.id as CustomId" /></svg>
        <span>{{ c.name }}</span>
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
  </div>
</template>

<style scoped>
.warn-note { margin: 0 0 0.9rem; padding: 6px 10px; border: 2px dashed var(--coral); border-radius: 8px; font-size: 15px; color: var(--coral); }
section { margin-bottom: 1.1rem; }
h3 {
  margin: 0 0 0.5rem;
  font-size: 16px;
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-muted);
}
.level-pick { display: flex; align-items: center; gap: 8px; }
.slider { flex: 1; min-width: 0; accent-color: var(--sage); }
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
.level-now { min-width: 3ch; font-family: var(--font-pixel); font-size: 14px; font-weight: 400; text-align: right; color: var(--sage); }
.tiers { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 8px; }
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
.state { flex: none; font-family: var(--font-pixel); font-size: 9px; text-transform: uppercase; color: var(--text-muted); }
.state.on { color: var(--sage); }
.gives { display: grid; grid-template-columns: repeat(auto-fill, minmax(78px, 1fr)); gap: 6px; }
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
.step:focus-visible, .tier:focus-visible, .row:focus-visible, .give:focus-visible { outline: 3px solid var(--sun); outline-offset: 2px; }
@media (max-height: 520px) { h3 { font-size: 13px; } .row { padding: 5px 8px; font-size: 14px; } .give { min-height: 48px; font-size: 12px; } }
</style>
