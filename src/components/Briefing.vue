<script setup lang="ts">
/**
 * The briefing, between Press start and the first move: what the game is on
 * the left, how to play it on the right (keyboard, controller or touch,
 * whichever is in use). Any key, click, tap or A starts, Esc or B goes back;
 * the warm-up music plays meanwhile. It shows before a device's first game
 * only (see `briefed` in app/ui.ts).
 */
import { touchControls } from '../controls'
import { computed } from 'vue'
import { HEART_PATH, isTouch, powerKinds, POWERS, type Mode } from '../game'
import { pad, padInUse } from '../gamepad'
import { bindings, keyFor, keyLabel } from '../keys'
import PadGlyph from './PadGlyph.vue'
import PowerIcon from './PowerIcon.vue'

const props = defineProps<{ mode: Mode }>()
const emit = defineEmits<{ start: []; back: [] }>()

const touch = computed(() => isTouch() && !padInUse.value)
</script>

<template>
  <div class="briefing" role="dialog" aria-label="How to play" @pointerdown.prevent="emit('start')">
    <!-- Not in the controller's highlight: A starts and B goes back, whatever is highlighted -->
    <button class="close" tabindex="-1" aria-label="Back" @pointerdown.stop @click.stop="emit('back')">✕</button>
    <header>
      <p class="mode" :class="props.mode">{{ props.mode === 'hardcore' ? 'Hardcore' : 'Normal' }}</p>
      <h2>How to play</h2>
    </header>

    <div class="cols">
      <ul class="what">
        <li><b class="mint">Eat fruit</b> to grow. Every beat scores, and the longer you are, the more.</li>
        <li><b class="coral">Lasers</b> show a warning stripe, then fire on the beat. They cut your body; through your head costs a heart.</li>
        <li>
          <svg class="inline-heart" viewBox="-0.5 -0.5 8 7" width="14" height="12" aria-hidden="true"><path :d="HEART_PATH" fill="var(--coral)" /></svg>
          <b class="rose">3 hearts.</b> Biting yourself ends the run.
          <template v-if="props.mode === 'hardcore'"> Walls kill. No hearts back.</template>
          <template v-else> Walls wrap around. Each level gives a heart back.</template>
        </li>
        <li>
          <b class="sun">Power-ups</b> go off as you eat them.
          <span class="powers">
            <svg v-for="k in powerKinds()" :key="k" viewBox="-0.5 -0.5 1 1" width="18" height="18" :aria-label="POWERS[k].name"><title>{{ POWERS[k].name }}: {{ POWERS[k].blurb }}</title><PowerIcon :kind="k" /></svg>
          </span>
        </li>
        <li><b class="sun">Dash</b> four cells ahead, over your own body, for energy. Fruit fills it, and it slowly comes back.</li>
        <li class="extra"><b class="lav">The snipper</b> hunts your middle. Bite it first.</li>
        <li class="extra"><b class="sky">Faster</b> every 8 bars; new kinds of laser at levels 5, 12 and 21.</li>
      </ul>

      <div class="how">
        <template v-if="padInUse">
          <p><span class="caps"><PadGlyph button="dpad" /><PadGlyph button="stick" /></span><span>move</span></p>
          <p><span class="caps"><PadGlyph button="a" /><PadGlyph button="rt" /></span><span>dash</span></p>
          <p><span class="caps"><PadGlyph button="start" /></span><span>pause</span></p>
          <p><span class="caps"><PadGlyph button="b" /></span><span>pause, back</span></p>
          <p><span class="caps"><PadGlyph button="back" /></span><span>custom</span></p>
        </template>
        <template v-else-if="touch">
          <p v-if="touchControls === 'dpad'"><span class="caps zone">d-pad</span><span>tap, or hold and slide, to steer</span></p>
          <p v-else><span class="caps zone">left half</span><span>touch and drag to steer</span></p>
          <p><span class="caps zone">right half</span><span>tap to dash</span></p>
          <p><span class="caps zone">❚❚</span><span>pause, top right</span></p>
        </template>
        <template v-else>
          <p>
            <!-- The keys as bound in Settings → Controls -->
            <span class="caps arrows"><kbd class="up">{{ keyLabel(bindings.up[0] ?? '') }}</kbd><kbd class="left">{{ keyLabel(bindings.left[0] ?? '') }}</kbd><kbd class="down">{{ keyLabel(bindings.down[0] ?? '') }}</kbd><kbd class="right">{{ keyLabel(bindings.right[0] ?? '') }}</kbd></span>
            <span>move<template v-if="bindings.up[1]"> <i>or {{ [bindings.up[1], bindings.left[1], bindings.down[1], bindings.right[1]].map((k) => keyLabel(k ?? '')).join('') }}</i></template></span>
          </p>
          <p><span class="caps"><kbd class="space">{{ keyFor('use').toLowerCase() }}</kbd></span><span>dash</span></p>
          <p><span class="caps"><kbd>{{ keyFor('pause') }}</kbd><kbd>Esc</kbd></span><span>pause</span></p>
          <p><span class="caps"><kbd>{{ keyFor('restart') }}</kbd></span><span>restart</span></p>
          <p><span class="caps"><kbd>{{ keyFor('music') }}</kbd><kbd>{{ keyFor('mute') }}</kbd></span><span>music, sound</span></p>
          <p><span class="caps"><kbd>{{ keyFor('cheats') }}</kbd><kbd>{{ keyFor('editor') }}</kbd></span><span>cheats, editor</span></p>
        </template>
      </div>
    </div>

    <p class="go">
      <template v-if="padInUse">
        <span class="hint">Press <PadGlyph button="a" class="big" /> to start</span>
        <span class="hint dim"><PadGlyph button="b" class="big" /> back</span>
      </template>
      <template v-else-if="touch">Tap anywhere to start</template>
      <template v-else>Press any key or click to start</template>
    </p>
  </div>
</template>

<style scoped>
.close {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 34px;
  height: 34px;
  border: 2px solid var(--border);
  border-radius: 8px;
  background: var(--bg-off);
  color: var(--text-dim);
}
.close:hover { border-color: var(--sage); color: var(--text); }
.briefing {
  position: relative;
  width: min(46rem, 100%);
  max-height: 100%;
  overflow: auto;
  padding: 1.4rem 1.8rem 1.2rem;
  background: var(--bg);
  border: 3px solid var(--rose);
  border-radius: 16px;
  box-shadow: 0 0 0 3px var(--ink), 0 0 0 6px var(--mint), 8px 8px 0 6px var(--ink);
  cursor: pointer;
}
header { display: flex; align-items: baseline; gap: 14px; margin-bottom: 1rem; }
h2 {
  margin: 0;
  font-family: var(--font-pixel);
  font-size: 1.1rem;
  font-weight: 400;
  text-transform: uppercase;
  color: var(--sun);
  text-shadow: 3px 3px 0 var(--rose);
}
.mode {
  margin: 0;
  padding: 1px 8px;
  font-size: 15px;
  text-transform: uppercase;
  background: var(--sage);
  color: var(--ink);
}
.mode.hardcore { background: var(--coral); }
.cols { display: grid; grid-template-columns: 1.35fr 1fr; gap: 1.6rem; }
.what { margin: 0; padding: 0; list-style: none; display: grid; gap: 0.55rem; }
.what li {
  position: relative;
  padding-left: 16px;
  font-size: 18px;
  line-height: 1.2;
  color: var(--text-dim);
}
.what li::before { content: ''; position: absolute; left: 0; top: 0.45em; width: 6px; height: 6px; background: var(--text-muted); }
.what b { font-weight: 400; }
.mint { color: var(--mint); }
.coral { color: var(--coral); }
.rose { color: var(--rose); }
.sun { color: var(--sun); }
.lav { color: var(--lavender); }
.sky { color: var(--sky); }
.inline-heart { vertical-align: -1px; margin-right: 2px; }
.powers { display: inline-flex; gap: 4px; margin-left: 4px; vertical-align: -4px; }
.how {
  display: grid;
  align-content: start;
  gap: 0.7rem;
  padding-left: 1.4rem;
  border-left: 2px dashed var(--border);
}
.how p { display: grid; grid-template-columns: 7.5rem 1fr; align-items: center; gap: 10px; margin: 0; font-size: 17px; text-transform: uppercase; color: var(--text-dim); }
.how i { font-style: normal; color: var(--text-muted); }
.caps { display: flex; align-items: center; gap: 4px; }
.caps.arrows {
  display: grid;
  grid-template-columns: repeat(3, auto);
  justify-content: start;
  gap: 3px;
}
.arrows .up { grid-area: 1 / 2; }
.arrows .left { grid-area: 2 / 1; }
.arrows .down { grid-area: 2 / 2; }
.arrows .right { grid-area: 2 / 3; }
kbd.space { min-width: 5em; }
.zone { padding: 2px 8px; border: 2px dashed var(--text-muted); color: var(--text); font-size: 15px; }
.go {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin: 1.3rem 0 0;
  font-family: var(--font-pixel);
  font-size: 11px;
  text-transform: uppercase;
  color: var(--text);
  animation: blink-text 1.1s steps(1) infinite;
}
.go:has(.hint) { gap: 28px; animation: none; }
.hint { display: inline-flex; align-items: center; gap: 8px; }
.hint:first-child .big { animation: press 1.1s ease-in-out infinite; }
@keyframes press { 50% { transform: scale(1.18); filter: brightness(1.4); } }
.hint.dim { color: var(--text-muted); }
.go .big { width: 30px; height: 30px; }
@media (max-height: 520px) {
  header { margin-bottom: 0.5rem; }
  .what { gap: 0.3rem; }
  .what .extra { display: none; }
  .how { gap: 0.4rem; }
  .go { margin-top: 0.7rem; }
}
@media (max-width: 640px), (max-height: 520px) {
  .cols { grid-template-columns: 1fr 1fr; gap: 1rem; }
  .briefing { padding: 1rem 1.2rem; }
  .what li { font-size: 15px; }
  .how p { font-size: 14px; grid-template-columns: 5.5rem 1fr; }
  .how { padding-left: 0.8rem; }
}
</style>
