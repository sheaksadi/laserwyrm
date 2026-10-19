<script setup lang="ts">
/**
 * The game-over card: the score big, the high-score entry when the run
 * makes the board, a few numbers, play again, and the game's share code.
 */
import { play, state } from '../game'
import { account } from '../account'
import { custom, shared } from '../design'
import { go } from '../app/route'
import { scoreEntry, submitScore } from '../app/scoreEntry'
import { openAccount, openEditor, toMainMenu } from '../app/ui'
import GameCode from './GameCode.vue'
</script>

<template>
  <div class="overlay">
    <div class="card card-over">
      <button class="close card-close" aria-label="Main menu" @click="toMainMenu">✕</button>
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
          <input v-model="scoreEntry.email" class="field" type="email" maxlength="80" placeholder="Email (optional)" aria-label="Email, optional" autocomplete="email" />
        </template>
        <button class="btn btn-submit" type="submit" :disabled="scoreEntry.entry.phase === 'sending'"><span class="text-trim">{{ scoreEntry.entry.phase === 'sending' ? '…' : account.name ? 'Try again' : 'Join' }}</span></button>
        <p v-if="!account.name" class="entry-note">Join and your runs go on the board by themselves. No name? One is made up.</p>
        <p v-if="scoreEntry.entry.phase === 'failed'" class="entry-error">{{ scoreEntry.entry.error }}</p>
        <p v-if="scoreEntry.nameSuggestions.length" class="suggest">
          Free:
          <button v-for="n in scoreEntry.nameSuggestions" :key="n" type="button" class="suggestion" @click="submitScore(n)">{{ n }}</button>
        </p>
      </form>
      <p v-else-if="scoreEntry.entry.phase === 'saved'" class="entry-done">
        Posted: {{ account.name }} is #{{ scoreEntry.entry.rank }} on the board.
        <a :href="`#/scores/${scoreEntry.entry.id}`">See the board</a> · <a :href="`#/watch/${scoreEntry.entry.id}`">Watch your run</a> · <a href="#/" @click.prevent="openAccount">Manage</a>
      </p>
      <p v-if="scoreEntry.newLoginCode" class="login-code">
        Your login code: <b>{{ scoreEntry.newLoginCode }}</b><br />
        Keep it somewhere safe; it signs you in anywhere. It is also under ☰ → Account.
      </p>

      <dl class="tally">
        <div><dt>level</dt><dd>{{ state.level + 1 }}</dd></div>
        <div><dt>longest</dt><dd>{{ state.longest }}</dd></div>
        <div><dt>fruit</dt><dd>{{ state.stats.eaten }}</dd></div>
        <div><dt>cuts</dt><dd>{{ state.stats.cuts }}</dd></div>
      </dl>
      <div class="over-buttons" :class="{ three: custom.on }">
        <button class="btn" @click="play()"><span class="text-trim">Play again</span></button>
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
