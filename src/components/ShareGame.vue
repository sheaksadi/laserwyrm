<script setup lang="ts">
/**
 * Sharing one of your games: a short code (K7QM2X), a link that opens the
 * game ready to play, and a QR code for phones. The game is stored on the
 * server unlisted (no sign-in needed); sharing it again unchanged gives the
 * same code. Publishing it on Explore is separate, from the custom page.
 */
import { onMounted, ref } from 'vue'
import { publishDesign } from '../api'
import { compact, fingerprint, type SavedGame } from '../design'

const props = defineProps<{ game: SavedGame }>()
const emit = defineEmits<{ close: [] }>()

const slug = ref('')
const qr = ref('')
const error = ref('')
const note = ref('')

const link = () => `${location.origin}${location.pathname}#/d/${slug.value}`

onMounted(async () => {
  try {
    const of = fingerprint(props.game.design)
    if (props.game.share?.of === of) slug.value = props.game.share.slug
    else {
      const made = await publishDesign({ name: props.game.name, about: '', design: compact(props.game.design), listed: false })
      slug.value = made.slug
      props.game.share = { slug: made.slug, of }
    }
    const QR = await import('qrcode')
    qr.value = await QR.toString(link(), { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0B0B1A', light: '#F4F4F4' } })
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
})

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    note.value = `${what} copied`
  } catch {
    note.value = `Copy the ${what.toLowerCase()} by hand`
  }
  setTimeout(() => (note.value = ''), 2500)
}
async function shareNative() {
  try {
    await navigator.share({ title: `Laserwyrm: ${props.game.name}`, text: `Play my Laserwyrm game “${props.game.name}” (code ${slug.value})`, url: link() })
  } catch {
    /* closed, or not allowed */
  }
}
const canShare = typeof navigator !== 'undefined' && 'share' in navigator
</script>

<template>
  <div class="share" role="dialog" :aria-label="`Share ${game.name}`">
    <header>
      <h3>Share “{{ game.name }}”</h3>
      <button class="close" aria-label="Close" @click="emit('close')">✕</button>
    </header>
    <p v-if="error" class="error">{{ error }}</p>
    <p v-else-if="!slug" class="muted">Making a code…</p>
    <div v-else class="body">
      <div class="qr" aria-label="QR code for the link" role="img" v-html="qr"></div>
      <div class="info">
        <span class="label">Code</span>
        <b class="code">{{ slug }}</b>
        <span class="label">Link</span>
        <span class="link">{{ link() }}</span>
        <div class="buttons">
          <button class="tool" @click="copy(slug, 'Code')">Copy code</button>
          <button class="tool" @click="copy(link(), 'Link')">Copy link</button>
          <button v-if="canShare" class="tool" @click="shareNative">Share…</button>
        </div>
        <p class="muted">{{ note || 'Anyone with the code, link or QR can play it. Change the game and share again for a new code.' }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.share { display: grid; gap: 10px; padding: 12px 14px; border: 2px solid var(--mint); border-radius: 12px; background: var(--bg-off); }
header { display: flex; justify-content: space-between; align-items: center; }
h3 { margin: 0; font-size: 17px; font-weight: 400; text-transform: uppercase; color: var(--text); }
.close { width: 30px; height: 30px; border: 2px solid var(--border); border-radius: 8px; background: none; color: var(--text-dim); }
.close:hover { border-color: var(--sage); color: var(--text); }
.body { display: grid; grid-template-columns: auto 1fr; gap: 14px; align-items: start; }
.qr { width: 150px; height: 150px; padding: 4px; border-radius: 8px; background: #F4F4F4; }
.qr :deep(svg) { display: block; width: 100%; height: 100%; }
.info { display: grid; gap: 4px; min-width: 0; }
.label { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }
.code { font-family: var(--font-pixel); font-size: 18px; font-weight: 400; letter-spacing: 0.12em; color: var(--sun); user-select: all; }
.link { overflow-wrap: anywhere; font-size: 15px; color: var(--sky); user-select: all; }
.buttons { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.tool { padding: 5px 10px; border: 2px solid var(--border); border-radius: 8px; background: var(--bg); font-size: 15px; text-transform: uppercase; color: var(--text-dim); }
.tool:hover { border-color: var(--sage); color: var(--text); }
.muted { margin: 0; font-size: 14px; color: var(--text-muted); }
.error { margin: 0; color: var(--coral); }
@media (max-width: 520px) { .body { grid-template-columns: 1fr; } }
.tool:focus-visible, .close:focus-visible { outline: 3px solid var(--sun); outline-offset: 2px; }
</style>
