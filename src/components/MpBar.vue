<script setup lang="ts">
/**
 * Multiplayer, during the game: who is ahead, by how much, and who is
 * climbing fastest, beside the clock (or the target, or who is still
 * alive). On phones it is a slim rail down the right, beside the board
 * rather than over it. Before the go, a big count down in the middle.
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { layout, state } from '../game'
import { colorOf, MODES, mp, rate } from '../multiplayer'

const now = ref(performance.now())
const timer = window.setInterval(() => (now.value = performance.now()), 200)
onBeforeUnmount(() => clearInterval(timer))

const count = computed(() => Math.max(0, Math.ceil((mp.startsAt - now.value) / 1000)))

const rows = computed(() => {
  void now.value
  const me = mp.players.find((p) => p.index === mp.you)
  const list = [
    { index: mp.you, name: me?.name ?? 'You', score: state.score, rate: rate(mp.mine, state.score), alive: state.status !== 'over', you: true, stale: false },
    ...Object.values(mp.peers).map((p) => ({
      index: p.index,
      name: p.name,
      score: p.score,
      rate: rate(p.samples, p.score),
      alive: p.alive,
      you: false,
      // No word for three seconds: the connection is struggling.
      stale: mp.phase === 'playing' && now.value - p.seen > 3000,
    })),
  ]
  const survival = mp.settings.mode === 'survival'
  list.sort((a, b) => (survival ? Number(b.alive) - Number(a.alive) : 0) || b.score - a.score)
  const top = Math.max(1, list[0]!.score)
  const fastest = Math.max(...list.map((r) => r.rate))
  const mine = state.score
  return list.map((r, i) => ({
    ...r,
    place: i + 1,
    share: r.score / top,
    hot: r.rate > 0 && r.rate === fastest && list.length > 1,
    // Against you: how far ahead of or behind you they are.
    gap: r.score - mine,
    color: r.you ? 'var(--sage)' : colorOf(r.index),
  }))
})
const myRow = computed(() => rows.value.find((r) => r.you))
const lead = computed(() => {
  const list = rows.value
  if (list.length < 2 || !myRow.value) return ''
  if (list[0]!.score === list[1]!.score && list[0]!.score === myRow.value.score) return 'neck and neck'
  if (myRow.value.place === 1) return `leading by ${(list[0]!.score - list[1]!.score).toLocaleString()}`
  return `${(list[0]!.score - myRow.value.score).toLocaleString()} behind ${list[0]!.name}`
})

/** Phones: the rail beside the board. */
const rail = computed(() => layout.pad !== 'none')
/** 1234 → 1.2k, to fit the rail. */
const short = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))

const clock = computed(() => {
  if (mp.settings.mode === 'score') {
    const left = Math.max(0, Math.ceil((mp.endsAt - Math.max(now.value, mp.startsAt)) / 1000))
    return { text: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, urgent: left <= 10 }
  }
  if (mp.settings.mode === 'sprint') return { text: `to ${mp.settings.target.toLocaleString()}`, urgent: false }
  return { text: `${rows.value.filter((r) => r.alive).length} alive`, urgent: false }
})
</script>

<template>
  <!-- Phones: a rail down the right side, out of the board's way -->
  <div v-if="rail" class="mp-rail" aria-live="off">
    <b class="rail-clock" :class="{ urgent: clock.urgent }">{{ mp.settings.mode === 'sprint' ? short(mp.settings.target) : clock.text.replace(' alive', '♥') }}</b>
    <div v-for="r in rows" :key="r.index" class="rail-p" :class="{ you: r.you, out: !r.alive, stale: r.stale }" :style="{ '--pc': r.color }">
      <span class="rail-place">{{ r.place }}</span>
      <span class="rail-name">{{ r.you ? 'you' : r.name.slice(0, 4) }}</span>
      <span class="rail-track"><i :style="{ transform: `scaleX(${r.share})` }"></i></span>
      <b class="rail-score">{{ short(r.score) }}</b>
      <span v-if="!r.you" class="rail-gap" :class="r.gap > 0 ? 'ahead' : 'behind'">{{ r.gap > 0 ? '+' : r.gap < 0 ? '−' : '=' }}{{ r.gap ? short(Math.abs(r.gap)) : '' }}</span>
      <span v-else-if="r.hot" class="rail-hot">▲</span>
    </div>
  </div>

  <div v-else class="mp-bar" aria-live="off">
    <div class="head">
      <span class="mode">{{ MODES[mp.settings.mode].name }}</span>
      <b class="clock" :class="{ urgent: clock.urgent }">{{ clock.text }}</b>
    </div>
    <ol class="rows">
      <li v-for="r in rows" :key="r.index" :class="{ you: r.you, out: !r.alive, stale: r.stale }" :style="{ '--pc': r.color }">
        <span class="place">{{ r.place }}</span>
        <span class="who">
          <span class="name">{{ r.name }}<template v-if="r.you"> (you)</template></span>
          <span class="track"><i :style="{ transform: `scaleX(${r.share})` }"></i></span>
        </span>
        <span class="nums">
          <b class="score">{{ r.score.toLocaleString() }}</b>
          <span class="rate" :class="{ hot: r.hot }">{{ r.hot ? '▲' : '' }}+{{ r.rate }}/10s</span>
        </span>
        <span v-if="!r.you" class="gap" :class="r.gap > 0 ? 'ahead' : 'behind'">{{ r.gap > 0 ? '+' : r.gap < 0 ? '−' : '' }}{{ Math.abs(r.gap).toLocaleString() }}</span>
      </li>
    </ol>
    <p v-if="lead" class="lead" :class="{ winning: myRow?.place === 1 }">{{ lead }}</p>
  </div>

  <!-- Before the go -->
  <div v-if="mp.phase === 'countdown'" class="countdown">
    <span :key="count" class="count">{{ count || 'Go!' }}</span>
    <span class="count-sub">{{ MODES[mp.settings.mode].name }} · {{ mp.settings.game }}</span>
  </div>
</template>

<style scoped>
.mp-bar {
  position: absolute;
  top: 76px;
  right: 16px;
  z-index: 6;
  width: min(17rem, 44vw);
  padding: 8px 10px;
  border: 2px solid var(--sky);
  border-radius: 12px;
  background: rgba(11, 11, 26, 0.82);
  box-shadow: 4px 4px 0 var(--ink);
  pointer-events: none;
}
.head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
.mode { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }
.clock { font-family: var(--font-pixel); font-size: 12px; font-weight: 400; color: var(--sky); }
.clock.urgent { color: var(--coral); animation: tick 1s steps(1) infinite; }
@keyframes tick { 50% { opacity: 0.4; } }
.rows { display: grid; gap: 5px; margin: 0; padding: 0; list-style: none; }
.rows li { display: grid; grid-template-columns: 14px 1fr auto auto; align-items: center; gap: 6px; }
.rows li.out { opacity: 0.45; }
.rows li.stale .name::after { content: ' · lag'; color: var(--coral); }
.place { font-family: var(--font-pixel); font-size: 8px; color: var(--text-muted); }
.rows li:first-child .place { color: var(--sun); }
.who { display: grid; gap: 2px; min-width: 0; }
.name { overflow: hidden; font-size: 14px; line-height: 1; text-transform: uppercase; text-overflow: ellipsis; white-space: nowrap; color: var(--pc); }
.you .name { color: var(--sage); }
.track { height: 4px; border-radius: 2px; background: var(--border); overflow: hidden; }
.track i { display: block; height: 100%; background: var(--pc); transform-origin: left; transition: transform 0.25s var(--ease-out); box-shadow: 0 0 6px var(--pc); }
.nums { display: grid; justify-items: end; }
.score { font-family: var(--font-pixel); font-size: 9px; font-weight: 400; color: var(--text); }
.rate { font-size: 12px; line-height: 1; color: var(--text-muted); }
.rate.hot { color: var(--sun); }
.gap { min-width: 3.2em; font-size: 13px; text-align: right; }
.gap.ahead { color: var(--coral); }
.gap.behind { color: var(--sage); }
.lead { margin: 6px 0 0; font-size: 13px; text-transform: uppercase; text-align: center; color: var(--coral); }
.lead.winning { color: var(--sage); }

.countdown {
  position: absolute;
  inset: 0;
  z-index: 7;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 12px;
  background: rgba(0, 0, 0, 0.45);
  pointer-events: none;
}
.count {
  font-family: var(--font-pixel);
  font-size: clamp(3rem, 14vw, 7rem);
  color: var(--sun);
  text-shadow: 6px 6px 0 var(--rose), 0 0 30px rgba(255, 225, 77, 0.4);
  animation: pop 0.9s var(--ease-out);
}
.count-sub { font-size: 18px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-dim); }
@keyframes pop {
  from { transform: scale(1.6); opacity: 0; }
  25% { transform: scale(1); opacity: 1; }
}

/* Phones: a slim rail in the right-hand gutter, under the pause and menu buttons. */
.mp-rail {
  position: absolute;
  top: 92px;
  right: 4px;
  z-index: 6;
  display: grid;
  align-content: start;
  gap: 6px;
  width: 42px;
  pointer-events: none;
}
.rail-clock { padding: 4px 0; border: 2px solid var(--sky); border-radius: 8px; background: rgba(11, 11, 26, 0.85); font-family: var(--font-pixel); font-size: 7px; font-weight: 400; text-align: center; color: var(--sky); }
.rail-clock.urgent { color: var(--coral); border-color: var(--coral); }
.rail-p {
  display: grid;
  justify-items: center;
  gap: 2px;
  padding: 3px 2px 4px;
  border: 2px solid var(--border);
  border-left: 3px solid var(--pc);
  border-radius: 8px;
  background: rgba(11, 11, 26, 0.85);
}
.rail-p.you { border-color: var(--sage); border-left-color: var(--sage); }
.rail-p.out { opacity: 0.4; }
.rail-p.stale { border-style: dashed; }
.rail-place { font-family: var(--font-pixel); font-size: 6px; color: var(--text-muted); }
.rail-p:nth-child(2) .rail-place { color: var(--sun); }
.rail-name { max-width: 100%; overflow: hidden; font-size: 11px; line-height: 1; text-transform: uppercase; white-space: nowrap; color: var(--pc); }
.rail-p.you .rail-name { color: var(--sage); }
.rail-track { width: 30px; height: 3px; border-radius: 2px; background: var(--border); overflow: hidden; }
.rail-track i { display: block; height: 100%; background: var(--pc); transform-origin: left; transition: transform 0.25s var(--ease-out); }
.rail-score { font-family: var(--font-pixel); font-size: 6px; font-weight: 400; color: var(--text); }
.rail-gap { font-size: 10px; line-height: 1; }
.rail-gap.ahead { color: var(--coral); }
.rail-gap.behind { color: var(--sage); }
.rail-hot { font-size: 10px; line-height: 1; color: var(--sun); }
@media (prefers-reduced-motion: reduce) {
  .count, .clock.urgent { animation: none; }
}
</style>
