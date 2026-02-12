import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify('0.1.0'),
  },
  server: {
    host: true,
    proxy: {
      '/api': 'http://127.0.0.1:1234',
      '/ws': {
        target: 'ws://127.0.0.1:1234',
        ws: true,
      },
    },
  },
})
