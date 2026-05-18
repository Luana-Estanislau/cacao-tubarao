import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Cação é Tubarão',
        short_name: 'CaçãoApp',
        description: 'Mapeamento colaborativo de venda de tubarões no Brasil',
        theme_color: '#001a2c',
        background_color: '#001a2c',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'shark-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'shark-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
})