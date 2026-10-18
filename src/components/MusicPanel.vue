<script setup lang="ts">
/**
 * The workshop's music view: a strip on top to pick the whole game or any
 * level, and which track (the music, or the background under it); the code
 * for that in the middle.
 */
import { nextTick, ref, watch } from 'vue'
import { design } from '../design'
import LevelMusic from './LevelMusic.vue'

const picked = ref<number | 'game'>('game')
const track = ref<'main' | 'background'>('main')
const hasMusic = (i: number | 'game') => {
  const e = i === 'game' ? design : design.levels[i]
  return !!(e?.music || e?.background)
}

const strip = ref<HTMLElement | null>(null)
watch(picked, async () => {
  await nextTick()
  strip.value?.querySelector('.chip.on')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
})
const slide = (by: -1 | 1) => strip.value?.scrollBy({ left: by * strip.value.clientWidth * 0.8, behavior: 'smooth' })
</script>

<template>
  <Teleport defer to="#ws-top">
    <div class="top">
      <div class="strip-row">
        <button class="arrow" aria-label="Earlier levels" @click="slide(-1)">‹</button>
        <div ref="strip" class="strip">
          <button class="chip game" :class="{ on: picked === 'game', has: hasMusic('game') }" @click="picked = 'game'">Whole game</button>
          <button
            v-for="(l, i) in design.levels"
            :key="i"
            class="chip"
            :class="{ on: picked === i, has: hasMusic(i) }"
            :title="l.name ?? `Level ${i + 1}`"
            @click="picked = i"
          >{{ i + 1 }}</button>
        </div>
        <button class="arrow" aria-label="Later levels" @click="slide(1)">›</button>
      </div>
      <div class="tracks" role="tablist" aria-label="Track">
        <button class="track" role="tab" :aria-selected="track === 'main'" :class="{ on: track === 'main' }" @click="track = 'main'">Music</button>
        <button class="track" role="tab" :aria-selected="track === 'background'" :class="{ on: track === 'background' }" @click="track = 'background'">Background</button>
        <span class="which">{{ picked === 'game' ? 'every level without its own' : design.levels[picked]?.name ?? `level ${picked + 1}` }}</span>
      </div>
    </div>
  </Teleport>

  <LevelMusic :level="picked" :track="track" />
</template>

<style scoped>
.top { display: grid; gap: 6px; }
.strip-row { display: grid; grid-template-columns: auto 1fr auto; gap: 6px; align-items: center; }
.arrow { width: 28px; height: 32px; border: 2px solid var(--border); border-radius: 8px; background: var(--bg-off); font-family: var(--font-pixel); font-size: 12px; color: var(--text-dim); }
.arrow:hover { border-color: var(--sage); color: var(--text); }
.strip { display: flex; gap: 5px; overflow-x: auto; scrollbar-width: none; padding: 2px; }
.strip::-webkit-scrollbar { display: none; }
.chip {
  position: relative;
  flex: none;
  min-width: 34px;
  height: 30px;
  padding: 0 8px;
  border: 2px solid var(--border);
  border-radius: 8px;
  background: var(--bg-off);
  font-family: var(--font-pixel);
  font-size: 9px;
  color: var(--text-muted);
}
.chip.game { font-family: var(--font-code); font-size: 14px; text-transform: uppercase; }
.chip.has { color: var(--sun); }
.chip.has::after { content: ''; position: absolute; top: 3px; right: 3px; width: 5px; height: 5px; border-radius: 50%; background: var(--sun); }
.chip:hover { border-color: var(--sage); }
.chip.on { border-color: var(--mint); background: #0F2A28; color: var(--text); }
.tracks { display: flex; align-items: center; gap: 6px; }
.track { padding: 4px 12px; border: 2px solid var(--border); border-radius: 8px; background: var(--bg-off); font-size: 15px; text-transform: uppercase; color: var(--text-muted); }
.track.on { border-color: var(--sage); color: var(--sage); }
.which { font-size: 14px; text-transform: uppercase; color: var(--text-muted); }
.arrow:focus-visible, .chip:focus-visible, .track:focus-visible { outline: 3px solid var(--sun); outline-offset: 2px; }
</style>
