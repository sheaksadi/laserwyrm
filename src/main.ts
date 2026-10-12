import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

createApp(App).mount('#app')

// Dev only: lets test scripts read and nudge the game.
if (import.meta.env.DEV) {
  void import('./game').then((game) => Object.assign(window, { __snake: game }))
}
