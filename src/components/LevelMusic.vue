<script setup lang="ts">
/**
 * Music as Strudel code, for one level or the whole game, on two tracks:
 * the main music, and a background track that plays under it.
 *
 * A level opens on what it plays now: the game's music if the game has
 * some, else its stock track written out as code. The game's music opens on
 * the stock track of level 1; background tracks start silent. Edit it and it
 * is kept once it compiles; Stock forgets it.
 *
 * The code is coloured as you type, and while the preview plays the words
 * whose notes are sounding light up. Below: what plays over four bars, one
 * row per sound, with a playhead, and the sound itself as a wave.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { levelPlan } from '../game'
import { design } from '../design'
import { musicOutput } from '../audio'
import { compile, patternBlocks, preview, previewNow, soundingAt, stockMusic, type Block } from '../music'

const props = withDefaults(defineProps<{ level: number | 'game'; track?: 'main' | 'background' }>(), { track: 'main' })
const isGame = computed(() => props.level === 'game')
const levelNo = computed(() => (props.level === 'game' ? 0 : props.level))
const field = computed(() => (props.track === 'main' ? 'music' : 'background') as 'music' | 'background')

const SILENT = `// A background track: it plays under this music, all the time.
// For example, a low drone:
// note("<a1 f1 c2 g1>").s("sine").gain(0.25)
silence
`

/** Where the code lives: the level's edit, or the design itself for the game's music. */
const target = computed<{ music?: string; background?: string }>(() => (props.level === 'game' ? design : design.levels[props.level]!))
/** What plays when nothing is set here. */
const fallback = computed(() => {
  if (props.track === 'background') return isGame.value ? SILENT : (design.background ?? SILENT)
  return isGame.value ? stockMusic(0) : (design.music ?? stockMusic(levelNo.value))
})
const own = computed(() => target.value[field.value])
const bpm = computed(() => levelPlan(levelNo.value).bpm)

const draft = ref('')
const status = ref<'stock' | 'game' | 'yours' | 'checking' | 'error'>('stock')
const error = ref('')
const playing = ref(false)
const blocks = ref<Block[]>([])
/** Bars the block view shows, and the preview's playhead in them. */
const BARS = 4
const head = ref<number | null>(null)
let frame = 0
/** Stretches of the code sounding right now. */
const sounding = ref<[number, number][]>([])

const restingStatus = () => (own.value ? 'yours' : !isGame.value && design[field.value] ? 'game' : 'stock')

function load() {
  draft.value = own.value ?? fallback.value
  status.value = restingStatus()
  error.value = ''
  void drawBlocks(draft.value)
}
watch([() => props.level, () => props.track], () => {
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
  if (code.trim() === fallback.value.trim() || !code.trim()) {
    delete target.value[field.value]
    status.value = restingStatus()
    error.value = ''
    void drawBlocks(fallback.value)
    return
  }
  const result = await compile(code)
  if (code !== draft.value) return
  if (result instanceof Error) {
    status.value = 'error'
    error.value = result.message
    return
  }
  target.value[field.value] = code
  status.value = 'yours'
  error.value = ''
  void drawBlocks(code)
  if (playing.value) void startPreview()
}

function backToStock() {
  delete target.value[field.value]
  load()
  if (playing.value) void startPreview()
}

/* ─── Preview: playhead, lit-up code, and the wave ─── */

const scope = ref<HTMLCanvasElement | null>(null)
let analyser: AnalyserNode | null = null
let wave: Float32Array<ArrayBuffer> | null = null
function drawWave() {
  const canvas = scope.value
  if (!canvas) return
  if (!analyser) {
    const out = musicOutput()
    if (!out) return
    analyser = out.ctx.createAnalyser()
    analyser.fftSize = 1024
    out.bus.connect(analyser)
    wave = new Float32Array(analyser.fftSize)
  }
  const g = canvas.getContext('2d')!
  const w = (canvas.width = canvas.clientWidth * devicePixelRatio)
  const h = (canvas.height = canvas.clientHeight * devicePixelRatio)
  analyser.getFloatTimeDomainData(wave!)
  g.clearRect(0, 0, w, h)
  g.strokeStyle = '#00F0C8'
  g.lineWidth = 2 * devicePixelRatio
  g.beginPath()
  wave!.forEach((v, i) => {
    const x = (i / (wave!.length - 1)) * w
    const y = h / 2 - v * h * 1.6
    if (i) g.lineTo(x, y)
    else g.moveTo(x, y)
  })
  g.stroke()
}

function follow() {
  const now = previewNow()
  head.value = now === null ? null : now % BARS
  sounding.value = now === null ? [] : soundingAt(draft.value, now)
  drawWave()
  frame = requestAnimationFrame(follow)
}
async function startPreview() {
  const err = await preview(draft.value, bpm.value)
  playing.value = !err
  if (err) {
    status.value = 'error'
    error.value = err.message
    return
  }
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(follow)
}
function stopPreview() {
  if (playing.value) void preview(null)
  playing.value = false
  cancelAnimationFrame(frame)
  head.value = null
  sounding.value = []
}
onBeforeUnmount(stopPreview)

/* ─── The block view ─── */

async function drawBlocks(code: string) {
  const result = await patternBlocks(code, BARS)
  if (code === draft.value || code === fallback.value) blocks.value = result instanceof Error ? [] : result
}
const lanes = computed(() => [...new Set(blocks.value.map((b) => b.lane))])
const LANE_COLORS = ['#FF3355', '#3FA9FF', '#5CFF5C', '#FFE14D', '#B26BFF', '#00F0C8', '#FF9966', '#FF5FB0']
const laneColor = (lane: string) => LANE_COLORS[lanes.value.indexOf(lane) % LANE_COLORS.length]!
/** Higher notes sit higher within their row. */
const pitchRange = computed(() => {
  const pitches = blocks.value.flatMap((b) => (b.pitch === null ? [] : [b.pitch]))
  return pitches.length ? [Math.min(...pitches), Math.max(...pitches)] : [0, 0]
})
function blockY(b: Block, row: number) {
  const [lo, hi] = pitchRange.value
  if (b.pitch === null || hi === lo) return row + 0.15
  return row + 0.1 + (1 - (b.pitch - lo) / (hi - lo)) * 0.5
}

/* ─── Colouring the code, and lighting up what sounds ─── */

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const TOKENS = /(\/\/[^\n]*)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`[^`]*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)(?=\s*\()/g
/** The code as HTML: each character gets its token's colour, and sounding ones a light; runs alike share a span. */
const coloured = computed(() => {
  const code = draft.value
  const kind = new Array<string>(code.length).fill('')
  for (const m of code.matchAll(TOKENS)) {
    const k = m[1] ? 'c' : m[2] ? 's' : m[3] ? 'n' : 'f'
    for (let i = m.index!; i < m.index! + m[0].length; i++) kind[i] = k
  }
  const lit = new Uint8Array(code.length)
  for (const [a, b] of sounding.value) for (let i = Math.max(0, a); i < Math.min(code.length, b); i++) lit[i] = 1
  let out = ''
  let run = ''
  let runKey = ''
  const flush = () => {
    if (!run) return
    const [k, l] = runKey.split('|')
    const cls = [k ? `t-${k}` : '', l === '1' ? 'lit' : ''].filter(Boolean).join(' ')
    out += cls ? `<span class="${cls}">${escape(run)}</span>` : escape(run)
    run = ''
  }
  for (let i = 0; i < code.length; i++) {
    const key = `${kind[i]}|${lit[i]}`
    if (key !== runKey) {
      flush()
      runKey = key
    }
    run += code[i]
  }
  flush()
  // A space at the end keeps a last empty line in view.
  return out + ' '
})
const shadow = ref<HTMLElement | null>(null)
function syncScroll(event: Event) {
  const box = event.target as HTMLTextAreaElement
  if (shadow.value) {
    shadow.value.scrollTop = box.scrollTop
    shadow.value.scrollLeft = box.scrollLeft
  }
}

/** Tab indents instead of leaving the box; Esc leaves the box (a second Esc closes the editor). */
function onKey(event: KeyboardEvent) {
  const box = event.target as HTMLTextAreaElement
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    box.blur()
    return
  }
  if (event.key !== 'Tab') return
  event.preventDefault()
  const { selectionStart: a, selectionEnd: b } = box
  typed(draft.value.slice(0, a) + '  ' + draft.value.slice(b))
  requestAnimationFrame(() => box.setSelectionRange(a + 2, a + 2))
}

const STATUS = { stock: props.track === 'main' ? 'Stock' : 'None', game: "Game's", yours: 'Yours', checking: '…', error: 'Error' } as const
</script>

<template>
  <div class="music">
    <!-- The code: a coloured copy underneath, the real text box on top -->
    <div class="editor" :class="{ playing }">
      <pre ref="shadow" class="shade" aria-hidden="true" v-html="coloured"></pre>
      <textarea
        class="code"
        spellcheck="false"
        autocapitalize="off"
        autocomplete="off"
        :value="draft"
        :aria-label="`${isGame ? 'Game' : `Level ${levelNo + 1}`} ${track === 'main' ? 'music' : 'background track'} in Strudel`"
        @input="typed(($event.target as HTMLTextAreaElement).value)"
        @keydown="onKey"
        @scroll="syncScroll"
      ></textarea>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
  </div>

  <!-- Below: what plays over four bars, one row per sound, and the sound itself as a wave -->
  <Teleport defer to="#ws-bottom">
    <div class="below">
      <div class="blocks">
        <div class="labels">
          <span v-for="lane in lanes" :key="lane" :style="{ color: laneColor(lane) }">{{ lane }}</span>
        </div>
        <svg :viewBox="`0 0 ${BARS} ${Math.max(1, lanes.length)}`" preserveAspectRatio="none" class="roll" :style="{ height: `${Math.max(1, lanes.length) * 16}px` }">
          <line v-for="bar in BARS - 1" :key="`b${bar}`" :x1="bar" :x2="bar" y1="0" :y2="Math.max(1, lanes.length)" class="bar-line" />
          <rect
            v-for="(b, i) in blocks"
            :key="i"
            :x="b.begin" :y="blockY(b, lanes.indexOf(b.lane))"
            :width="Math.max(0.012, b.length - 0.006)" :height="b.pitch === null ? 0.7 : 0.3"
            :fill="laneColor(b.lane)"
            :opacity="head !== null && head >= b.begin && head < b.begin + b.length ? 1 : 0.55"
          />
          <line v-if="head !== null" :x1="head" :x2="head" y1="0" :y2="Math.max(1, lanes.length)" class="playhead" />
        </svg>
      </div>
      <canvas ref="scope" class="scope" aria-hidden="true"></canvas>
    </div>
  </Teleport>

  <!-- Off the card's right side: play it, and put it back -->
  <Teleport defer to="#ws-side">
    <span class="side-gap"></span>
    <button class="side preview" :class="{ on: playing }" :aria-pressed="playing" @click="playing ? stopPreview() : startPreview()">
      <span class="big">{{ playing ? '■' : '▶' }}</span>{{ playing ? 'Stop' : 'Play' }}
    </button>
    <span class="state" :class="status">{{ STATUS[status] }}<template v-if="!isGame"> · {{ bpm }} bpm</template></span>
    <button class="side" :disabled="!own" @click="backToStock">{{ isGame || !design[field] ? (track === 'main' ? 'Stock' : 'Clear') : "Game's" }}</button>
    <a class="side link" href="https://strudel.cc/learn/" target="_blank" rel="noopener">Strudel help</a>
  </Teleport>
</template>

<style scoped>
.music { flex: 1; display: flex; flex-direction: column; gap: 8px; min-height: 0; }
.head { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.status { font-family: var(--font-pixel); font-size: 9px; text-transform: uppercase; color: var(--text-muted); }
.status.yours, .status.game { color: var(--sun); }
.status.error { color: var(--coral); }
.tempo { flex: 1; font-size: 15px; text-transform: uppercase; color: var(--text-muted); }
.editor { position: relative; flex: 1; min-height: 4rem; overflow: hidden; border: 2px solid var(--border); border-radius: 10px; background: var(--bg-off); }
.editor:focus-within { border-color: var(--mint); }
.shade,
.code {
  position: absolute;
  inset: 0;
  margin: 0;
  padding: 10px 12px;
  border: 0;
  font-family: ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre;
  tab-size: 2;
  overflow: auto;
}
.shade { color: #CFE8FF; pointer-events: none; }
.code { width: 100%; height: 100%; background: transparent; color: transparent; caret-color: var(--sun); resize: none; }
.code::selection { background: rgba(63, 169, 255, 0.35); }
.code:focus { outline: none; }
.shade :deep(.t-c) { color: #6A6A90; font-style: italic; }
.shade :deep(.t-s) { color: #5CFF5C; }
.shade :deep(.t-n) { color: #FF9966; }
.shade :deep(.t-f) { color: #3FA9FF; }
.error { margin: 0; padding: 6px 10px; border-radius: 8px; background: #2A0F16; font-size: 15px; color: var(--coral); white-space: pre-wrap; }
.below { display: grid; grid-template-columns: 1fr minmax(8rem, 22%); gap: 8px; }
.blocks { display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: stretch; padding: 8px; border-radius: 10px; background: var(--bg-off); }
.scope { width: 100%; height: 100%; min-height: 48px; border-radius: 10px; background: var(--bg-off); }
/* Buttons floating off the card's right side. */
.side {
  padding: 7px 8px;
  border: 3px solid var(--ink);
  background: var(--bg);
  box-shadow: 0 0 0 2px var(--border), 4px 4px 0 2px var(--ink);
  font-size: 14px;
  text-transform: uppercase;
  color: var(--text-dim);
  text-align: left;
  text-decoration: none;
}
.side:hover:not(:disabled) { color: var(--text); box-shadow: 0 0 0 2px var(--sage), 4px 4px 0 2px var(--ink); }
.side:disabled { opacity: 0.4; cursor: default; }
.side.on { background: var(--sun); color: var(--ink); }
/* The preview: big, and plainly a play button. */
.side.preview {
  display: grid;
  justify-items: center;
  gap: 2px;
  padding: 10px 4px;
  background: var(--sage);
  color: var(--ink);
  font-family: var(--font-pixel);
  font-size: 11px;
  text-align: center;
  box-shadow: 0 0 0 2px var(--sage), 4px 4px 0 2px var(--ink);
}
.side.preview .big { font-size: 22px; line-height: 1; }
.side.preview.on { background: var(--coral); color: var(--text); box-shadow: 0 0 0 2px var(--coral), 4px 4px 0 2px var(--ink); }
.state { font-size: 12px; text-transform: uppercase; text-align: center; color: var(--text-muted); }
.state.yours, .state.game { color: var(--sun); }
.state.error { color: var(--coral); }
.editor.playing { border-color: var(--sage); }
.shade :deep(.lit) { background: rgba(255, 225, 77, 0.35); border-radius: 2px; box-shadow: 0 0 0 1px rgba(255, 225, 77, 0.6); color: #FFFFFF; }
.side.link { font-size: 12px; color: var(--sky); }
.side-gap { height: 8px; flex: none; }
@media (max-height: 560px), (max-width: 760px) {
  .side { padding: 4px 5px; font-size: 10px; border-width: 2px; box-shadow: 0 0 0 1px var(--border), 2px 2px 0 1px var(--ink); }
  .side.link { font-size: 9px; }
  .shade, .code { font-size: 11px; padding: 6px 8px; }
  .labels { grid-auto-rows: 12px; font-size: 10px; line-height: 12px; }
}
.labels { display: grid; grid-auto-rows: 16px; font-size: 12px; text-transform: uppercase; line-height: 16px; }
.roll { display: block; width: 100%; }
.bar-line { stroke: var(--border); stroke-width: 0.01; }
.playhead { stroke: #FFFFFF; stroke-width: 0.015; }
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
