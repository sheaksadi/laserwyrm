<script setup lang="ts">
/**
 * The pause card: resume, restart, back to the editor in custom play, the
 * main menu, and full screen.
 */
import { play, reset } from '../game'
import { custom } from '../design'
import { canFullscreen, isFullscreen } from '../fullscreen'
import { pad } from '../gamepad'
import { openEditor, playNormal, toggleFullscreen, toMainMenu } from '../app/ui'
</script>

<template>
  <div class="overlay">
    <div class="card card-small">
      <p class="chrome-label">paused</p>
      <h2>Take a breath</h2>
      <button class="btn" @click="play()"><span class="text-trim">Resume</span></button>
      <!-- In custom play: straight back to the editor, the run kept paused under it -->
      <button v-if="custom.on" class="btn btn-custom" @click="openEditor"><span class="text-trim">Back to editor</span></button>
      <button class="btn btn-line" @click="reset()"><span class="text-trim">Restart</span></button>
      <!-- Quit the run: back to the start screen (reset leaves the game ready, which shows it); in custom play, or the stock game, side by side -->
      <div v-if="custom.on" class="pause-row">
        <button class="btn btn-line" @click="toMainMenu"><span class="text-trim">Main menu</span></button>
        <button class="btn btn-line" @click="playNormal"><span class="text-trim">Play main</span></button>
      </div>
      <button v-else class="btn btn-line" @click="toMainMenu"><span class="text-trim">Main menu</span></button>
      <button class="close card-close" aria-label="Resume" @click="play()">✕</button>
      <button v-if="canFullscreen()" class="btn btn-line" @click="toggleFullscreen()">
        <span class="text-trim">{{ isFullscreen ? 'Exit full screen' : 'Full screen' }}</span>
      </button>
      <p v-if="isFullscreen && !pad.connected" class="keys"><span class="keygroup"><kbd>Esc</kbd> exit full screen</span></p>
    </div>
  </div>
</template>

<style scoped src="../styles/cards.css"></style>
