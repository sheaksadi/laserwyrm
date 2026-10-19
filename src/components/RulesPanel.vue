<script setup lang="ts">
/**
 * The workshop's game rules view: your game's rules (saved with it: hearts,
 * refill, length, slots, starting level) and the game's code (copy it,
 * paste one in, or start over). The cheats are in Settings → Cheats.
 */
import { ref } from 'vue'
import { design, isStock, readShareCode, replaceDesign, RULES_RANGE, shareCode, STOCK_RULES, stockDesign, type GameRules } from '../design'
import { openSettings } from '../app/ui'
import AutoSlider from './AutoSlider.vue'

const RULES: { key: keyof GameRules; name: string; hint: string; show: (v: number) => string }[] = [
  { key: 'hearts', name: 'Hearts', hint: 'at the start', show: (v) => `${v}` },
  { key: 'maxHearts', name: 'Most hearts', hint: 'with heart drops', show: (v) => `${v}` },
  { key: 'refill', name: 'Refill', hint: 'hearts back each level', show: (v) => `+${v}` },
  { key: 'length', name: 'Length', hint: 'the snake starts with', show: (v) => `${v} cells` },
  { key: 'slots', name: 'Power-up slots', hint: 'held at once', show: (v) => `${v}` },
  { key: 'startLevel', name: 'Start on', hint: 'the first level of a run', show: (v) => `level ${v + 1}` },
]
function setRule(key: keyof GameRules, value: number | undefined) {
  design.rules[key] = value ?? STOCK_RULES[key]
  if (key === 'hearts' && design.rules.maxHearts < design.rules.hearts) design.rules.maxHearts = design.rules.hearts
  if (key === 'maxHearts' && design.rules.hearts > design.rules.maxHearts) design.rules.hearts = design.rules.maxHearts
}

/* ─── The game's code ─── */
const pasted = ref('')
const shareNote = ref('')
let noteTimer = 0
function note(text: string) {
  shareNote.value = text
  clearTimeout(noteTimer)
  noteTimer = window.setTimeout(() => (shareNote.value = ''), 3000)
}
async function copyCode() {
  const code = shareCode(design)
  try {
    await navigator.clipboard.writeText(code)
    note('Code copied')
  } catch {
    // No clipboard (an insecure page, or blocked): show it to copy by hand.
    pasted.value = code
    note('Copy the code from the box')
  }
}
function loadCode() {
  const next = readShareCode(pasted.value)
  if (!next) return note('That is not a Laserwyrm code')
  replaceDesign(next)
  pasted.value = ''
  const changed = next.levels.filter((l) => Object.keys(l).length).length
  note(isStock(next) ? 'Loaded: the stock game' : `Loaded: ${changed} level${changed === 1 ? '' : 's'} changed, ${next.custom.length} item${next.custom.length === 1 ? '' : 's'}`)
}
const confirmStock = ref(false)
function backToStock() {
  if (!confirmStock.value) {
    confirmStock.value = true
    setTimeout(() => (confirmStock.value = false), 2500)
    return
  }
  confirmStock.value = false
  replaceDesign(stockDesign())
  note('Everything back to the stock game')
}
</script>

<template>
  <Teleport defer to="#ws-top">
    <div class="title"><h2>Game rules</h2><span class="sub">your game's rules and its code</span></div>
  </Teleport>
  <div class="cols">
    <div class="card">
    <section>
      <h3>Your game's rules <span class="h3-note">(custom play)</span></h3>
      <div class="rules-grid">
        <AutoSlider
          v-for="r in RULES"
          :key="r.key"
          :name="r.name"
          :hint="r.hint"
          :value="design.rules[r.key]"
          :own="design.rules[r.key] !== STOCK_RULES[r.key]"
          :range="RULES_RANGE[r.key]"
          :show="r.show"
          @set="setRule(r.key, $event)"
        />
      </div>
    </section>

    </div>
    <!-- Cheats live in Settings now -->
    <div class="card moved">
      <h3 class="op">Cheats <span class="h3-note">moved to Settings</span></h3>
      <p class="moved-note">Any level, god mode, no lasers, power-ups on demand and resetting your best are in Settings → Cheats.</p>
      <button class="tool" @click="openSettings('cheats')">Open cheats</button>
    </div>
    <!-- Tuning and levels travel as one code: copy it out, paste one in -->
    <section class="card share">
      <h3>Share</h3>
      <div class="share-row">
        <button class="tool" @click="copyCode">Copy code</button>
        <input v-model="pasted" class="code" placeholder="Paste a code" aria-label="Share code" spellcheck="false" @keydown.enter="loadCode" />
        <button class="tool" :disabled="!pasted.trim()" @click="loadCode">Load</button>
      </div>
      <div class="share-row">
        <span class="share-note">{{ shareNote || 'One code holds your whole game: feel, levels and items.' }}</span>
        <button class="tool danger" @click="backToStock">{{ confirmStock ? 'Sure?' : 'All back to stock' }}</button>
      </div>
    </section>

  </div>
</template>

<style scoped>
/* Three columns that fill the middle; each scrolls on its own if the screen is short. */
.cols { flex: 1; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; min-height: 0; }
.card { min-height: 0; overflow: auto; padding: 12px; border: 2px solid var(--border); border-radius: 12px; background: var(--bg-warm); }
.title { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
@media (max-width: 900px) { .cols { grid-template-columns: 1fr 1fr; } .share { grid-column: 1 / -1; } }
@media (max-height: 520px) { .cols { gap: 8px; } .card { padding: 8px; } h3 { font-size: 13px; } }
header { position: relative; display: grid; gap: 4px; margin-bottom: 0.8rem; padding-right: 44px; }
.history { position: absolute; top: 0; right: 48px; display: flex; gap: 6px; }
.rules-grid { display: grid; gap: 6px; }
.h3-note { letter-spacing: 0; text-transform: none; font-size: 14px; }
.moved { display: grid; align-content: start; gap: 10px; }
.moved-note { margin: 0; font-size: 16px; color: var(--text-muted); }
h3.op { margin: 0; color: var(--coral); }
.close {
  position: absolute;
  top: 0;
  right: 0;
  width: 34px;
  height: 34px;
  border: 2px solid var(--border);
  border-radius: 8px;
  background: var(--bg-off);
  color: var(--text-dim);
}
.close:hover { border-color: var(--sage); color: var(--text); }
.close:focus-visible { outline: 3px solid var(--sun); outline-offset: 2px; }
/* Tuning and levels need the room. */
.cheats.wide { width: min(60rem, 100%); }
.tabs { display: flex; gap: 6px; margin-bottom: 1rem; border-bottom: 2px solid var(--border); }
.tab {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: -2px;
  padding: 6px 14px;
  border: 2px solid transparent;
  border-bottom-color: var(--border);
  border-radius: 8px 8px 0 0;
  background: none;
  font-family: var(--font-pixel);
  font-size: 10px;
  text-transform: uppercase;
  color: var(--text-muted);
}
.tab:hover { color: var(--text); }
.tab.on { border-color: var(--border); border-bottom-color: var(--bg); color: var(--sage); }
.dot { width: 6px; height: 6px; border-radius: 50%; background: var(--sun); }
.share { display: grid; align-content: start; gap: 8px; margin: 0; }
.share h3 { margin: 0; }
.share-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.code {
  flex: 1;
  min-width: 0;
  padding: 5px 10px;
  border: 2px solid var(--border);
  border-radius: 8px;
  background: var(--bg-warm);
  color: var(--text);
  font: inherit;
  font-size: 16px;
}
.code:focus { outline: none; border-color: var(--mint); }
.share-note { flex: 1; font-size: 15px; color: var(--text-muted); }
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
.tool.danger:hover { border-color: var(--coral); color: var(--coral); }
.play-row { display: grid; width: 100%; gap: 10px; }
.play-row.two { grid-template-columns: 2fr 1fr; }
.play.again { background: var(--bg-warm); color: var(--text-dim); }
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
footer { display: grid; gap: 10px; justify-items: center; margin-top: 1.1rem; }
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
</style>
