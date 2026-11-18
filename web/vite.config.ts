import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Local API (npm run api in the repo root)
    proxy: { '/api': 'http://localhost:8787' },
  },
})
