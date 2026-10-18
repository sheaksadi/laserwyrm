<script setup lang="ts">
/**
 * The whole screen is the board. One SVG unit is one cell, so game positions
 * are drawing positions. The snake is drawn as one tube (a dark polyline under
 * a lighter one), with square caps for a blocky, 8-bit look.
 */
import { computed, ref, watch } from 'vue'
import { HEART_PATH, isActive, state, TONE_COLOR, type Beam, type LaserKind } from '../game'
import PowerIcon from './PowerIcon.vue'


/**
 * The snake as runs of touching cells. Where it wraps through a wall, two
 * neighbours in the body are a board apart; the line breaks there instead of
 * striking across the board.
 */
const runs = computed(() => {
  const out: string[][] = []
  let run: string[] = []
  state.snake.forEach((c, i) => {
    const prev = state.snake[i - 1]
    if (prev && Math.abs(prev.x - c.x) + Math.abs(prev.y - c.y) > 1) {
      out.push(run)
      run = []
    }
    run.push(`${c.x + 0.5},${c.y + 0.5}`)
  })
  out.push(run)
  return out.map((r) => r.join(' '))
})
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

/** Where a cookie's chips (or a starry cookie's stars) sit. */
const CHIPS: [number, number][] = [[-0.14, -0.12], [0.13, -0.06], [-0.04, 0.14], [0.17, 0.17], [-0.2, 0.08]]
/** A small five-pointed star at (x, y). */
function tinyStar(x: number, y: number, r = 0.09) {
  return Array.from({ length: 10 }, (_, i) => {
    const rr = i % 2 ? r * 0.45 : r
    const a = (i * Math.PI) / 5 - Math.PI / 2
    return `${(x + Math.cos(a) * rr).toFixed(3)},${(y + Math.sin(a) * rr).toFixed(3)}`
  }).join(' ')
}
/** Directions (in board units, drawn as px of a 1-unit cell) the burst's stars fly, and how much they spin. */
const BURST: [number, number, number][] = Array.from({ length: 10 }, (_, i) => {
  const a = (i / 10) * Math.PI * 2
  const d = 1.3 + (i % 3) * 0.45
  return [Math.cos(a) * d, Math.sin(a) * d, (i % 2 ? 1 : -1) * 220]
})

/** Each laser colour; prism lasers are a rainbow gradient. */
const LASER_COLOR: Record<LaserKind, string> = {
  red: 'var(--coral)',
  blue: 'var(--sky)',
  purple: 'var(--lavender)',
  white: '#FFFFFF',
  green: 'var(--sage)',
  gold: 'var(--sun)',
  prism: 'url(#prism)',
}
const LASER_KINDS = Object.keys(LASER_COLOR) as LaserKind[]
const half = (beam: Beam) => (beam.width - 1) / 2
/** Emitters grow with the band they fire. */
const emitterSize = (beam: Beam) => (beam.width === 3 ? 1.6 : 0.7)

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


/** One shake per hit, one pulse per beat. Web Animations, so nothing remounts. */
const root = ref<HTMLDivElement | null>(null)
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
  <!--
    Two layers. Behind: the grid and the glowing frame, which never move, so
    the browser paints them (and their glow) once. In front: everything that
    moves, with no filter, so a move repaints only the drawing, not a blur
    over the whole board.
  -->
  <div ref="root" class="board-stack">
  <svg
    class="board-back"
    :viewBox="`-0.25 -0.25 ${state.cols + 0.5} ${state.rows + 0.5}`"
    preserveAspectRatio="xMidYMid meet"
    aria-hidden="true"
  >
    <defs>
      <pattern id="dots" width="1" height="1" patternUnits="userSpaceOnUse">
        <path d="M 1 0 L 0 0 0 1" fill="none" stroke="var(--border)" stroke-width="1" vector-effect="non-scaling-stroke" />
      </pattern>
    </defs>
    <rect :width="state.cols" :height="state.rows" fill="url(#dots)" />
    <!-- The frame's glow: two soft, wider strokes under it (a blur filter would cost a repaint every frame) -->
    <rect :width="state.cols" :height="state.rows" fill="none" stroke="var(--sky)" stroke-width="10" stroke-opacity="0.08" vector-effect="non-scaling-stroke" />
    <rect :width="state.cols" :height="state.rows" fill="none" stroke="var(--sky)" stroke-width="6" stroke-opacity="0.16" vector-effect="non-scaling-stroke" />
    <rect
      :width="state.cols" :height="state.rows" fill="none"
      stroke="var(--sky)" stroke-width="3" vector-effect="non-scaling-stroke"
    />
  </svg>
  <svg
    class="board"
    :class="{ paused: state.status === 'paused' }"
    :viewBox="`-0.25 -0.25 ${state.cols + 0.5} ${state.rows + 0.5}`"
    preserveAspectRatio="xMidYMid meet"
    role="img"
    :aria-label="`Snake, ${state.snake.length} cells long, score ${state.score}`"
  >
    <defs>
      <linearGradient id="prism" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#FF3355" />
        <stop offset="0.25" stop-color="#FFE14D" />
        <stop offset="0.5" stop-color="#5CFF5C" />
        <stop offset="0.75" stop-color="#3FA9FF" />
        <stop offset="1" stop-color="#B26BFF" />
      </linearGradient>
      <pattern v-for="kind in LASER_KINDS" :id="`hatch-${kind}`" :key="kind" width="0.5" height="0.5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="0.22" height="0.5" :fill="LASER_COLOR[kind]" />
      </pattern>
    </defs>

    <!-- Beat pulse: the frame flashes on every beat, stronger on the one -->
    <rect
      ref="pulse"
      :width="state.cols" :height="state.rows" fill="none" opacity="0"
      stroke="var(--mint)" stroke-width="8" vector-effect="non-scaling-stroke"
    />

    <!-- Walls from a home-made level: solid blocks with a lit top edge -->
    <g v-if="state.walls.length" class="walls">
      <g v-for="i in state.walls" :key="i" :transform="`translate(${i % state.cols} ${Math.floor(i / state.cols)})`">
        <rect x="0.04" y="0.04" width="0.92" height="0.92" fill="#2A2350" stroke="var(--lavender)" stroke-width="0.06" />
        <rect x="0.14" y="0.14" width="0.72" height="0.12" fill="var(--lavender)" opacity="0.45" />
      </g>
    </g>

    <!-- Laser warnings: emitters at both ends, stripes, and a fuse that runs to the beat.
         A laser is one or two beams (a cross), each 1 or 3 cells wide, coloured by kind. -->
    <g v-for="laser in state.lasers" :key="laser.id" :style="{ '--laser': LASER_COLOR[laser.kind] }">
      <template v-if="!laser.struck">
        <g v-for="(beam, b) in laser.beams" :key="b" :class="{ tracking: laser.traits.includes('track') }">
          <rect
            class="warn"
            :x="beam.axis === 'col' ? beam.index - half(beam) : 0"
            :y="beam.axis === 'row' ? beam.index - half(beam) : 0"
            :width="beam.axis === 'col' ? beam.width : state.cols"
            :height="beam.axis === 'row' ? beam.width : state.rows"
            :fill="`url(#hatch-${laser.kind})`"
          />
          <rect
            class="fuse"
            :class="[beam.axis, laser.from]"
            :style="{ animationDuration: `${laser.warnMs}ms` }"
            :x="beam.axis === 'col' ? beam.index + 0.4 : 0"
            :y="beam.axis === 'row' ? beam.index + 0.4 : 0"
            :width="beam.axis === 'col' ? 0.2 : state.cols"
            :height="beam.axis === 'row' ? 0.2 : state.rows"
            :fill="LASER_COLOR[laser.kind]"
          />
          <rect
            v-for="end in [0, 1]"
            :key="end"
            class="emitter"
            :style="{ animationDuration: `${laser.warnMs}ms` }"
            :x="beam.axis === 'col' ? beam.index + 0.5 - emitterSize(beam) / 2 : end ? state.cols - emitterSize(beam) / 2 : -emitterSize(beam) / 2"
            :y="beam.axis === 'row' ? beam.index + 0.5 - emitterSize(beam) / 2 : end ? state.rows - emitterSize(beam) / 2 : -emitterSize(beam) / 2"
            :width="emitterSize(beam)"
            :height="emitterSize(beam)"
          />
        </g>
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
          <circle cy="0.06" r="0.34" fill="var(--coral)" stroke="var(--ink)" stroke-width="2" vector-effect="non-scaling-stroke" />
          <path d="M 0.02 -0.26 q 0.12 -0.18 0.3 -0.14 q -0.06 0.2 -0.3 0.14 z" fill="var(--sage)" stroke="var(--ink)" stroke-width="1.5" vector-effect="non-scaling-stroke" />
        </template>
        <template v-else-if="item.kind === 'cherry'">
          <path d="M -0.18 0.1 Q -0.05 -0.3 0.12 -0.38 M 0.18 0.14 Q 0.12 -0.2 0.12 -0.38" fill="none" stroke="var(--ink)" stroke-width="1.5" vector-effect="non-scaling-stroke" />
          <circle cx="-0.18" cy="0.16" r="0.2" fill="var(--rose)" stroke="var(--ink)" stroke-width="2" vector-effect="non-scaling-stroke" />
          <circle cx="0.2" cy="0.2" r="0.2" fill="var(--rose)" stroke="var(--ink)" stroke-width="2" vector-effect="non-scaling-stroke" />
        </template>
        <template v-else-if="item.kind === 'star'">
          <g class="spin">
            <polygon :points="STAR" fill="var(--sun)" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
          </g>
        </template>
        <template v-else-if="item.kind === 'heart'">
          <g class="beat-throb">
            <path :d="HEART_PATH" transform="scale(0.12) translate(-3.5 -3)" fill="var(--coral)" stroke="var(--ink)" stroke-width="2" vector-effect="non-scaling-stroke" />
          </g>
        </template>
        <!-- Cookies: plain with chips; the wizard's wears a hat; the starry one is night-blue with stars, and twinkles -->
        <template v-else-if="item.kind === 'cookie'">
          <circle r="0.36" fill="#C98A4B" stroke="var(--ink)" stroke-width="2" vector-effect="non-scaling-stroke" />
          <circle v-for="(c, i) in CHIPS" :key="i" :cx="c[0]" :cy="c[1]" r="0.055" fill="#4A2A12" />
        </template>
        <template v-else-if="item.kind === 'wizard'">
          <g class="beat-throb">
            <circle cy="0.08" r="0.32" fill="#C98A4B" stroke="var(--ink)" stroke-width="2" vector-effect="non-scaling-stroke" />
            <circle v-for="(c, i) in CHIPS.slice(0, 3)" :key="i" :cx="c[0]" :cy="c[1] + 0.1" r="0.05" fill="#4A2A12" />
            <path d="M -0.26 -0.1 L 0.02 -0.5 L 0.24 -0.12 Z" fill="var(--lavender)" stroke="var(--ink)" stroke-width="1.5" vector-effect="non-scaling-stroke" />
            <path d="M -0.32 -0.1 H 0.3" stroke="var(--lavender)" stroke-width="0.07" />
            <circle cx="0.04" cy="-0.28" r="0.035" fill="var(--sun)" />
          </g>
        </template>
        <template v-else-if="item.kind === 'starry'">
          <circle r="0.37" fill="#1C2466" stroke="var(--sun)" stroke-width="2" vector-effect="non-scaling-stroke" />
          <g class="twinkle">
            <polygon v-for="(c, i) in CHIPS" :key="i" :points="tinyStar(c[0], c[1])" fill="var(--sun)" />
          </g>
        </template>
        <!-- Power-ups and the totem -->
        <g v-else :class="{ 'beat-throb': item.kind === 'totem' }"><PowerIcon :kind="item.kind" /></g>
      </g>
    </g>

    <!-- A starry cookie bursts into stars -->
    <g v-for="b in state.bursts" :key="`burst${b.id}`" :transform="`translate(${b.x + 0.5} ${b.y + 0.5})`">
      <g v-for="(d, i) in BURST" :key="i" class="burst-star" :style="{ '--dx': `${d[0]}px`, '--dy': `${d[1]}px`, '--spin': `${d[2]}deg` }">
        <polygon :points="tinyStar(0, 0, 0.22)" fill="var(--sun)" />
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
          x="-0.38" y="-0.38" width="0.76" height="0.76"
          fill="var(--peach)" stroke="var(--ink)" stroke-width="2" vector-effect="non-scaling-stroke"
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
      v-for="(run, i) in runs" :key="`o${i}`"
      :points="run" fill="none" stroke="var(--ink)" stroke-width="0.84"
      stroke-linecap="square" stroke-linejoin="miter"
    />
    <polyline
      v-for="(run, i) in runs" :key="`b${i}`"
      :points="run" fill="none" :stroke="doubled ? 'var(--sun)' : 'var(--sage)'" stroke-width="0.7"
      stroke-linecap="square" stroke-linejoin="miter"
    />
    <rect
      v-for="(cell, i) in state.snake.slice(1)" :key="`d${i}`"
      v-show="i % 2 === 0"
      :x="cell.x + 0.38" :y="cell.y + 0.38" width="0.24" height="0.24" fill="var(--ink)" opacity="0.45"
    />
    <circle
      v-if="shielded"
      class="shield"
      :cx="head.x + 0.5" :cy="head.y + 0.5" r="0.72"
      fill="none" stroke="var(--sky)" stroke-width="3" stroke-dasharray="5 4" vector-effect="non-scaling-stroke"
    />
    <rect
      :x="head.x + 0.06" :y="head.y + 0.06" width="0.88" height="0.88"
      fill="var(--mint)" stroke="var(--ink)" stroke-width="2" vector-effect="non-scaling-stroke"
    />
    <circle v-for="(eye, i) in eyes" :key="`e${i}`" :cx="eye.x" :cy="eye.y" r="0.08" fill="var(--ink)" />

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
          stroke="var(--ink)" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linecap="round"
        />
        <ellipse
          cx="-0.08" cy="0" rx="0.3" ry="0.32"
          fill="var(--lavender)" stroke="var(--ink)" stroke-width="2" vector-effect="non-scaling-stroke"
        />
        <path d="M -0.08 -0.3 L -0.08 0.3" stroke="var(--ink)" stroke-width="1.5" vector-effect="non-scaling-stroke" />
        <path
          class="pincer"
          d="M 0.18 -0.12 Q 0.48 -0.2 0.5 0.02 Q 0.36 -0.06 0.22 -0.02 Z"
          fill="var(--coral)" stroke="var(--ink)" stroke-width="1.5" vector-effect="non-scaling-stroke"
        />
        <path
          class="pincer bottom"
          d="M 0.18 0.12 Q 0.48 0.2 0.5 -0.02 Q 0.36 0.06 0.22 0.02 Z"
          fill="var(--coral)" stroke="var(--ink)" stroke-width="1.5" vector-effect="non-scaling-stroke"
        />
        <circle cx="0.12" cy="-0.1" r="0.05" fill="var(--ink)" />
        <circle cx="0.12" cy="0.1" r="0.05" fill="var(--ink)" />
      </g>
    </g>

    <!-- Laser strikes: a straight beam and a jagged bolt, over everything -->
    <g v-for="laser in state.lasers" :key="`s${laser.id}`">
      <template v-if="laser.struck">
        <g v-for="(beam, b) in laser.beams" :key="b" class="strike" :class="[beam.axis, laser.from]">
          <rect
            :x="beam.axis === 'col' ? beam.index - half(beam) + 0.22 : -0.25"
            :y="beam.axis === 'row' ? beam.index - half(beam) + 0.22 : -0.25"
            :width="beam.axis === 'col' ? beam.width - 0.44 : state.cols + 0.5"
            :height="beam.axis === 'row' ? beam.width - 0.44 : state.rows + 0.5"
            :fill="LASER_COLOR[laser.kind]"
          />
          <polyline :points="beam.bolt" fill="none" :stroke="laser.kind === 'gold' || laser.kind === 'white' ? 'var(--coral)' : 'var(--sun)'" stroke-width="3" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
          <rect
            :x="beam.axis === 'col' ? beam.index + 0.44 : -0.25"
            :y="beam.axis === 'row' ? beam.index + 0.44 : -0.25"
            :width="beam.axis === 'col' ? 0.12 : state.cols + 0.5"
            :height="beam.axis === 'row' ? 0.12 : state.rows + 0.5"
            fill="#fff"
          />
        </g>
      </template>
    </g>

    <!-- Floating numbers -->
    <text
      v-for="p in state.popups"
      :key="p.id"
      class="popup"
      :x="p.x + 0.5" :y="p.y"
      text-anchor="middle"
      :fill="TONE_COLOR[p.tone]"
    >{{ p.text }}</text>
  </svg>
  </div>
</template>

<style scoped>
.board-stack { position: relative; width: 100%; height: 100%; }
.board-back,
.board {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  shape-rendering: crispEdges;
}
/* The still layer gets its own layer, painted once. */
.board-back { will-change: transform; }
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
.beat-throb {
  transform-box: fill-box;
  transform-origin: center;
  animation: throb 0.6s steps(2) infinite;
}
@keyframes throb {
  50% { transform: scale(1.25); }
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
  to { fill: var(--laser); }
}
/* Green lasers slide a cell at a time as they hunt the head. */
.tracking rect { transition: x 0.12s steps(2), y 0.12s steps(2); }

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
  font-family: var(--font-pixel);
  font-size: 0.6px;
  paint-order: stroke;
  stroke: var(--ink);
  stroke-width: 0.16px;
  stroke-linejoin: round;
  animation: rise 1s steps(8) both;
}
@keyframes rise {
  from { transform: translateY(0.2px); opacity: 0; }
  20% { opacity: 1; }
  to { transform: translateY(-1.2px); opacity: 0; }
}
/* The starry cookie's stars twinkle; its burst flies out and fades. */
.twinkle { animation: twinkle 0.9s ease-in-out infinite alternate; }
@keyframes twinkle { from { opacity: 0.45; } to { opacity: 1; } }
.burst-star { animation: burst-star 0.9s var(--ease-out) both; }
@keyframes burst-star {
  from { transform: translate(0, 0) rotate(0deg) scale(1.2); opacity: 1; }
  to { transform: translate(var(--dx), var(--dy)) rotate(var(--spin)) scale(0.3); opacity: 0; }
}
</style>
