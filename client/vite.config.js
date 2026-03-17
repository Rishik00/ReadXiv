import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
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
