<script setup lang="ts">
/**
 * A game's code, like BORK#4821, as a chip: click to copy it; the link
 * button next to it copies a URL that opens the replay straight away.
 */
import { ref } from 'vue'
import { codeForUrl } from '../api'

const props = defineProps<{ code: string; link?: boolean }>()
const copied = ref<'' | 'code' | 'link'>('')
let timer = 0

async function copy(what: 'code' | 'link') {
  const text = what === 'code' ? props.code : `${location.origin}${location.pathname}#/game/${codeForUrl(props.code)}`
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // Older or locked-down browsers: a hidden textarea and the copy command.
    const area = document.createElement('textarea')
    area.value = text
    document.body.append(area)
    area.select()
    document.execCommand('copy')
    area.remove()
  }
  copied.value = what
  clearTimeout(timer)
  timer = window.setTimeout(() => (copied.value = ''), 1400)
}
</script>

<template>
  <span class="game-code">
    <button class="code" :title="`Copy ${code}`" @click.stop="copy('code')">
      <span class="text">{{ copied === 'code' ? 'copied!' : code }}</span>
      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square"><path d="M9 9h11v11H9zM5 15H4V4h11v1" /></svg>
    </button>
    <button v-if="link" class="link" :title="copied === 'link' ? 'Link copied' : 'Copy a link to this replay'" @click.stop="copy('link')">
      <svg v-if="copied !== 'link'" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square"><path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1" /></svg>
      <svg v-else viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square"><path d="M5 12l5 5 9-10" /></svg>
    </button>
  </span>
</template>

<style scoped>
.game-code { display: inline-flex; align-items: stretch; gap: 3px; vertical-align: middle; }
.code, .link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 1px 7px;
  border: 2px solid var(--border);
  background: var(--bg-off);
  font-family: var(--font-code);
  font-size: 16px;
  line-height: 1.2;
  letter-spacing: 0.04em;
  color: var(--mint);
}
.code .text { min-width: 9ch; text-align: left; }
.code:hover, .link:hover { border-color: var(--mint); color: var(--text); }
.code:focus-visible, .link:focus-visible { outline: 3px solid var(--sun); outline-offset: 2px; }
</style>
