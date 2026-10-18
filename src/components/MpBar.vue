<script setup lang="ts">
/**
 * Multiplayer, during the game: who is ahead, by how much, and who is
 * climbing fastest, beside the clock (or the target, or who is still
 * alive). Before the go, a big count down in the middle.
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { state } from '../game'
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
  <div class="mp-bar" aria-live="off">
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

/* Phones: the HUD is down the side, so the board goes up to the top; keep it small. */
@media (max-width: 760px), (max-height: 560px) {
  .mp-bar { top: 8px; right: 50%; transform: translateX(50%); width: min(15rem, 60vw); padding: 5px 8px; }
  .lead { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .count, .clock.urgent { animation: none; }
}
</style>
