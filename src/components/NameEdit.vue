<script setup lang="ts">
/**
 * Your name, with a way to change it. Joined: renaming changes the account
 * (and the high scores under it), and the old name is free for anyone else
 * straight away. Not joined: a name for now, and a Join button that makes
 * it yours.
 */
import { ref } from 'vue'
import { account } from '../account'
import { ApiError, claimName, renameAccount } from '../api'
import { mpName } from '../multiplayer'

const editing = ref(false)
const draft = ref('')
const busy = ref(false)
const error = ref('')
const suggestions = ref<string[]>([])

function start() {
  draft.value = account.name ?? ''
  error.value = ''
  suggestions.value = []
  editing.value = true
}
async function run(task: () => Promise<unknown>) {
  busy.value = true
  error.value = ''
  suggestions.value = []
  try {
    await task()
    editing.value = false
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
    if (err instanceof ApiError && Array.isArray(err.extra.suggestions)) suggestions.value = err.extra.suggestions as string[]
  } finally {
    busy.value = false
  }
}
const save = (name = draft.value.trim()) => name && name !== account.name ? run(() => renameAccount(name)) : (editing.value = false)
const join = (name = mpName.value.trim()) => run(() => claimName(name))
</script>

<template>
  <div class="name-edit">
    <template v-if="account.name">
      <div v-if="!editing" class="line">
        <b class="name">{{ account.name }}</b>
        <button class="act" @click="start">Rename</button>
      </div>
      <form v-else class="line" @submit.prevent="save()">
        <input v-model="draft" class="field" maxlength="12" aria-label="New name" autocomplete="nickname" spellcheck="false" />
        <button class="act go" type="submit" :disabled="busy">Save</button>
        <button class="act" type="button" @click="editing = false">Cancel</button>
      </form>
    </template>
    <form v-else class="line" @submit.prevent="join()">
      <input v-model="mpName.value" class="field" maxlength="12" placeholder="Name (optional)" aria-label="Name" autocomplete="nickname" spellcheck="false" />
      <button class="act go" type="submit" :disabled="busy">Join</button>
    </form>
    <p v-if="!account.name" class="hint">Join to keep the name, post your scores and unlock looks. No name? One is made up for you.</p>
    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="suggestions.length" class="suggest">
      Free:
      <button v-for="n in suggestions" :key="n" type="button" class="chip" @click="account.name ? save(n) : join(n)">{{ n }}</button>
    </p>
  </div>
</template>

<style scoped>
.name-edit { display: grid; gap: 6px; }
.line { display: flex; align-items: center; gap: 6px; }
.name { flex: 1; font-family: var(--font-pixel); font-size: 12px; font-weight: 400; text-transform: uppercase; color: var(--sage); }
.field {
  flex: 1;
  min-width: 0;
  padding: 7px 10px;
  border: 2px solid var(--border);
  border-radius: 10px;
  background: var(--bg-off);
  color: var(--text);
  font: inherit;
  font-size: 18px;
}
.field:focus { outline: none; border-color: var(--sun); }
.act {
  padding: 8px 12px;
  border: 2px solid var(--border);
  border-radius: 10px;
  background: var(--bg-off);
  font-family: var(--font-pixel);
  font-size: 9px;
  text-transform: uppercase;
  color: var(--text-dim);
}
.act:hover:not(:disabled) { border-color: var(--sage); color: var(--text); }
.act.go { border-color: var(--sage); color: var(--sage); }
.act:disabled { opacity: 0.5; }
.hint { margin: 0; font-size: 14px; line-height: 1.15; text-transform: uppercase; color: var(--text-muted); }
.error { margin: 0; font-size: 15px; color: var(--coral); }
.suggest { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0; font-size: 15px; color: var(--text-muted); }
.chip { padding: 3px 8px; border: 2px solid var(--border); border-radius: 999px; background: var(--bg-off); font-size: 15px; color: var(--sage); }
.act:focus-visible, .chip:focus-visible { outline: 3px solid var(--sun); outline-offset: 2px; }
</style>
