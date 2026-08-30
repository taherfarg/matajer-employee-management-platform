import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    /**
     * Proxying /api to the backend keeps development same-origin, so the browser
     * never issues a CORS preflight and cookies/headers behave exactly as they
     * would behind a single domain in production.
     *
     * For a split deployment (frontend on a CDN, API elsewhere), set
     * VITE_API_URL to the absolute API URL instead - the proxy is then unused
     * and the backend CORS allowlist takes over.
     */
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
