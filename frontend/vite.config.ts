import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// /api is proxied to the FastAPI backend, so the browser never talks to TinyFish directly.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Non-default ports so this can run next to other Vite/uvicorn projects.
  server: {
    port: 5180,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:8100',
    },
  },
})
