import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// electron-vite auto-detects src/main/index.ts, src/preload/index.ts and
// src/renderer/index.html. Main/preload run in Node, so deps stay external
// (ffmpeg-static, ffprobe-static and hyperframes must not be bundled).
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [svelte()],
    build: {
      // keep the UI bundle small and honest
      chunkSizeWarningLimit: 600
    }
  }
})
