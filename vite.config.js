import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // When running `npm run dev`, proxy /api/* calls to Vercel CLI dev server
    // Run: `vercel dev` (port 3000) alongside `npm run dev` for full local dev.
    // Or just use `vercel dev` alone — it serves both the Vite frontend and the
    // serverless functions together on http://localhost:3000
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
