<script setup lang="ts">
/**
 * Controls for watching a run: play and pause, speed, a seek bar, and jumps
 * back and forward. The board and HUD above show the run as it was played.
 */
import { computed, reactive } from 'vue'
import { replay, runSeconds, state, type Mark } from '../game'
import { player, seek, seekBy, setSpeed, SPEEDS, togglePlay } from '../replayPlayer'
import GameCode from './GameCode.vue'

/** Filters for the seek bar's markers: what each shows, its colour, on or off. */
const FILTERS = [
  { key: 'power', label: 'Picked up', color: 'var(--mint)' },
  { key: 'use', label: 'Used', color: 'var(--sky)' },
  { key: 'cut', label: 'Cuts', color: 'var(--peach)' },
  { key: 'hurt', label: 'Hearts lost', color: 'var(--coral)' },
  { key: 'heal', label: 'Hearts gained', color: 'var(--rose)' },
  { key: 'level', label: 'Levels', color: 'var(--sun)' },
  { key: 'totem', label: 'Totem', color: 'var(--lavender)' },
] as const satisfies readonly { key: Mark; label: string; color: string }[]
const shown = reactive<Record<Mark, boolean>>({ power: true, use: true, cut: true, hurt: true, heal: true, level: true, totem: true, die: true })
const colorOf = (kind: Mark) => FILTERS.find((f) => f.key === kind)?.color ?? 'var(--text)'
const counts = computed(() => {
  const n: Partial<Record<Mark, number>> = {}
  for (const m of player.marks) n[m.kind] = (n[m.kind] ?? 0) + 1
  return n
})
const visibleMarks = computed(() => player.marks.filter((m) => shown[m.kind]))
const pos = (step: number) => `${(step / Math.max(1, replay.total)) * 100}%`
/** Jump to just before a moment, so it plays out. */
const jumpTo = (step: number) => seek(step - 12)

const emit = defineEmits<{ exit: [] }>()

/** About five seconds of play at the start tempo. */
const JUMP = 36

const clock = (steps: number) => {
  const s = Math.floor(runSeconds(steps))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const done = computed(() => replay.ended || replay.at >= replay.total)
</script>

<template>
  <div class="viewer" role="region" aria-label="Replay controls">
    <div class="title">
      <span class="replay-tag">Replay</span>
      <b>{{ player.entry?.name ?? 'Unnamed' }}</b>
      <GameCode v-if="player.entry?.code" :code="player.entry.code" link />
      <span v-if="player.entry" class="dim">{{ player.entry.score.toLocaleString() }} pts · level {{ player.entry.level }}</span>
      <span v-if="done && state.reason" class="end">· {{ state.reason }}</span>
      <button class="exit" aria-label="Close replay" @click="emit('exit')">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </div>

    <!-- Seek bar, with a tick for each moment that passes the filters -->
    <div class="track">
      <input
        class="scrub"
        type="range"
        min="0"
        :max="replay.total"
        :value="replay.at"
        aria-label="Seek"
        @input="seek(Number(($event.target as HTMLInputElement).value))"
      />
      <button
        v-for="(m, i) in visibleMarks"
        :key="i"
        class="mark"
        :class="m.kind"
        :style="{ left: pos(m.step), background: colorOf(m.kind) }"
        :title="`${FILTERS.find((f) => f.key === m.kind)?.label ?? 'Game over'} · ${clock(m.step)}`"
        :aria-label="`Jump to ${m.kind} at ${clock(m.step)}`"
        @click="jumpTo(m.step)"
      ></button>
    </div>
    <div class="filters" role="group" aria-label="Show on the seek bar">
      <button
        v-for="f in FILTERS"
        :key="f.key"
        class="chip"
        :class="{ on: shown[f.key], empty: !counts[f.key] }"
        :aria-pressed="shown[f.key]"
        @click="shown[f.key] = !shown[f.key]"
      >
        <span class="dot" :style="{ background: f.color }"></span>{{ f.label }} <span class="n">{{ counts[f.key] ?? 0 }}</span>
      </button>
    </div>

    <div class="controls">
      <button class="ctl" aria-label="Back to start" @click="seek(0)">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M5 4h3v16H5zM20 4v16L9 12z" /></svg>
      </button>
      <button class="ctl" aria-label="Back 5 seconds" @click="seekBy(-JUMP)">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 4v16L3 12zM21 4v16l-9-8z" /></svg>
      </button>
      <button class="ctl play" :aria-label="player.playing ? 'Pause' : 'Play'" @click="togglePlay">
        <svg v-if="player.playing" viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
        <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M7 4v16l13-8z" /></svg>
      </button>
      <button class="ctl" aria-label="Forward 5 seconds" @click="seekBy(JUMP)">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 4v16l9-8zM12 4v16l9-8z" /></svg>
      </button>
      <span class="time">{{ clock(replay.at) }} / {{ clock(replay.total) }}</span>
      <span class="speeds" role="group" aria-label="Speed">
        <button v-for="s in SPEEDS" :key="s" class="speed" :class="{ on: player.speed === s }" @click="setSpeed(s)">{{ s }}×</button>
      </span>
    </div>
  </div>
</template>

<style scoped>
.viewer {
  position: absolute;
  left: 50%;
  bottom: 18px;
  z-index: 7;
  display: grid;
  gap: 8px;
  width: min(44rem, calc(100% - 24px));
  padding: 10px 14px 12px;
  background: rgba(11, 11, 26, 0.94);
  border: 3px solid var(--sky);
  box-shadow: 6px 6px 0 var(--ink);
  translate: -50% 0;
}
.title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
  font-size: 18px;
  text-transform: uppercase;
  white-space: nowrap;
}
.title b { font-weight: 400; color: var(--text); overflow: hidden; text-overflow: ellipsis; }
.replay-tag {
  padding: 1px 6px;
  background: var(--coral);
  color: var(--ink);
  font-size: 15px;
}
.dim { color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; }
.end { color: var(--coral); }
.exit {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  margin-left: auto;
  align-self: center;
  border: 2px solid var(--border);
  background: var(--bg-off);
  color: var(--text-dim);
}
.exit:hover { border-color: var(--coral); color: var(--text); }
.track { position: relative; height: 26px; }
.scrub { position: absolute; inset: 4px 0 auto; width: 100%; margin: 0; accent-color: var(--sky); }
.mark {
  position: absolute;
  top: 0;
  width: 4px;
  height: 8px;
  padding: 0;
  border: 0;
  translate: -50% 0;
  cursor: pointer;
}
/* The ones that matter most stand taller. */
.mark.hurt, .mark.totem, .mark.die { height: 12px; width: 5px; }
.mark.die { background: var(--text) !important; }
.mark:hover { outline: 2px solid var(--text); }
.filters { display: flex; flex-wrap: wrap; gap: 4px; }
.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 7px;
  border: 2px solid var(--border);
  background: var(--bg-off);
  font-size: 14px;
  text-transform: uppercase;
  color: var(--text-muted);
}
.chip.on { border-color: var(--text-muted); color: var(--text); }
.chip.empty { opacity: 0.45; }
.chip .dot { width: 8px; height: 8px; }
.chip:not(.on) .dot { opacity: 0.3; }
.chip .n { color: var(--text-muted); }
.controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.ctl {
  display: grid;
  place-items: center;
  width: 36px;
  height: 32px;
  border: 2px solid var(--border);
  background: var(--bg-off);
  color: var(--text-dim);
}
.ctl:hover { border-color: var(--sky); color: var(--text); }
.ctl.play { width: 44px; border-color: var(--sky); background: var(--sky); color: var(--ink); }
.time {
  margin: 0 6px;
  font-size: 18px;
  font-variant-numeric: tabular-nums;
  color: var(--text-dim);
}
.speeds { display: flex; gap: 4px; margin-left: auto; }
.speed {
  min-width: 40px;
  padding: 4px 6px;
  border: 2px solid var(--border);
  background: var(--bg-off);
  font-size: 16px;
  color: var(--text-muted);
}
.speed:hover { color: var(--text); }
.speed.on { border-color: var(--sun); color: var(--sun); }
.ctl:focus-visible, .speed:focus-visible, .exit:focus-visible, .chip:focus-visible, .mark:focus-visible { outline: 3px solid var(--sun); outline-offset: 2px; }
@media (max-width: 520px) {
  .speeds { margin-left: 0; }
}
</style>
