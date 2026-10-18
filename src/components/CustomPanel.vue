<script setup lang="ts">
/**
 * Custom play, from the start screen. Normal play is always the stock game;
 * here you play your own design instead (made in the editor), or one other
 * players shared. Below: your shared designs and everyone else's, to browse,
 * play, like or copy, and a way to share yours.
 */
import { computed } from 'vue'
import { custom, design, isStock, shared } from '../design'
import ExplorePanel from './ExplorePanel.vue'

const emit = defineEmits<{ close: []; play: []; editor: []; cheats: []; normal: [] }>()

const changedLevels = computed(() => design.levels.filter((l) => Object.keys(l).length).length)
const stock = computed(() => isStock(design))
</script>

<template>
  <div class="custom" role="dialog" aria-label="Custom games">
    <header>
      <h2>Custom</h2>
      <button class="close" aria-label="Close" @click="emit('close')">✕</button>
    </header>

    <!-- Your own game -->
    <section class="mine">
      <div class="mine-text">
        <b>Your game</b>
        <span v-if="stock">Still the stock game. Open the editor to change levels, walls, items and music.</span>
        <span v-else>{{ changedLevels }} level{{ changedLevels === 1 ? '' : 's' }} changed · {{ design.custom.length }} item{{ design.custom.length === 1 ? '' : 's' }} of your own</span>
        <span v-if="custom.on" class="now">
          Now playing: {{ shared.slug ? `${shared.name} by ${shared.author}` : 'your game' }}
        </span>
      </div>
      <div class="mine-buttons">
        <button class="act go" @click="emit('play')">Play custom</button>
        <button class="act" @click="emit('editor')">Editor</button>
        <button class="act" title="God mode, any level, items" @click="emit('cheats')">Cheats</button>
        <button v-if="custom.on" class="act" @click="emit('normal')">Play normal</button>
      </div>
    </section>

    <!-- Everyone's: yours under "Mine", the rest to browse -->
    <ExplorePanel @close="emit('close')" />
  </div>
</template>

<style scoped>
.custom {
  display: grid;
  gap: 14px;
  width: min(52rem, 100%);
  max-height: 100%;
  overflow: auto;
  padding: 1.25rem 1.6rem 1.4rem;
  background: var(--bg);
  border: 3px solid var(--rose);
  border-radius: 16px;
  box-shadow: 0 0 0 3px var(--ink), 0 0 0 6px var(--mint), 8px 8px 0 6px var(--ink);
}
header { display: flex; justify-content: space-between; align-items: center; }
h2 {
  margin: 0;
  font-family: var(--font-pixel);
  font-size: 1.1rem;
  font-weight: 400;
  text-transform: uppercase;
  color: var(--mint);
  text-shadow: 3px 3px 0 var(--rose);
}
.close {
  width: 34px;
  height: 34px;
  border: 2px solid var(--border);
  border-radius: 8px;
  background: var(--bg-off);
  color: var(--text-dim);
}
.close:hover { border-color: var(--sage); color: var(--text); }
.mine {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  align-items: center;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--bg-warm);
}
.mine-text { display: grid; gap: 4px; font-size: 16px; color: var(--text-muted); }
.mine-text b { font-weight: 400; font-size: 18px; text-transform: uppercase; color: var(--text); }
.now { text-transform: uppercase; color: var(--mint); }
.mine-buttons { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
.act {
  padding: 12px 16px;
  border: 3px solid var(--ink);
  border-radius: 12px;
  background: var(--bg-off);
  box-shadow: 0 0 0 2px var(--border);
  font-family: var(--font-pixel);
  font-size: 10px;
  text-transform: uppercase;
  color: var(--text-dim);
}
.act:hover { color: var(--text); box-shadow: 0 0 0 2px var(--sage); }
.act.go { background: var(--sage); color: var(--ink); box-shadow: 4px 4px 0 var(--ink); }
.act.go:hover { background: #7CFF7C; }
.act:active { transform: translate(2px, 2px); }
@media (max-width: 640px) {
  .mine { grid-template-columns: 1fr; }
  .mine-buttons { justify-content: stretch; }
}
.act:focus-visible, .close:focus-visible { outline: 3px solid var(--sun); outline-offset: 2px; }
</style>
