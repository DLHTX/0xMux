import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify('0.1.0'),
  },
  server: {
    port: 1234,
    proxy: {
      '/api': 'http://localhost:1235',
      '/ws': {
        target: 'http://localhost:1235',
        ws: true,
      },
    },
  },
})
