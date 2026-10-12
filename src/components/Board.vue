<script setup lang="ts">
/**
 * The whole screen is the board. One SVG unit is one cell, so game positions
 * are drawing positions. The snake is drawn as one tube (a dark polyline under
 * a lighter one), which keeps the deck's flat look with an outline all round.
 */
import { computed, ref, watch } from 'vue'
import { isActive, state, type Tone } from '../game'

const TONE: Record<Tone, string> = {
  mint: '#2BB5AC',
  coral: 'var(--coral)',
  sun: '#E0A800',
  lavender: 'var(--lavender)',
  sky: 'var(--sky)',
}

const points = computed(() => state.snake.map((c) => `${c.x + 0.5},${c.y + 0.5}`).join(' '))
const head = computed(() => state.snake[0]!)
const shielded = computed(() => isActive('shield'))
const doubled = computed(() => isActive('double'))

/** Eyes look where the snake is heading. */
const eyes = computed(() => {
  const { x, y } = state.direction
  const cx = head.value.x + 0.5
  const cy = head.value.y + 0.5
  return [
    { x: cx + x * 0.14 - y * 0.18, y: cy + y * 0.14 + x * 0.18 },
    { x: cx + x * 0.14 + y * 0.18, y: cy + y * 0.14 - x * 0.18 },
  ]
})

const snipperAngle = computed(() => (Math.atan2(state.snipper.facing.y, state.snipper.facing.x) * 180) / Math.PI)

/** Items blink in their last two beats. */
const fading = (until: number | null) => until !== null && until - state.step <= 8

/** Each popping cell throws six sparks; directions are fixed per cell. */
const SPARKS = Array.from({ length: 6 }, (_, i) => {
  const angle = (i / 6) * Math.PI * 2 + 0.3
  return { dx: Math.cos(angle) * 0.9, dy: Math.sin(angle) * 0.9 }
})
const SPARK_COLORS = ['var(--coral)', 'var(--sun)', 'var(--peach)']

/** Severed pieces pop from the cut outwards. */
const popDelay = (holdMs: number, gapMs: number, index: number) => `${holdMs + index * gapMs}ms`

const STAR = (() => {
  const pts: string[] = []
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 0.42 : 0.19
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2
    pts.push(`${(Math.cos(a) * r).toFixed(3)},${(Math.sin(a) * r).toFixed(3)}`)
  }
  return pts.join(' ')
})()

const PILL_COLOR = { shield: 'var(--sky)', double: 'var(--sun)', slow: 'var(--lavender)' } as const

/** One shake per hit, one pulse per beat. Web Animations, so nothing remounts. */
const root = ref<SVGSVGElement | null>(null)
const pulse = ref<SVGRectElement | null>(null)
watch(
  () => state.shake,
  () => {
    root.value?.animate(
      [
        { transform: 'translate(0, 0)' },
        { transform: 'translate(-7px, 3px)' },
        { transform: 'translate(6px, -4px)' },
        { transform: 'translate(-3px, 2px)' },
        { transform: 'translate(0, 0)' },
      ],
      { duration: 280, easing: 'ease-out' },
    )
  },
)
watch(
  () => state.beat,
  (beat) => {
    const downbeat = beat % 4 === 1
    pulse.value?.animate([{ opacity: downbeat ? 0.55 : 0.3 }, { opacity: 0 }], { duration: 260, easing: 'ease-out' })
  },
)
</script>

<template>
  <svg
    ref="root"
    class="board"
    :class="{ paused: state.status === 'paused' }"
    :viewBox="`-0.25 -0.25 ${state.cols + 0.5} ${state.rows + 0.5}`"
    preserveAspectRatio="xMidYMid meet"
    role="img"
    :aria-label="`Snake, ${state.snake.length} cells long, score ${state.score}`"
  >
    <defs>
      <pattern id="dots" width="1" height="1" patternUnits="userSpaceOnUse">
        <circle cx="0.5" cy="0.5" r="0.045" fill="var(--text-muted)" opacity="0.55" />
      </pattern>
      <pattern id="hatch" width="0.5" height="0.5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="0.22" height="0.5" fill="var(--coral)" />
      </pattern>
    </defs>

    <rect :width="state.cols" :height="state.rows" fill="url(#dots)" />
    <!-- Beat pulse: the frame flashes on every beat, stronger on the one -->
    <rect
      ref="pulse"
      :width="state.cols" :height="state.rows" rx="0.3" fill="none" opacity="0"
      stroke="var(--mint)" stroke-width="8" vector-effect="non-scaling-stroke"
    />
    <rect
      :width="state.cols" :height="state.rows" rx="0.3" fill="none"
      stroke="var(--text)" stroke-width="2" vector-effect="non-scaling-stroke"
    />

    <!-- Laser warnings: emitters at both ends, stripes, and a fuse that runs to the beat -->
    <g v-for="laser in state.lasers" :key="laser.id">
      <template v-if="!laser.struck">
        <rect
          class="warn"
          :x="laser.axis === 'col' ? laser.index : 0"
          :y="laser.axis === 'row' ? laser.index : 0"
          :width="laser.axis === 'col' ? 1 : state.cols"
          :height="laser.axis === 'row' ? 1 : state.rows"
          fill="url(#hatch)"
        />
        <rect
          class="fuse"
          :class="[laser.axis, laser.from]"
          :style="{ animationDuration: `${laser.warnMs}ms` }"
          :x="laser.axis === 'col' ? laser.index + 0.4 : 0"
          :y="laser.axis === 'row' ? laser.index + 0.4 : 0"
          :width="laser.axis === 'col' ? 0.2 : state.cols"
          :height="laser.axis === 'row' ? 0.2 : state.rows"
          fill="var(--coral)"
        />
        <rect
          v-for="end in [0, 1]"
          :key="end"
          class="emitter"
          :style="{ animationDuration: `${laser.warnMs}ms` }"
          :x="laser.axis === 'col' ? laser.index + 0.15 : end ? state.cols - 0.35 : -0.35"
          :y="laser.axis === 'row' ? laser.index + 0.15 : end ? state.rows - 0.35 : -0.35"
          width="0.7"
          height="0.7"
          rx="0.15"
        />
      </template>
    </g>

    <!-- Items -->
    <g
      v-for="item in state.items"
      :key="item.id"
      :transform="`translate(${item.x + 0.5} ${item.y + 0.5})`"
    >
      <g class="pop" :class="{ fading: fading(item.until) }">
        <template v-if="item.kind === 'apple'">
          <circle cy="0.06" r="0.34" fill="var(--coral)" stroke="var(--text)" stroke-width="2" vector-effect="non-scaling-stroke" />
          <path d="M 0.02 -0.26 q 0.12 -0.18 0.3 -0.14 q -0.06 0.2 -0.3 0.14 z" fill="var(--sage)" stroke="var(--text)" stroke-width="1.5" vector-effect="non-scaling-stroke" />
        </template>
        <template v-else-if="item.kind === 'cherry'">
          <path d="M -0.18 0.1 Q -0.05 -0.3 0.12 -0.38 M 0.18 0.14 Q 0.12 -0.2 0.12 -0.38" fill="none" stroke="var(--text)" stroke-width="1.5" vector-effect="non-scaling-stroke" />
          <circle cx="-0.18" cy="0.16" r="0.2" fill="var(--rose)" stroke="var(--text)" stroke-width="2" vector-effect="non-scaling-stroke" />
          <circle cx="0.2" cy="0.2" r="0.2" fill="var(--rose)" stroke="var(--text)" stroke-width="2" vector-effect="non-scaling-stroke" />
        </template>
        <template v-else-if="item.kind === 'star'">
          <g class="spin">
            <polygon :points="STAR" fill="var(--sun)" stroke="var(--text)" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
          </g>
        </template>
        <template v-else>
          <!-- Pills: a capsule, half colour, half white -->
          <g transform="rotate(-35)">
            <rect x="-0.4" y="-0.18" width="0.8" height="0.36" rx="0.18" fill="var(--bg)" stroke="var(--text)" stroke-width="2" vector-effect="non-scaling-stroke" />
            <path d="M 0 -0.18 L -0.22 -0.18 A 0.18 0.18 0 0 0 -0.22 0.18 L 0 0.18 Z" :fill="PILL_COLOR[item.kind]" stroke="var(--text)" stroke-width="2" vector-effect="non-scaling-stroke" />
          </g>
        </template>
      </g>
    </g>

    <!-- Severed pieces: lie still and shiver, then pop one by one into sparks -->
    <g v-for="piece in state.debris" :key="piece.id">
      <g
        v-for="(cell, i) in piece.cells"
        :key="i"
        :transform="`translate(${cell.x + 0.5} ${cell.y + 0.5})`"
      >
        <rect
          class="dead"
          :style="{ '--pop': popDelay(piece.holdMs, piece.gapMs, i) }"
          x="-0.38" y="-0.38" width="0.76" height="0.76" rx="0.24"
          fill="var(--peach)" stroke="var(--text)" stroke-width="2" vector-effect="non-scaling-stroke"
        />
        <circle
          class="ring"
          :style="{ animationDelay: popDelay(piece.holdMs, piece.gapMs, i) }"
          r="0.45" fill="none" stroke="var(--coral)" stroke-width="2" vector-effect="non-scaling-stroke"
        />
        <circle
          v-for="(spark, k) in SPARKS"
          :key="k"
          class="spark"
          :style="{
            '--sx': `${spark.dx}px`,
            '--sy': `${spark.dy}px`,
            animationDelay: popDelay(piece.holdMs, piece.gapMs, i),
          }"
          r="0.09"
          :fill="SPARK_COLORS[(i + k) % 3]"
        />
      </g>
    </g>

    <!-- The snake: outline tube, body tube, belly dots, head -->
    <polyline
      :points="points" fill="none" stroke="var(--text)" stroke-width="0.84"
      stroke-linecap="round" stroke-linejoin="round"
    />
    <polyline
      :points="points" fill="none" :stroke="doubled ? 'var(--sun)' : 'var(--sage)'" stroke-width="0.7"
      stroke-linecap="round" stroke-linejoin="round"
    />
    <circle
      v-for="(cell, i) in state.snake.slice(1)" :key="`d${i}`"
      v-show="i % 2 === 0"
      :cx="cell.x + 0.5" :cy="cell.y + 0.5" r="0.12" fill="var(--mint)" opacity="0.7"
    />
    <circle
      v-if="shielded"
      class="shield"
      :cx="head.x + 0.5" :cy="head.y + 0.5" r="0.72"
      fill="none" stroke="var(--sky)" stroke-width="3" stroke-dasharray="5 4" vector-effect="non-scaling-stroke"
    />
    <circle
      :cx="head.x + 0.5" :cy="head.y + 0.5" r="0.44"
      fill="var(--mint)" stroke="var(--text)" stroke-width="2" vector-effect="non-scaling-stroke"
    />
    <circle v-for="(eye, i) in eyes" :key="`e${i}`" :cx="eye.x" :cy="eye.y" r="0.08" fill="var(--text)" />

    <!-- The snipper: a beetle with scissor pincers -->
    <g
      v-if="state.snipper.active"
      class="snipper"
      :class="{ resting: state.snipper.resting }"
      :transform="`translate(${state.snipper.x + 0.5} ${state.snipper.y + 0.5}) rotate(${snipperAngle}) scale(1.3)`"
    >
      <g class="pop">
        <path
          d="M -0.1 -0.32 L -0.2 -0.46 M 0.05 -0.32 L 0 -0.47 M -0.1 0.32 L -0.2 0.46 M 0.05 0.32 L 0 0.47"
          stroke="var(--text)" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linecap="round"
        />
        <ellipse
          cx="-0.08" cy="0" rx="0.3" ry="0.32"
          fill="var(--lavender)" stroke="var(--text)" stroke-width="2" vector-effect="non-scaling-stroke"
        />
        <path d="M -0.08 -0.3 L -0.08 0.3" stroke="var(--text)" stroke-width="1.5" vector-effect="non-scaling-stroke" />
        <path
          class="pincer"
          d="M 0.18 -0.12 Q 0.48 -0.2 0.5 0.02 Q 0.36 -0.06 0.22 -0.02 Z"
          fill="var(--coral)" stroke="var(--text)" stroke-width="1.5" vector-effect="non-scaling-stroke"
        />
        <path
          class="pincer bottom"
          d="M 0.18 0.12 Q 0.48 0.2 0.5 -0.02 Q 0.36 0.06 0.22 0.02 Z"
          fill="var(--coral)" stroke="var(--text)" stroke-width="1.5" vector-effect="non-scaling-stroke"
        />
        <circle cx="0.12" cy="-0.1" r="0.05" fill="var(--text)" />
        <circle cx="0.12" cy="0.1" r="0.05" fill="var(--text)" />
      </g>
    </g>

    <!-- Laser strikes: a straight beam and a jagged bolt, over everything -->
    <g v-for="laser in state.lasers" :key="`s${laser.id}`">
      <g v-if="laser.struck" class="strike" :class="[laser.axis, laser.from]">
        <rect
          :x="laser.axis === 'col' ? laser.index + 0.22 : -0.25"
          :y="laser.axis === 'row' ? laser.index + 0.22 : -0.25"
          :width="laser.axis === 'col' ? 0.56 : state.cols + 0.5"
          :height="laser.axis === 'row' ? 0.56 : state.rows + 0.5"
          fill="var(--coral)"
        />
        <polyline :points="laser.bolt" fill="none" stroke="var(--sun)" stroke-width="3" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
        <rect
          :x="laser.axis === 'col' ? laser.index + 0.44 : -0.25"
          :y="laser.axis === 'row' ? laser.index + 0.44 : -0.25"
          :width="laser.axis === 'col' ? 0.12 : state.cols + 0.5"
          :height="laser.axis === 'row' ? 0.12 : state.rows + 0.5"
          fill="#fff"
        />
      </g>
    </g>

    <!-- Floating numbers -->
    <text
      v-for="p in state.popups"
      :key="p.id"
      class="popup"
      :x="p.x + 0.5" :y="p.y"
      text-anchor="middle"
      :fill="TONE[p.tone]"
    >{{ p.text }}</text>
  </svg>
</template>

<style scoped>
.board {
  display: block;
  width: 100%;
  height: 100%;
}
.board.paused,
.board.paused * {
  animation-play-state: paused !important;
}

.pop {
  transform-box: fill-box;
  transform-origin: center;
  animation: pop-in 0.3s var(--ease-out) both;
}
.fading { animation: blink 0.25s steps(2) infinite; }
@keyframes blink {
  50% { opacity: 0.25; }
}
.spin {
  transform-box: fill-box;
  transform-origin: center;
  animation: spin 3s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ─── Lasers ─── */
.warn {
  animation: warn-pulse 0.4s ease-in-out infinite alternate;
}
@keyframes warn-pulse {
  from { opacity: 0.14; }
  to { opacity: 0.36; }
}
.fuse {
  transform-box: fill-box;
  animation: fuse linear both;
}
.fuse.row.start { transform-origin: left center; }
.fuse.row.end { transform-origin: right center; }
.fuse.col.start { transform-origin: center top; }
.fuse.col.end { transform-origin: center bottom; }
.fuse.row { --scale: scaleX(0); }
.fuse.col { --scale: scaleY(0); }
@keyframes fuse {
  from { transform: var(--scale); opacity: 0.25; }
  to { transform: none; opacity: 0.95; }
}
/* Emitters charge from dark to hot coral over the warning. */
.emitter {
  animation: charge linear both;
}
@keyframes charge {
  from { fill: var(--text); }
  to { fill: var(--coral); }
}

.strike {
  transform-box: fill-box;
  animation: beam 0.32s var(--ease-out) both;
}
.strike.row.start { transform-origin: left center; --from: scaleX(0); }
.strike.row.end { transform-origin: right center; --from: scaleX(0); }
.strike.col.start { transform-origin: center top; --from: scaleY(0); }
.strike.col.end { transform-origin: center bottom; --from: scaleY(0); }
@keyframes beam {
  0% { transform: var(--from); opacity: 1; }
  30% { transform: none; opacity: 1; }
  100% { transform: none; opacity: 0; }
}

/* ─── Severed pieces ─── */
.dead {
  transform-box: fill-box;
  transform-origin: center;
  animation:
    shiver 0.08s linear infinite alternate,
    burst 0.28s var(--ease-out) var(--pop) both;
}
@keyframes shiver {
  from { translate: -0.03px 0.02px; }
  to { translate: 0.03px -0.02px; }
}
@keyframes burst {
  0% { transform: scale(1); opacity: 1; }
  45% { transform: scale(1.35); opacity: 1; fill: var(--sun); }
  100% { transform: scale(0); opacity: 0; }
}
.ring {
  opacity: 0;
  transform-box: fill-box;
  transform-origin: center;
  animation: ring 0.45s var(--ease-out) both;
}
@keyframes ring {
  0% { transform: scale(0.4); opacity: 0.9; }
  100% { transform: scale(1.9); opacity: 0; }
}
.spark {
  opacity: 0;
  animation: spark 0.5s var(--ease-out) both;
}
@keyframes spark {
  0% { transform: translate(0, 0) scale(1); opacity: 1; }
  100% { transform: translate(var(--sx), var(--sy)) scale(0.2); opacity: 0; }
}

/* ─── Shield ─── */
.shield {
  transform-box: fill-box;
  transform-origin: center;
  animation: spin 2s linear infinite;
}

/* ─── Snipper ─── */
.pincer {
  transform-box: fill-box;
  transform-origin: left center;
  animation: snap 0.35s ease-in-out infinite alternate;
}
.pincer.bottom { animation-direction: alternate-reverse; }
.resting .pincer { animation: none; }
.resting { opacity: 0.6; }
@keyframes snap {
  from { transform: rotate(-12deg); }
  to { transform: rotate(10deg); }
}

/* ─── Popups ─── */
.popup {
  font-family: var(--font-code);
  font-size: 0.85px;
  font-weight: 800;
  paint-order: stroke;
  stroke: var(--bg);
  stroke-width: 0.18px;
  stroke-linejoin: round;
  animation: rise 1s var(--ease-out) both;
}
@keyframes rise {
  from { transform: translateY(0.2px); opacity: 0; }
  20% { opacity: 1; }
  to { transform: translateY(-1.2px); opacity: 0; }
}
</style>
