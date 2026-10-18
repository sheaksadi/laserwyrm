<script setup lang="ts">
/**
 * A slider for one setting that can follow the curve or be set by hand. It
 * shows the value in play; moving it sets it; "auto" puts it back to
 * following the curve (or stock).
 */
defineProps<{
  name: string
  hint?: string
  /** The value in play. */
  value: number
  /** Set by hand (a value is set), or following along (undefined). */
  own: boolean
  range: readonly [number, number, number]
  show: (v: number) => string
  /** Always set by hand: no "auto". */
  fixed?: boolean
}>()
const emit = defineEmits<{ set: [value: number | undefined] }>()
</script>

<template>
  <label class="knob" :class="{ own: own && !fixed }">
    <span class="knob-name"><b>{{ name }}</b> <template v-if="hint">{{ hint }}</template></span>
    <span class="knob-right">
      <button v-if="own && !fixed" type="button" class="auto" title="Follow the curve again" @click.prevent="emit('set', undefined)">auto</button>
      <span class="knob-value">{{ show(value) }}</span>
    </span>
    <input
      class="slider"
      type="range"
      :min="range[0]"
      :max="range[1]"
      :step="range[2]"
      :value="value"
      :aria-label="name"
      @input="emit('set', Number(($event.target as HTMLInputElement).value))"
    />
  </label>
</template>

<style scoped>
.knob {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 2px 8px;
  padding: 6px 10px 8px;
  border: 2px solid transparent;
  border-radius: 10px;
  background: var(--bg-warm);
}
.knob.own { border-color: #3A2F5A; }
.knob-name { font-size: 15px; text-transform: uppercase; color: var(--text-muted); }
.knob-name b { margin-right: 4px; font-weight: 400; color: var(--text); }
.knob-right { display: flex; align-items: center; gap: 8px; }
.knob-value { font-family: var(--font-pixel); font-size: 9px; color: var(--text-muted); }
.own .knob-value { color: var(--sun); }
.auto {
  padding: 0 6px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: none;
  font-size: 13px;
  text-transform: uppercase;
  color: var(--text-muted);
}
.auto:hover { border-color: var(--sage); color: var(--text); }
.slider { grid-column: 1 / -1; width: 100%; accent-color: var(--sage); }
.auto:focus-visible { outline: 3px solid var(--sun); outline-offset: 2px; }
</style>
