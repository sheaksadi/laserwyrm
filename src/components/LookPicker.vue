<script setup lang="ts">
/**
 * Your snake's look: a preview, then colours, hats and trails to pick from.
 * Locked ones show what unlocks them and how close you are.
 */
import { computed } from 'vue'
import { COLORS, HATS, look, progress, shown, stats, TRAILS, unlocked, unlockText, type LookItem } from '../looks'
import Hat from './Hat.vue'

const minutes = computed(() => Math.floor(stats.value.seconds / 60))
const rows: { key: 'color' | 'hat' | 'trail'; title: string; items: LookItem[] }[] = [
  { key: 'color', title: 'Colour', items: COLORS },
  { key: 'hat', title: 'Hat', items: HATS },
  { key: 'trail', title: 'Trail', items: TRAILS },
]
function choose(key: 'color' | 'hat' | 'trail', item: LookItem) {
  if (unlocked(item)) look[key] = item.id
}
const colorOf = (item: LookItem) => (item as (typeof COLORS)[number]).value
const TRAIL_DOTS: Record<string, string[]> = {
  sparks: ['var(--sun)', 'var(--peach)'],
  hearts: ['var(--rose)'],
  stars: ['var(--sun)'],
  confetti: ['var(--coral)', 'var(--mint)', 'var(--sky)'],
  rainbow: ['#FF3355', '#FFE14D', '#5CFF5C', '#3FA9FF'],
}
</script>

<template>
  <div class="looks">
    <!-- The snake as it will look -->
    <svg class="preview" viewBox="-0.5 -1.6 9 3" aria-label="Your snake">
      <defs>
        <linearGradient id="preview-rainbow" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#FF3355" /><stop offset="0.25" stop-color="#FFE14D" /><stop offset="0.5" stop-color="#5CFF5C" /><stop offset="0.75" stop-color="#3FA9FF" /><stop offset="1" stop-color="#B26BFF" />
        </linearGradient>
      </defs>
      <template v-if="shown.trail !== 'none'">
        <circle v-for="(c, i) in TRAIL_DOTS[shown.trail]" :key="i" :cx="0.2 - i * 0.35" :cy="0.5 + (i % 2 ? -0.3 : 0.25)" r="0.12" :fill="c" :opacity="1 - i * 0.2" />
      </template>
      <polyline points="0.5,0.5 6.5,0.5" fill="none" stroke="var(--ink)" stroke-width="0.84" stroke-linecap="square" />
      <polyline points="0.5,0.5 6.5,0.5" fill="none" :stroke="shown.color.id === 'rainbow' ? 'url(#preview-rainbow)' : shown.color.value" stroke-width="0.7" stroke-linecap="square" />
      <rect x="6.56" y="0.06" width="0.88" height="0.88" :fill="shown.color.id === 'green' ? 'var(--mint)' : shown.color.id === 'rainbow' ? 'var(--sun)' : shown.color.value" stroke="var(--ink)" stroke-width="0.08" />
      <circle cx="7.14" cy="0.32" r="0.08" fill="var(--ink)" />
      <circle cx="7.14" cy="0.68" r="0.08" fill="var(--ink)" />
      <Hat :hat="shown.hat" transform="translate(7 0.5)" />
    </svg>
    <p class="stats">{{ stats.games }} games · {{ minutes }} min played · best {{ stats.best.toLocaleString() }}</p>

    <section v-for="row in rows" :key="row.key">
      <h4>{{ row.title }}</h4>
      <div class="items">
        <button
          v-for="item in row.items"
          :key="item.id"
          class="item"
          :class="{ on: look[row.key] === item.id, locked: !unlocked(item) }"
          :title="unlocked(item) ? item.name : `${item.name}: ${unlockText(item.unlock)}`"
          :aria-label="unlocked(item) ? item.name : `${item.name}, locked: ${unlockText(item.unlock)}`"
          @click="choose(row.key, item)"
        >
          <svg v-if="row.key === 'color'" viewBox="0 0 20 20" width="22" height="22" aria-hidden="true">
            <rect x="2" y="2" width="16" height="16" rx="3" :fill="item.id === 'rainbow' ? 'url(#preview-rainbow)' : colorOf(item)" stroke="var(--ink)" stroke-width="2" />
          </svg>
          <svg v-else-if="row.key === 'hat'" viewBox="-0.7 -1.25 1.4 1.4" width="26" height="26" aria-hidden="true">
            <rect x="-0.44" y="-0.44" width="0.88" height="0.5" fill="var(--mint)" stroke="var(--ink)" stroke-width="0.06" />
            <Hat :hat="item.id" />
            <path v-if="item.id === 'none'" d="M -0.4 -1 L 0.4 -0.3" stroke="var(--text-muted)" stroke-width="0.08" />
          </svg>
          <svg v-else viewBox="0 0 24 20" width="26" height="22" aria-hidden="true">
            <template v-if="item.id === 'none'"><path d="M4 16 L20 4" stroke="var(--text-muted)" stroke-width="2" /></template>
            <circle v-for="(c, i) in TRAIL_DOTS[item.id] ?? []" v-else :key="i" :cx="5 + i * 6" :cy="10 + (i % 2 ? -4 : 3)" r="3" :fill="c" />
          </svg>
          <span class="item-name">{{ item.name }}</span>
          <span v-if="!unlocked(item)" class="lock">
            <span class="need">{{ unlockText(item.unlock) }}</span>
            <span class="bar"><i :style="{ transform: `scaleX(${progress(item)})` }"></i></span>
          </span>
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.looks { display: grid; gap: 10px; }
.preview { width: 100%; height: 64px; border: 2px solid var(--border); border-radius: 12px; background: var(--bg-off); }
.stats { margin: 0; font-size: 15px; text-transform: uppercase; color: var(--text-muted); }
h4 { margin: 0 0 6px; font-size: 14px; font-weight: 400; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); }
.items { display: grid; grid-template-columns: repeat(auto-fill, minmax(5.4rem, 1fr)); gap: 6px; }
.item {
  position: relative;
  display: grid;
  justify-items: center;
  align-content: start;
  gap: 3px;
  padding: 6px 4px;
  border: 2px solid var(--border);
  border-radius: 10px;
  background: var(--bg-warm);
  color: var(--text-dim);
}
.item:hover:not(.locked) { border-color: var(--sage); }
.item.on { border-color: var(--sun); background: #2A2410; }
.item.locked { cursor: default; }
.item.locked svg, .item.locked .item-name { opacity: 0.35; }
.item-name { font-size: 13px; line-height: 1; text-transform: uppercase; text-align: center; }
.lock { display: grid; gap: 2px; width: 100%; }
.need { font-size: 11px; line-height: 1; text-transform: uppercase; text-align: center; color: var(--sun); }
.bar { height: 3px; margin: 0 4px; border-radius: 2px; background: var(--border); overflow: hidden; }
.bar i { display: block; height: 100%; background: var(--sun); transform-origin: left; }
.item:focus-visible { outline: 3px solid var(--sun); outline-offset: 2px; }
</style>
