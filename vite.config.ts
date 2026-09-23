import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // GitHub Pages project site: https://xaxist.github.io/phonics-adventure/
  base: '/phonics-adventure/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true
      },
      manifest: {
        name: 'Phonics Adventure',
        short_name: 'Phonics',
        description: 'A playful learn-to-read app with 276 lessons across 7 worlds.',
        theme_color: '#6d4ae0',
        background_color: '#f6f5fb',
        display: 'standalone',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ]
})
