import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react(),

      // PWA — selfDestroying=true durante v1. Cambiar a false para activar SW offline
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        selfDestroying: true,
        manifest: {
          name: 'GF Colaboradores',
          short_name: 'GF Tropa',
          description: 'Portal interno Grupo Frío — Colaboradores',
          theme_color: '#15499B',
          background_color: '#030811',
          display: 'standalone',
          orientation: 'portrait',
          scope: '/',
          start_url: '/',
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          runtimeCaching: [
            {
              // Las llamadas a n8n NUNCA se cachean — siempre en vivo
              urlPattern: /^https:\/\/car12los023\.app\.n8n\.cloud\//,
              handler: 'NetworkOnly'
            }
          ]
        }
      })
    ],

    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version)
    },

    server: {
      port: 5173,
      proxy: {
        '/api-n8n': {
          target: env.VITE_N8N_WEBHOOK_URL || 'https://car12los023.app.n8n.cloud/webhook',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api-n8n/, '')
        }
      }
    },

    build: {
      outDir: 'dist',
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'react-router-dom']
          }
        }
      }
    }
  }
})
