import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Marcus Vale',
        short_name: 'Marcus',
        description: 'Private voice-first executive assistant for Victor Igboekwe',
        theme_color: '#000000',
        icons: [
          {
            src: '/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  server: {
    port: 3000,
    proxy: {
      // The key comes from the shell that starts Vite: MARCUS_API_KEY=... npm run dev
      '/api': {
        target: 'http://localhost:8002',
        rewrite: (path) => path.replace(/^\/api/, ''),
        headers: { 'X-API-Key': process.env.MARCUS_API_KEY ?? '' }
      }
    }
  }
})
