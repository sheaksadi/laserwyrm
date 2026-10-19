<script setup lang="ts">
/**
 * The game-over card: the score big, the high-score entry when the run
 * makes the board (or its place, once posted), a few numbers, play again,
 * and the game's share code.
 */
import { ref } from 'vue'
import { play, state } from '../game'
import { account } from '../account'
import { custom, shared } from '../design'
import { go } from '../app/route'
import { scoreEntry, submitScore } from '../app/scoreEntry'
import { openAccount, openEditor, toMainMenu } from '../app/ui'
import GameCode from './GameCode.vue'

/** A just-made login code: copied, and whether its explanation is open. */
const copied = ref(false)
const info = ref(false)
async function copyCode() {
  if (!scoreEntry.newLoginCode) return
  await navigator.clipboard.writeText(scoreEntry.newLoginCode).catch(() => {})
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}
</script>

<template>
  <div class="overlay">
    <div class="card card-over">
      <button class="close card-close" aria-label="Main menu" @click="toMainMenu">✕</button>
      <!-- Joined players' runs go up by themselves: a quiet tag in the corner says so -->
      <p v-if="scoreEntry.entry.phase === 'saved'" class="posted-tag">✓ posted</p>
      <p v-else-if="scoreEntry.entry.phase === 'sending' && account.name" class="posted-tag sending">posting…</p>
      <header class="over-head">
        <p class="over-label">Game over · the snake {{ state.reason }}<template v-if="state.mode === 'hardcore'"> · hardcore</template></p>
        <p class="final" :class="{ best: state.newBest }">{{ state.score }}</p>
        <p v-if="state.newBest" class="new-best blink">New best!</p>
        <p v-else class="best-line">best {{ state.best }}<template v-if="state.cheated"> · {{ state.usedCheats ? 'cheats on' : 'changed game' }}, not counted</template></p>
        <p v-if="shared.slug" class="best-line">{{ shared.name }}<template v-if="!state.usedCheats"> · on its own board</template></p>
      </header>
      <p v-if="scoreEntry.signedOutNote" class="entry-note">{{ scoreEntry.signedOutNote }}</p>

      <!-- A run that makes the board can be signed and sent, replay and all -->
      <form
        v-if="scoreEntry.entry.phase === 'open' || scoreEntry.entry.phase === 'sending' || scoreEntry.entry.phase === 'failed'"
        class="entry"
        @submit.prevent="submitScore()"
      >
        <p class="entry-label">You made the high scores<template v-if="account.name"> as <b>{{ account.name }}</b></template></p>
        <template v-if="!account.name">
          <input v-model="scoreEntry.name" class="field" maxlength="12" placeholder="Username (optional)" aria-label="Username, optional" autocomplete="nickname" />
        </template>
        <button class="btn btn-submit" type="submit" :disabled="scoreEntry.entry.phase === 'sending'"><span class="text-trim">{{ scoreEntry.entry.phase === 'sending' ? '…' : account.name ? 'Try again' : 'Join' }}</span></button>
        <p v-if="!account.name" class="entry-note">Join and your runs go on the board by themselves. No name? One is made up.</p>
        <p v-if="scoreEntry.entry.phase === 'failed'" class="entry-error">{{ scoreEntry.entry.error }}</p>
        <p v-if="scoreEntry.nameSuggestions.length" class="suggest">
          Free:
          <button v-for="n in scoreEntry.nameSuggestions" :key="n" type="button" class="suggestion" @click="submitScore(n)">{{ n }}</button>
        </p>
      </form>
      <div v-else-if="scoreEntry.entry.phase === 'saved'" class="placed">
        <p class="placed-rank"><span class="hash">#</span>{{ scoreEntry.entry.rank }}</p>
        <p class="placed-label">{{ account.name }} on the {{ state.mode === 'hardcore' ? 'hardcore ' : '' }}high scores</p>
        <div class="placed-buttons">
          <button class="btn btn-mini" @click="go(`#/scores/${scoreEntry.entry.id}`)"><span class="text-trim">Board</span></button>
          <button class="btn btn-mini btn-watch" @click="go(`#/watch/${scoreEntry.entry.id}`)"><span class="text-trim">Watch</span></button>
          <button class="btn btn-mini btn-line" @click="openAccount"><span class="text-trim">Manage</span></button>
        </div>
      </div>
      <div v-if="scoreEntry.newLoginCode" class="login-code">
        <p class="login-label">Your login code</p>
        <div class="login-row">
          <code>{{ scoreEntry.newLoginCode }}</code>
          <button class="icon-btn" :aria-label="copied ? 'Copied' : 'Copy the login code'" :title="copied ? 'Copied' : 'Copy'" @click="copyCode">
            <svg v-if="!copied" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></svg>
            <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l5 5 9-10" /></svg>
          </button>
          <button class="icon-btn info" :aria-expanded="info" aria-label="What is this?" title="What is this?" @click="info = !info">i</button>
        </div>
        <p v-if="info" class="login-info">This code is your account: it signs you in on any device, and anyone who has it can. There is no password or email to get it back, so keep it somewhere safe.</p>
        <p class="login-note">Find it again in <button class="link-btn" @click="openAccount">Settings → Account</button></p>
      </div>

      <dl class="tally">
        <div><dt>level</dt><dd>{{ state.level + 1 }}</dd></div>
        <div><dt>longest</dt><dd>{{ state.longest }}</dd></div>
        <div><dt>fruit</dt><dd>{{ state.stats.eaten }}</dd></div>
        <div><dt>cuts</dt><dd>{{ state.stats.cuts }}</dd></div>
      </dl>
      <div class="over-buttons" :class="{ three: custom.on }">
        <button class="btn" data-nav-first @click="play()"><span class="text-trim">Play again</span></button>
        <!-- In custom play: back to the editor to tweak it, instead of only another go -->
        <button v-if="custom.on" class="btn btn-custom" @click="openEditor"><span class="text-trim">Editor</span></button>
        <button class="btn btn-line" @click="go('#/scores')"><span class="text-trim">Scores</span></button>
      </div>
      <!-- Every game gets a code to share -->
      <p class="game-line">
        <template v-if="scoreEntry.gameCode">game <GameCode :code="scoreEntry.gameCode" link /></template>
        <template v-else-if="scoreEntry.gameSave === 'saving'">saving game…</template>
        <template v-else>could not save this game: {{ scoreEntry.saveError }}</template>
      </p>
    </div>
  </div>
</template>

<style scoped src="../styles/cards.css"></style>
