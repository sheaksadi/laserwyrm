<script setup lang="ts">
/**
 * The levels tab: every level of the game, 1 to 100 and any added after, in
 * a strip to slide through (arrows at the ends). Pick one to edit it: its
 * name, its walls on the board, then its pacing, feel, items and music in
 * the tabs below. A level only keeps what was changed; the rest follows the
 * global curve.
 */
import { ui } from '../app/ui'
import { computed, nextTick, ref, watch } from 'vue'
import { cheatLevel, laserTiers, play, reset, state, tierOf } from '../game'
import { design, MAX_LEVELS, setCustom, STOCK_LEVELS, stopShared } from '../design'
import LevelItems from './LevelItems.vue'
import LevelMusic from './LevelMusic.vue'
import LevelRules from './LevelRules.vue'
import WallEditor from './WallEditor.vue'

const emit = defineEmits<{ close: [] }>()

/** The level picked: kept in `ui.editor`, so the editor opens again on it (first time: the level in play). */
const selected = computed({
  get: () => Math.min(ui.editor.level ?? state.level, design.levels.length - 1),
  set: (v: number) => (ui.editor.level = v),
})
const edit = computed(() => design.levels[selected.value]!)
const edited = (i: number) => Object.keys(design.levels[i] ?? {}).length > 0
const tierColor = (i: number) => TIER_COLOR[laserTiers()[tierOf(i)]!.kind]
const TIER_COLOR = { red: 'var(--coral)', blue: 'var(--sky)', purple: 'var(--lavender)', white: '#FFFFFF', green: 'var(--sage)', gold: 'var(--sun)', prism: 'var(--rose)' } as const

/* ─── The strip ─── */

const strip = ref<HTMLElement | null>(null)
const atStart = ref(true)
const atEnd = ref(false)
function onScroll() {
  const el = strip.value
  if (!el) return
  atStart.value = el.scrollLeft <= 2
  atEnd.value = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2
}
function slide(by: -1 | 1) {
  const el = strip.value
  if (el) el.scrollBy({ left: by * el.clientWidth * 0.8, behavior: 'smooth' })
}
function pick(i: number) {
  selected.value = i
}
watch(
  selected,
  async () => {
    await nextTick()
    strip.value?.querySelector('.chip.on')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
    onScroll()
  },
  { immediate: true },
)

function addLevel() {
  if (design.levels.length >= MAX_LEVELS) return
  design.levels.push({ name: `Level ${design.levels.length + 1}` })
  selected.value = design.levels.length - 1
}
const confirm = ref<'' | 'reset' | 'remove'>('')
let confirmTimer = 0
function ask(what: 'reset' | 'remove', run: () => void) {
  if (confirm.value === what) {
    confirm.value = ''
    run()
    return
  }
  confirm.value = what
  clearTimeout(confirmTimer)
  confirmTimer = window.setTimeout(() => (confirm.value = ''), 2500)
}
function resetLevel() {
  design.levels[selected.value] = {}
}
function removeLevel() {
  design.levels.splice(selected.value, 1)
  selected.value = Math.min(selected.value, design.levels.length - 1)
}

/** Start a run of your custom game at this level. */
function playHere() {
  stopShared()
  setCustom(true)
  reset()
  if (selected.value) cheatLevel(selected.value)
  emit('close')
  play()
}

function setName(value: string) {
  if (value.trim()) edit.value.name = value.slice(0, 24)
  else delete edit.value.name
}

/* ─── The tabs under the board ─── */

type Tab = 'pacing' | 'feel' | 'items' | 'music' | 'background'
const TABS: { id: Tab; name: string }[] = [
  { id: 'pacing', name: 'Pacing' },
  { id: 'feel', name: 'Feel' },
  { id: 'items', name: 'Items' },
  { id: 'music', name: 'Music' },
  { id: 'background', name: 'Backing' },
]
/** The level's tab, kept with the rest of the editor's place. */
const tab = computed({ get: () => ui.editor.levelTab as Tab, set: (v: Tab) => (ui.editor.levelTab = v) })
/** The wall editor, whose tools float beside the card. */
const walls = ref<InstanceType<typeof WallEditor> | null>(null)
const tabChanged = (t: Tab) => {
  const e = edit.value
  if (t === 'pacing') return ['difficulty', 'bpm', 'lasers', 'armed', 'warn', 'bars', 'traits'].some((k) => k in e)
  if (t === 'feel') return ['edges', 'snipper', 'heal', 'intro', 'calm', 'score'].some((k) => k in e)
  if (t === 'items') return 'items' in e
  return t === 'music' ? 'music' in e : 'background' in e
}
</script>

<template>
  <!-- On top: every level, to slide through, and the one picked -->
  <Teleport defer to="#ws-top">
    <div class="levels">
    <!-- Every level, to slide through -->
      <div class="strip-row">
        <button class="arrow" :disabled="atStart" aria-label="Earlier levels" @click="slide(-1)">‹</button>
        <div ref="strip" class="strip" @scroll.passive="onScroll">
          <button
            v-for="(l, i) in design.levels"
            :key="i"
            class="chip"
            :class="{ on: i === selected, edited: edited(i), added: i >= STOCK_LEVELS, now: i === state.level }"
            :title="l.name ?? `Level ${i + 1}`"
            @click="pick(i)"
          >
            <i class="tier" :style="{ background: tierColor(i) }"></i>
            <span class="n">{{ i + 1 }}</span>
            <span v-if="l.name" class="name">{{ l.name }}</span>
          </button>
          <button class="chip add" :disabled="design.levels.length >= MAX_LEVELS" title="Add a level after the last" @click="addLevel">+</button>
        </div>
        <button class="arrow" :disabled="atEnd" aria-label="Later levels" @click="slide(1)">›</button>
      </div>

      <div class="level-head">
        <b class="level-n">Level {{ selected + 1 }}</b>
        <input
          class="name"
          maxlength="24"
          :value="edit.name ?? ''"
          :placeholder="laserTiers().find((t) => t.level === selected)?.name ?? 'Name this level'"
          aria-label="Level name"
          @input="setName(($event.target as HTMLInputElement).value)"
        />
        <div class="actions">
          <button class="tool" @click="playHere">Play from here</button>
          <button class="tool danger" :disabled="!edited(selected)" @click="ask('reset', resetLevel)">{{ confirm === 'reset' ? 'Sure?' : 'Reset' }}</button>
          <button v-if="selected >= STOCK_LEVELS" class="tool danger" @click="ask('remove', removeLevel)">{{ confirm === 'remove' ? 'Sure?' : 'Remove' }}</button>
        </div>
      </div>

    </div>
  </Teleport>

  <!-- In the middle: the board (or the level's music) -->
  <LevelMusic v-if="tab === 'music' || tab === 'background'" :level="selected" :track="tab === 'music' ? 'main' : 'background'" />
  <WallEditor v-else ref="walls" :level="selected" />

  <!-- Below: the picked tab's settings -->
  <Teleport v-if="tab !== 'music' && tab !== 'background'" defer to="#ws-bottom">
    <LevelRules v-if="tab === 'pacing' || tab === 'feel'" :level="selected" :section="tab" />
    <LevelItems v-else :level="selected" />
  </Teleport>

  <!-- Off the card's right side: the level's tabs, then the drawing tools -->
  <Teleport defer to="#ws-side">
    <button
      v-for="t in TABS"
      :key="t.id"
      class="side"
      role="tab"
      :aria-selected="tab === t.id"
      :class="{ on: tab === t.id }"
      @click="tab = t.id"
    >
      {{ t.name }}<i v-if="tabChanged(t.id)" class="dot"></i>
    </button>
    <template v-if="tab !== 'music' && tab !== 'background' && walls">
      <span class="side-gap"></span>
      <button
        v-for="tl in walls.TOOLS"
        :key="tl.id"
        class="side tool-pick"
        role="radio"
        :aria-checked="walls.tool === tl.id"
        :class="{ on: walls.tool === tl.id }"
        :title="tl.name"
        @click="walls.tool = tl.id"
      >{{ tl.name }}</button>
      <span class="side-gap"></span>
      <button class="side" :class="{ on: walls.mirrorX }" @click="walls.mirrorX = !walls.mirrorX">Mirror ⇆</button>
      <button class="side" :class="{ on: walls.mirrorY }" @click="walls.mirrorY = !walls.mirrorY">Mirror ⇅</button>
      <button class="side" :class="{ on: walls.hasBorder }" @click="walls.border()">Border</button>
      <button class="side" :class="{ on: walls.showTemplates }" @click="walls.showTemplates = !walls.showTemplates">Templates</button>
      <button class="side" :disabled="selected === 0" title="Copy the walls of the level before" @click="walls.copyPrevious()">Copy prev</button>
      <button class="side" @click="walls.clearWalls()">Clear</button>
      <button class="side" @click="walls.full = true">Full screen</button>
      <span class="count">{{ walls.count }} walls</span>
    </template>
  </Teleport>
</template>

<style scoped>
.levels { display: grid; gap: 8px; }
/* Buttons floating off the card's right side. */
.side {
  position: relative;
  padding: 7px 8px;
  border: 3px solid var(--ink);
  background: var(--bg);
  box-shadow: 0 0 0 2px var(--border), 4px 4px 0 2px var(--ink);
  font-size: 14px;
  text-transform: uppercase;
  color: var(--text-dim);
  text-align: left;
}
.side:hover:not(:disabled) { color: var(--text); box-shadow: 0 0 0 2px var(--sage), 4px 4px 0 2px var(--ink); }
.side:disabled { opacity: 0.4; cursor: default; }
.side.on { background: var(--sage); color: var(--ink); box-shadow: 0 0 0 2px var(--sage), 4px 4px 0 2px var(--ink); }
.side.tool-pick.on { background: var(--sun); box-shadow: 0 0 0 2px var(--sun), 4px 4px 0 2px var(--ink); }
.side .dot { position: absolute; top: 4px; right: 4px; }
.side-gap { height: 8px; flex: none; }
.count { font-size: 13px; text-transform: uppercase; color: var(--text-muted); text-align: center; }
@media (max-height: 560px), (max-width: 760px) {
  .side { padding: 4px 5px; font-size: 10px; border-width: 2px; box-shadow: 0 0 0 1px var(--border), 2px 2px 0 1px var(--ink); }
  .side-gap { height: 4px; }
  .levels { gap: 4px; }
  .chip { height: 28px; font-size: 12px; }
  .arrow { height: 30px; }
  .name { padding: 3px 8px; font-size: 14px; }
  .level-n { font-size: 10px; }
  .tool { padding: 3px 7px; font-size: 12px; }
}
.strip-row { display: grid; grid-template-columns: auto 1fr auto; gap: 6px; align-items: center; }
.arrow {
  width: 30px;
  height: 40px;
  border: 2px solid var(--border);
  border-radius: 8px;
  background: var(--bg-off);
  font-family: var(--font-pixel);
  font-size: 14px;
  color: var(--text-dim);
}
.arrow:hover:not(:disabled) { border-color: var(--sage); color: var(--text); }
.arrow:disabled { opacity: 0.3; cursor: default; }
.strip {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
  padding: 2px;
  mask-image: linear-gradient(90deg, transparent, #000 16px, #000 calc(100% - 16px), transparent);
}
.strip::-webkit-scrollbar { display: none; }
.chip {
  position: relative;
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 10px 0 8px;
  border: 2px solid var(--border);
  border-radius: 8px;
  background: var(--bg-off);
  font-size: 15px;
  text-transform: uppercase;
  color: var(--text-muted);
}
.chip .tier { width: 4px; height: 18px; border-radius: 2px; opacity: 0.8; }
.chip .n { font-family: var(--font-pixel); font-size: 9px; }
.chip .name { max-width: 9rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-dim); }
.chip.edited { color: var(--sun); }
.chip.edited::after { content: ''; position: absolute; top: 3px; right: 3px; width: 5px; height: 5px; border-radius: 50%; background: var(--sun); }
.chip.added { border-style: dashed; }
.chip.now .n { text-decoration: underline; }
.chip:hover { border-color: var(--sage); }
.chip.on { border-color: var(--mint); background: #0F2A28; color: var(--text); }
.chip.add { padding: 0 14px; color: var(--sage); border-style: dashed; font-family: var(--font-pixel); font-size: 12px; }
.level-head { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.level-n { font-family: var(--font-pixel); font-size: 12px; font-weight: 400; color: var(--mint); }
.name {
  flex: 1;
  min-width: 10rem;
  padding: 6px 10px;
  border: 2px solid var(--border);
  border-radius: 8px;
  background: var(--bg-warm);
  color: var(--text);
  font: inherit;
  font-size: 18px;
}
.name:focus { outline: none; border-color: var(--mint); }
.actions { display: flex; gap: 6px; }
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
.tool.danger:hover:not(:disabled) { border-color: var(--coral); color: var(--coral); }
.subtabs { display: flex; gap: 4px; margin-top: 4px; padding: 3px; border-radius: 10px; background: var(--bg-off); }
.subtab {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  padding: 7px 0;
  border: 0;
  border-radius: 8px;
  background: none;
  font-size: 16px;
  text-transform: uppercase;
  color: var(--text-muted);
}
.subtab:hover { color: var(--text); }
.subtab.on { background: var(--bg-warm); color: var(--sage); }
.dot { width: 6px; height: 6px; border-radius: 50%; background: var(--sun); }
.arrow:focus-visible, .chip:focus-visible, .tool:focus-visible, .subtab:focus-visible { outline: 3px solid var(--sun); outline-offset: 2px; }
</style>
