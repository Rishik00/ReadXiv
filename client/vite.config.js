import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** Ensure /p/:id hits the SPA in dev (arxiv ids contain dots). */
function paperPathSpaFallback() {
  return {
    name: 'paper-path-spa-fallback',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next()
        const pathOnly = (req.url || '').split('?')[0]
        if (pathOnly.startsWith('/p/')) req.url = '/index.html'
        next()
      })
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), paperPathSpaFallback()],
  server: {
    port: 5173,
    host: true, // Listen on 0.0.0.0 so iPad/other devices on LAN can connect
    proxy: {
      '/api': {
        target: 'http://localhost:7474',
        changeOrigin: true
      }
    }
  }
})
