/**
 * The frame-rate meter, switched on in Settings: frames per second, the 1%
 * low (the frame rate of the slowest 1% of recent frames, which shows
 * stutter an average hides), and a graph of recent frame times. It only
 * measures while shown. The choices are kept on this device.
 */
import { reactive, ref, watch } from 'vue'

function stored(key: string, fallback: boolean) {
  let start = fallback
  try {
    const value = localStorage.getItem(key)
    if (value !== null) start = value === '1'
  } catch {
    /* storage blocked: the default */
  }
  const flag = ref(start)
  watch(flag, (v) => {
    try {
      localStorage.setItem(key, v ? '1' : '0')
    } catch {
      /* storage blocked: the switch lasts this visit */
    }
  })
  return flag
}

export const showFps = stored('laserwyrm-fps', false)
export const showLow = stored('laserwyrm-fps-low', true)
export const showGraph = stored('laserwyrm-fps-graph', false)

/** Frame times kept: about ten seconds at 60 fps, enough for a steady 1% low. */
const KEEP = 600
/** The graph shows the newest of them. */
export const GRAPH_FRAMES = 120

/** Recent frame times in ms, oldest first. Not reactive: the graph reads it every frame. */
export const frames: number[] = []
/** The numbers shown, refreshed a few times a second so the text stays readable. */
export const meter = reactive({ fps: 0, low: 0 })

const listeners = new Set<() => void>()
/** Called after every measured frame (the graph redraws). */
export function onFrame(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

let raf = 0
let last = 0
let shownAt = 0

function tick(t: number) {
  raf = requestAnimationFrame(tick)
  if (last) {
    // A hidden tab pauses frames; that gap is not a slow frame.
    const ms = t - last
    if (ms < 1000) {
      frames.push(ms)
      if (frames.length > KEEP) frames.shift()
    }
  }
  last = t
  if (t - shownAt >= 250 && frames.length) {
    shownAt = t
    // Frames per second: how many of the last second's frames there were.
    let sum = 0
    let count = 0
    for (let i = frames.length - 1; i >= 0 && sum < 1000; i--) {
      sum += frames[i]!
      count++
    }
    meter.fps = Math.round((count * 1000) / sum)
    // 1% low: the average frame rate over the slowest 1% of frames kept.
    const slow = [...frames].sort((a, b) => b - a).slice(0, Math.max(1, Math.floor(frames.length / 100)))
    meter.low = Math.round(1000 / (slow.reduce((a, b) => a + b, 0) / slow.length))
  }
  for (const fn of listeners) fn()
}

watch(
  showFps,
  (on) => {
    cancelAnimationFrame(raf)
    frames.length = 0
    last = 0
    meter.fps = meter.low = 0
    if (on) raf = requestAnimationFrame(tick)
  },
  { immediate: true },
)
