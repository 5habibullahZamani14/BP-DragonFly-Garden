/*
 * vite.config.ts — Vite configuration for the BP Dragonfly Garden frontend.
 *
 * I created this file to set up the development server, proxy API endpoints,
 * and enable the componentTagger plugin for automatic component documentation.
 * The configuration uses a dynamic host (`::`) for IPv6 compatibility and runs on
 * port 3000. Proxies forward UI requests to the backend server (port 5000) for
 * menu, orders, tables, payments, and management routes.
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 3000,
    hmr: {
      overlay: false,
    },
    proxy: {
      '/menu': 'http://localhost:5000',
      '/orders': 'http://localhost:5000',
      '/tables': 'http://localhost:5000',
      '/payments': 'http://localhost:5000',
      '/management': 'http://localhost:5000'
    }
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'DragonFly Garden',
        short_name: 'DragonFly',
        description: 'DragonFly Garden Management & Ordering',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
