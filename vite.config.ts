import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { localSceneSavePlugin } from './dev/localSceneSave.ts'

export default defineConfig(({ mode }) => ({
  base: mode === 'github-pages' ? '/alex-abyss-studio/' : './',
  plugins: [react(), localSceneSavePlugin()],
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
}))
