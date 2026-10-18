<script setup lang="ts">
/**
 * The workshop: the custom game's editor, a floating card that never
 * scrolls. Tab buttons float off its left side (the views: game rules,
 * global, levels, music; undo, redo, play, close). Inside the card each
 * view lays itself out: a strip across the top, the main thing in the
 * middle (the board, a chart, the music code), what adjusts it along the
 * bottom (sliders, the music's blocks and waves). Its own buttons (the
 * level's tabs, the drawing tools) float off the card's right side. Undo
 * and redo cover every change (Ctrl+Z, Ctrl+Shift+Z).
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { play, reset, state } from '../game'
import { custom, design, history, redo, setCustom, shared, STOCK_GLOBAL, STOCK_RULES, stopShared, undo } from '../design'
import GlobalPanel from './GlobalPanel.vue'
import MusicPanel from './MusicPanel.vue'
import LevelsPanel from './LevelsPanel.vue'
import RulesPanel from './RulesPanel.vue'

export type WorkshopTab = 'cheats' | 'global' | 'levels' | 'music'
const props = defineProps<{ start?: WorkshopTab }>()
const emit = defineEmits<{ close: [] }>()

const VIEWS: { id: WorkshopTab; name: string; icon: string }[] = [
  { id: 'cheats', name: 'Rules', icon: 'M4 4h16v4H4zM4 10h10v4H4zM4 16h13v4H4z' },
  { id: 'global', name: 'Global', icon: 'M3 20V14M8 20V9M13 20V12M18 20V5' },
  { id: 'levels', name: 'Levels', icon: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z' },
  { id: 'music', name: 'Music', icon: 'M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z' },
]
const view = ref<WorkshopTab>(props.start ?? 'levels')
const changed = computed<Record<WorkshopTab, boolean>>(() => ({
  cheats: JSON.stringify(design.rules) !== JSON.stringify(STOCK_RULES),
  global: JSON.stringify(design.global) !== JSON.stringify(STOCK_GLOBAL) || design.levels.some((l) => l.difficulty !== undefined),
  levels: design.levels.some((l) => Object.keys(l).some((k) => k !== 'difficulty')) || design.custom.length > 0,
  music: !!design.music || !!design.background || design.levels.some((l) => l.music || l.background),
}))

/* ─── Undo: Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y); text boxes keep their own ─── */
function onKey(event: KeyboardEvent) {
  // Esc in a text box leaves the box; a second Esc closes the workshop.
  const typing = document.activeElement?.matches('input:not([type=range]), textarea')
  if (event.key === 'Escape' && typing) {
    ;(document.activeElement as HTMLElement).blur()
    event.preventDefault()
    event.stopImmediatePropagation()
    return
  }
  if (!(event.ctrlKey || event.metaKey) || document.activeElement?.matches('input:not([type=range]), textarea')) return
  const key = event.key.toLowerCase()
  if (key === 'z' && !event.shiftKey) undo()
  else if ((key === 'z' && event.shiftKey) || key === 'y') redo()
  else return
  event.preventDefault()
  event.stopImmediatePropagation()
}
onMounted(() => window.addEventListener('keydown', onKey, { capture: true }))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, { capture: true }))

/** Play the game being edited: on from the pause if it is already in play, else a fresh run of it. */
function start() {
  if (!custom.on || shared.slug) {
    stopShared()
    setCustom(true)
    reset()
  } else if (state.status === 'over') reset()
  emit('close')
  play()
}
</script>

<template>
  <div class="ws-wrap" role="dialog" aria-label="Workshop">
    <!-- Off the card's left side: the views, and what works in all of them -->
    <nav class="ws-nav" role="tablist" aria-label="Workshop views">
      <button
        v-for="v in VIEWS"
        :key="v.id"
        class="view"
        role="tab"
        :aria-selected="view === v.id"
        :class="{ on: view === v.id }"
        @click="view = v.id"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path :d="v.icon" /></svg>
        <span>{{ v.name }}</span>
        <i v-if="changed[v.id]" class="dot" title="Changed"></i>
      </button>
      <span class="gap"></span>
      <button class="view" :disabled="!history.canUndo" title="Undo (Ctrl+Z)" @click="undo"><span class="glyph">↶</span><span>Undo</span></button>
      <button class="view" :disabled="!history.canRedo" title="Redo (Ctrl+Shift+Z)" @click="redo"><span class="glyph">↷</span><span>Redo</span></button>
      <span class="gap"></span>
      <button class="view play" @click="start"><span class="glyph">▶</span><span>{{ state.status === 'paused' ? 'Resume' : 'Play' }}</span></button>
    </nav>

    <!-- The card: a strip on top, the view's main thing, sliders below -->
    <!-- Off the card's top right corner -->
    <button class="close" aria-label="Close" @click="emit('close')">✕</button>
    <div class="workshop">
      <div id="ws-top" class="ws-top"></div>
      <main class="ws-main">
        <RulesPanel v-if="view === 'cheats'" />
        <GlobalPanel v-else-if="view === 'global'" />
        <LevelsPanel v-else-if="view === 'levels'" @close="emit('close')" />
        <MusicPanel v-else />
      </main>
      <div id="ws-bottom" class="ws-bottom"></div>
    </div>

    <!-- Off the card's right side: the view's own buttons -->
    <aside id="ws-side" class="ws-side"></aside>
  </div>
</template>

<style scoped>
/* The card, with room either side for the floating buttons. */
.ws-wrap {
  --rail: 92px;
  position: relative;
  width: min(60rem, calc(100vw - 2 * (var(--rail) + 28px)));
  /* Clear of the HUD above (the overlay's padding) and a margin below. */
  height: min(48rem, calc(100vh - 120px));
}
.workshop {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  padding: 1rem 1.2rem;
  border: 3px solid var(--sage);
  background: var(--bg);
  box-shadow: 0 0 0 3px var(--ink), 0 0 0 6px var(--coral), 10px 10px 0 6px var(--ink);
}
.ws-top { flex: none; min-width: 0; }
.ws-main { flex: 1 1 0; display: flex; flex-direction: column; min-height: 0; min-width: 0; }
/* As tall as its sliders need, up to a share of the card; past that it scrolls on its own. */
.ws-bottom { flex: 0 1 auto; min-width: 0; min-height: 0; max-height: 42%; overflow: auto; }
.ws-bottom:empty { display: none; }
/* Rectangular tabs floating off the card's sides. */
.ws-nav,
.ws-side {
  position: absolute;
  top: 12px;
  bottom: 12px;
  width: var(--rail);
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow: auto;
}
.ws-nav { right: calc(100% + 12px); }
/* The side's buttons start under the ✕. */
.ws-side { left: calc(100% + 12px); top: 64px; }
.gap { height: 10px; flex: none; }
.view {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 8px;
  border: 3px solid var(--ink);
  background: var(--bg);
  box-shadow: 0 0 0 2px var(--border), 4px 4px 0 2px var(--ink);
  font-size: 14px;
  text-transform: uppercase;
  color: var(--text-dim);
  text-align: left;
}
.view:hover:not(:disabled) { color: var(--text); box-shadow: 0 0 0 2px var(--sage), 4px 4px 0 2px var(--ink); }
.view:disabled { opacity: 0.4; cursor: default; }
.view.on { background: var(--sage); color: var(--ink); box-shadow: 0 0 0 2px var(--sage), 4px 4px 0 2px var(--ink); }
.view.play { background: var(--coral); color: var(--text); text-shadow: 2px 2px 0 var(--ink); }
.glyph { width: 16px; font-size: 16px; line-height: 1; text-align: center; }
.dot { position: absolute; top: 4px; right: 4px; width: 6px; height: 6px; border-radius: 50%; background: var(--sun); }
.close {
  position: absolute;
  top: 12px;
  left: calc(100% + 12px);
  width: 40px;
  height: 36px;
  border: 3px solid var(--ink);
  background: var(--bg);
  box-shadow: 0 0 0 2px var(--border), 4px 4px 0 2px var(--ink);
  font-size: 16px;
  color: var(--text-dim);
}
.close:hover { color: var(--text); box-shadow: 0 0 0 2px var(--coral), 4px 4px 0 2px var(--ink); }
.view:focus-visible, .close:focus-visible { outline: 3px solid var(--sun); outline-offset: 2px; }

/* Phones and short screens: narrower tabs, a tighter card. */
@media (max-height: 560px), (max-width: 760px) {
  /* Phones: the full height (the overlay's usual shrink is undone for the workshop). */
  .ws-wrap { --rail: 64px; width: calc(100vw - 2 * (var(--rail) + 60px)); height: calc(100vh - 16px); zoom: 1 !important; }
  .workshop { padding: 0.5rem 0.6rem; gap: 6px; border-width: 2px; box-shadow: 0 0 0 2px var(--ink), 0 0 0 4px var(--coral); }
  .ws-nav, .ws-side { top: 4px; bottom: 4px; gap: 4px; }
  .ws-nav { right: calc(100% + 8px); }
  .ws-side { left: calc(100% + 8px); }
  .view { padding: 4px 5px; gap: 4px; font-size: 10px; border-width: 2px; box-shadow: 0 0 0 1px var(--border), 2px 2px 0 1px var(--ink); }
  .view svg { width: 12px; height: 12px; }
  .glyph { width: 12px; font-size: 12px; }
  .close { top: 4px; left: calc(100% + 8px); width: 30px; height: 28px; border-width: 2px; box-shadow: 0 0 0 1px var(--border), 2px 2px 0 1px var(--ink); }
  .ws-side { top: 44px; }
  /* The strips a size down, so the middle keeps its room. */
  .ws-top { zoom: 0.75; }
  .ws-bottom { max-height: 38%; zoom: 0.7; }
}
</style>
