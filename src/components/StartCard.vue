<script setup lang="ts">
/**
 * The start screen's card: the title and its splash, Press start,
 * multiplayer, hardcore, custom, settings, high scores and the account.
 */
import { HEART_PATH } from '../game'
import { account } from '../account'
import { custom, shared } from '../design'
import { pad } from '../gamepad'
import { go } from '../app/route'
import { activeGameName, openAccount, openBriefing, openCustom, openMultiplayer, openSettings, playNormal, splash } from '../app/ui'
import Mascot from './Mascot.vue'
</script>

<template>
  <div class="overlay">
    <div class="card card-start">
      <Mascot class="corner-mascot" />
      <header class="hello">
        <h1 class="title">
          Laserwyrm<span class="brand-dot">.</span>
          <!-- A yellow splash, tilted and pulsing, a new one each time the menu comes back -->
          <span :key="splash" class="splash" aria-hidden="true">{{ splash }}</span>
        </h1>

      </header>
      <div class="start-buttons">
      <!-- Which game Press start plays: the main one, or a custom one (yours, or shared) -->
      <div v-if="custom.on" class="game-switch" role="radiogroup" aria-label="Which game">
        <button class="switch" role="radio" aria-checked="false" @click="playNormal">Main game</button>
        <button class="switch on" role="radio" aria-checked="true" :title="shared.slug ? `${shared.name} by ${shared.author}` : 'Your custom game'" @click="openCustom">
          Custom: {{ shared.slug ? shared.name : activeGameName }}
        </button>
      </div>
      <button class="btn btn-start" @click="openBriefing('normal')">
        <span class="start-face">
          <svg class="blink" viewBox="-0.5 -0.5 8 7" width="16" height="14" aria-hidden="true"><path :d="HEART_PATH" fill="#FFFFFF" stroke="var(--ink)" stroke-width="0.8" /></svg>
          <span class="text-trim">{{ custom.on ? 'Play custom' : 'Press start' }}</span>
        </span>
      </button>
      <!-- Against friends: a room with a code -->
      <button class="btn btn-multi" @click="openMultiplayer()">
        <span class="start-face">
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 2h4v4H3zM9 2h4v4H9zM1 8h6v2h1V8h6v6h-2v-4h-1v4H5v-4H4v4H1z" fill="currentColor" /></svg>
          <span class="text-trim">Multiplayer</span>
        </span>
      </button>
      <!-- Hardcore and custom, half each -->
      <div class="mode-row">
        <button
          class="btn btn-hardcore"
          title="Hardcore: walls kill, no hearts back, no pauses. Its own high scores."
          aria-label="Play hardcore"
          @click="openBriefing('hardcore')"
        >
          <span class="start-face">
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4 2h8v1h1v1h1v5h-1v1h-1v1h-1v3H5v-3H4v-1H3V9H2V4h1V3h1z" fill="currentColor" /><path d="M5 6h2v2H5zM9 6h2v2H9zM7 9h2v1H7zM6 12h1v1H6zM9 12h1v1H9z" fill="var(--ink)" /></svg>
            <span class="text-trim">Hardcore</span>
          </span>
        </button>
        <button class="btn btn-custom" :class="{ on: custom.on }" title="Your own levels, and ones other players made" @click="openCustom">
          <span class="start-face">
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM10 9h3v2h2v3h-2v-2h-3z" fill="currentColor" /></svg>
            <span class="text-trim">Custom</span>
          </span>
        </button>
      </div>
      <!-- Settings, and the account (a face: claim a name, or your games) -->
      <div class="start-row">
        <button class="btn btn-line" @click="openSettings">
          <span class="start-face">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M6 1h4v2h1l1-1 2 2-1 1v1h2v4h-2v1l1 1-2 2-1-1h-1v2H6v-2H5l-1 1-2-2 1-1V9H1V5h2V4L2 3l2-2 1 1h1z" fill="currentColor" /><path d="M6 6h4v4H6z" fill="var(--ink)" /></svg>
            <span class="text-trim">Settings</span>
          </span>
        </button>
        <button class="btn btn-line" @click="go('#/scores')"><span class="text-trim">High scores</span></button>
        <button
          class="btn btn-account"
          :class="{ signed: account.name }"
          :title="account.name ? `${account.name}: your account and games` : 'Claim a name'"
          :aria-label="account.name ? `Account: ${account.name}` : 'Claim a name'"
          @click="openAccount"
        >
          <svg viewBox="0 0 16 16" width="22" height="22" aria-hidden="true">
            <path d="M5 1h6v1h2v2h1v8h-1v2h-2v1H5v-1H3v-2H2V4h1V2h2z" fill="currentColor" />
            <path d="M5 6h2v2H5zM9 6h2v2H9zM5 10h1v1h4v-1h1v1h-1v1H6v-1H5z" fill="var(--ink)" />
          </svg>
        </button>
      </div>
      </div>
      <p v-if="!pad.connected" class="pad-note">
        <svg viewBox="0 0 24 16" width="24" height="16" aria-hidden="true"><path d="M5 1h14a4 4 0 0 1 4 4l1 7a3 3 0 0 1-5 2l-3-3H8l-3 3a3 3 0 0 1-5-2l1-7a4 4 0 0 1 4-4Z" fill="currentColor" /><path d="M6 5v4M4 7h4" stroke="var(--bg)" stroke-width="1.6" /><circle cx="17" cy="5.5" r="1.1" fill="var(--bg)" /><circle cx="19" cy="8" r="1.1" fill="var(--bg)" /></svg>
        Controller supported · press any button to connect
      </p>
    </div>
  </div>
</template>

<style scoped src="../styles/cards.css"></style>
