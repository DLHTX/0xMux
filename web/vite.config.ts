import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import monacoEditor from '@tomjs/vite-plugin-monaco-editor'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    monacoEditor({ local: true }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify('0.1.0'),
  },
  server: {
    host: true,
    proxy: {
      '/api': 'http://127.0.0.1:1235',
      '/ws': {
        target: 'ws://127.0.0.1:1235',
        ws: true,
      },
    },
  },
})
