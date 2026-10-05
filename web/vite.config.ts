import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg'],
      // registered by src/lib/sw.ts instead: it also reloads the page once a new
      // version takes over, without which the installed app on a phone goes on
      // serving the shell it cached weeks ago. Still a file, not an inline
      // <script>, so the CSP can stay script-src 'self'.
      injectRegister: null,
      // makes the browser send credentials with the manifest request; without it
      // "add to home screen" breaks when a proxy (basic auth) sits in front
      useCredentials: true,
      manifest: {
        name: 'Friseur',
        short_name: 'Friseur',
        description: 'Session, revenue and performance tracking for a hair salon',
        theme_color: '#0f172a',
        background_color: '#f8fafc',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // the app is useless offline (needs the API), so keep caching minimal:
        // precache the shell, always go to network for /api
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            // matched against the full URL, so anchoring with ^ would never hit
            urlPattern: /\/api\//,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
