import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

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

export default defineConfig(({ command }) => ({
  base: './',
  plugins: [react(), paperPathSpaFallback()],
  // React Scan is useful while running Vite locally, but must not become part
  // of the shipped Electron/web bundle.
  resolve: {
    alias: command === 'build'
      ? { 'react-scan': path.resolve(__dirname, 'src/lib/reactScanProductionShim.js') }
      : {},
  },
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
}))
