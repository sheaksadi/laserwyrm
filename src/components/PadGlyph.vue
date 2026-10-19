<script setup lang="ts">
/**
 * A controller button, drawn the way the connected controller labels it:
 * Xbox letters and colours, or PlayStation shapes.
 */
import { computed } from 'vue'
import { pad } from '../gamepad'

const props = defineProps<{ button: 'a' | 'b' | 'rt' | 'start' | 'back' | 'dpad' | 'stick' }>()

const ps = computed(() => pad.kind === 'playstation')
const LABELS = {
  xbox: { rt: 'RT', start: 'MENU', back: 'VIEW', stick: 'LS' },
  playstation: { rt: 'R2', start: 'OPTIONS', back: 'SHARE', stick: 'L' },
} as const
/** The face button's colour: Xbox A green, B red; PlayStation Cross blue, Circle red. */
const ring = computed(() => (props.button === 'a' ? (ps.value ? '#7FA8FF' : '#5CE65C') : '#FF5566'))
const label = computed(() => {
  const set = LABELS[pad.kind]
  return props.button in set ? set[props.button as keyof typeof set] : ''
})
</script>

<template>
  <!-- Face buttons: round, coloured like the real thing -->
  <svg v-if="button === 'a' || button === 'b'" class="glyph face" viewBox="0 0 24 24" :aria-label="ps ? (button === 'a' ? 'Cross' : 'Circle') : button.toUpperCase()" role="img">
    <!-- Ringed in the button's own colour, so it reads at a glance -->
    <circle cx="12" cy="12" r="10.5" fill="#1C1C2C" :stroke="ring" stroke-width="2" />
    <template v-if="ps">
      <path v-if="button === 'a'" d="M7.5 7.5 16.5 16.5M16.5 7.5 7.5 16.5" stroke="#7FA8FF" stroke-width="2.4" stroke-linecap="square" />
      <circle v-else cx="12" cy="12" r="5" fill="none" stroke="#FF6B7A" stroke-width="2.4" />
    </template>
    <text v-else x="12" y="16.5" text-anchor="middle" font-size="13" font-family="var(--font-pixel)" :fill="button === 'a' ? '#5CE65C' : '#FF5566'">{{ button.toUpperCase() }}</text>
  </svg>
  <!-- D-pad: a plus -->
  <svg v-else-if="button === 'dpad'" class="glyph" viewBox="0 0 24 24" aria-label="D-pad" role="img">
    <path d="M8.5 2h7v6.5H22v7h-6.5V22h-7v-6.5H2v-7h6.5Z" fill="#2A2A3C" stroke="#000" stroke-width="1.5" />
    <path d="M12 4.5 13.8 7h-3.6ZM12 19.5 10.2 17h3.6ZM4.5 12 7 10.2v3.6ZM19.5 12 17 13.8v-3.6Z" fill="#B4B4CC" />
  </svg>
  <!-- Stick: a round cap with its label -->
  <span v-else-if="button === 'stick'" class="glyph stick" role="img" aria-label="Left stick">{{ label }}</span>
  <!-- Trigger: a shoulder shape -->
  <span v-else-if="button === 'rt'" class="glyph trigger" role="img" :aria-label="label">{{ label }}</span>
  <!-- Small centre buttons -->
  <span v-else class="glyph pill" role="img" :aria-label="label">{{ label }}</span>
</template>

<style scoped>
.glyph {
  display: inline-grid;
  place-items: center;
  flex: none;
  vertical-align: middle;
}
svg.glyph { width: 24px; height: 24px; }
.stick,
.trigger,
.pill {
  height: 22px;
  border: 1px solid #000;
  background: linear-gradient(#3A3A50, #24243A);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18), 0 2px 0 #000;
  font-family: var(--font-code);
  font-size: 15px;
  line-height: 1;
  color: #E8E8F4;
}
.stick {
  width: 24px;
  height: 24px;
  border-radius: 999px;
  box-shadow: inset 0 0 0 3px #2E2E44, inset 0 0 0 4px #4A4A64, 0 2px 0 #000;
}
.trigger {
  min-width: 30px;
  padding: 0 6px;
  border-radius: 10px 10px 4px 4px;
}
.pill {
  padding: 0 7px;
  border-radius: 999px;
  font-size: 13px;
}
</style>
