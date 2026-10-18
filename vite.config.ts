import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // In development the score API runs separately: `npm run server`.
  server: { proxy: { '/api': 'http://127.0.0.1:8787', '/mcp': 'http://127.0.0.1:8787', '/mp': { target: 'ws://127.0.0.1:8787', ws: true } } },
})
