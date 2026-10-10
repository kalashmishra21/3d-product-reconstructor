import { defineConfig, mergeConfig } from 'vite'
import base from './vite.config.js'

// Separate build entry: the prototype is not imported by the production app.
export default mergeConfig(base, defineConfig({
  build: {
    outDir: '.review/stage12a/build',
    rolldownOptions: { input: 'stage12a.html' },
  },
  server: { watch: { ignored: ['**/.review/**', '**/.playwright-cli/**'] } },
}))
