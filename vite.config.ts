import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { localSceneSavePlugin } from './dev/localSceneSave.ts'
import { HEAD_PATH, MODEL_REVISION } from './src/data/headDelivery.ts'

export default defineConfig(({ mode }) => ({
  base: mode === 'github-pages' ? '/alex-abyss-studio/' : './',
  plugins: [
    react(),
    localSceneSavePlugin(),
    {
      name: 'preload-studio-head',
      transformIndexHtml: {
        order: 'pre',
        handler: () => [{
          tag: 'link',
          attrs: { rel: 'preload', as: 'fetch', crossorigin: 'anonymous', href: `/${HEAD_PATH}?assetRevision=${MODEL_REVISION}` },
          injectTo: 'head',
        }],
      },
    },
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
}))
