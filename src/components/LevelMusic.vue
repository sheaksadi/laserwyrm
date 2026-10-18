<script setup lang="ts">
/**
 * A level's music, as Strudel code. It opens on the stock track written out
 * as code; edit it (or write your own) and the level plays yours. Changes
 * are checked as you type and kept once they compile. Preview plays it here
 * at the level's tempo; one cycle is one bar.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { levelPlan } from '../game'
import { design } from '../design'
import { compile, preview, stockMusic } from '../music'

const props = defineProps<{ level: number }>()
const edit = computed(() => design.levels[props.level]!)
const stock = computed(() => stockMusic(props.level))
const bpm = computed(() => levelPlan(props.level).bpm)

const draft = ref('')
const status = ref<'stock' | 'yours' | 'checking' | 'error'>('stock')
const error = ref('')
const playing = ref(false)

function load() {
  draft.value = edit.value.music ?? stock.value
  status.value = edit.value.music ? 'yours' : 'stock'
  error.value = ''
}
watch(() => props.level, () => {
  stopPreview()
  load()
}, { immediate: true })

let timer = 0
function typed(value: string) {
  draft.value = value
  status.value = 'checking'
  clearTimeout(timer)
  timer = window.setTimeout(check, 500)
}
async function check() {
  const code = draft.value
  if (code.trim() === stock.value.trim() || !code.trim()) {
    delete edit.value.music
    status.value = 'stock'
    error.value = ''
    return
  }
  const result = await compile(code)
  if (code !== draft.value) return
  if (result instanceof Error) {
    status.value = 'error'
    error.value = result.message
    return
  }
  edit.value.music = code
  status.value = 'yours'
  error.value = ''
  if (playing.value) void startPreview()
}

function backToStock() {
  delete edit.value.music
  load()
  if (playing.value) void startPreview()
}

async function startPreview() {
  const err = await preview(draft.value, bpm.value)
  playing.value = !err
  if (err) {
    status.value = 'error'
    error.value = err.message
  }
}
function stopPreview() {
  if (playing.value) void preview(null)
  playing.value = false
}
onBeforeUnmount(stopPreview)

/** Tab indents instead of leaving the box. */
function onKey(event: KeyboardEvent) {
  if (event.key !== 'Tab') return
  event.preventDefault()
  const box = event.target as HTMLTextAreaElement
  const { selectionStart: a, selectionEnd: b } = box
  typed(draft.value.slice(0, a) + '  ' + draft.value.slice(b))
  requestAnimationFrame(() => box.setSelectionRange(a + 2, a + 2))
}

const STATUS = { stock: 'Stock track', yours: 'Your music', checking: 'Checking…', error: 'Does not play' } as const
</script>

<template>
  <div class="music">
    <div class="head">
      <span class="status" :class="status">{{ STATUS[status] }}</span>
      <span class="tempo">{{ bpm }} bpm · one cycle = one bar</span>
      <button class="tool" :class="{ on: playing }" @click="playing ? stopPreview() : startPreview()">{{ playing ? '■ Stop' : '▶ Preview' }}</button>
      <button class="tool" :disabled="!edit.music" @click="backToStock">Back to stock</button>
    </div>
    <textarea
      class="code"
      spellcheck="false"
      autocapitalize="off"
      autocomplete="off"
      :value="draft"
      aria-label="Level music in Strudel"
      @input="typed(($event.target as HTMLTextAreaElement).value)"
      @keydown="onKey"
    ></textarea>
    <p v-if="error" class="error">{{ error }}</p>
    <p class="hint">
      Written in <a href="https://strudel.cc/learn/" target="_blank" rel="noopener">Strudel</a>. Synths: sine, square, triangle,
      sawtooth, supersaw, pulse; drum: sbd; noise: white, pink, brown. Tempo comes from the level (Pacing).
    </p>
  </div>
</template>

<style scoped>
.music { display: grid; gap: 8px; }
.head { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.status { font-family: var(--font-pixel); font-size: 9px; text-transform: uppercase; color: var(--text-muted); }
.status.yours { color: var(--sun); }
.status.error { color: var(--coral); }
.tempo { flex: 1; font-size: 15px; text-transform: uppercase; color: var(--text-muted); }
.code {
  min-height: 18rem;
  padding: 10px 12px;
  border: 2px solid var(--border);
  border-radius: 10px;
  background: var(--bg-off);
  color: #CFE8FF;
  font-family: ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre;
  tab-size: 2;
  resize: vertical;
}
.code:focus { outline: none; border-color: var(--mint); }
.error { margin: 0; padding: 6px 10px; border-radius: 8px; background: #2A0F16; font-size: 15px; color: var(--coral); white-space: pre-wrap; }
.hint { margin: 0; font-size: 14px; color: var(--text-muted); }
.hint a { color: var(--sky); }
.tool {
  padding: 5px 10px;
  border: 2px solid var(--border);
  border-radius: 8px;
  background: var(--bg-off);
  font-size: 15px;
  text-transform: uppercase;
  color: var(--text-dim);
}
.tool:hover:not(:disabled) { border-color: var(--sage); color: var(--text); }
.tool:disabled { opacity: 0.4; cursor: default; }
.tool.on { border-color: var(--sun); color: var(--sun); }
.tool:focus-visible { outline: 3px solid var(--sun); outline-offset: 2px; }
</style>
