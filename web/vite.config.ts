import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';
import { KERASI, devWithoutCsp, kerasiOffline } from './build/kerasi.ts';
import { notices } from './build/notices.ts';

export default defineConfig({
  base: '/',
  plugins: [
    kerasiOffline(),
    devWithoutCsp(),
    react(),
    notices({
      manifest: fileURLToPath(new URL('../Cargo.toml', import.meta.url)),
      crate: 'strings-wasm',
      kerasi: KERASI,
    }),
    VitePWA({
      injectRegister: false,
      registerType: 'autoUpdate',
      manifest: {
        name: 'Kerasi Strings',
        short_name: 'Strings',
        description: 'A string workbench that runs in your browser tab.',
        theme_color: '#F9F0EC',
        background_color: '#F9F0EC',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{html,js,css,wasm,woff2,svg,png,txt}'],
        // The engine with the Unicode name table is about 500 KB gzipped
        // and only `\N{...}` escapes need it: it is cached when first used
        globIgnores: ['**/assets/strings_wasm_names*'],
        runtimeCaching: [
          {
            // Written into the service worker as is, so a literal
            urlPattern: /\/assets\/strings_wasm_names/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'unicode-names',
              // Its script and WebAssembly; older builds drop out
              expiration: { maxEntries: 2 },
            },
          },
        ],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@kerasi': KERASI,
      '@fonts': fileURLToPath(
        new URL('node_modules/@fontsource-variable', import.meta.url),
      ),
    },
    // The design system's components import React from outside web/
    dedupe: ['react', 'react-dom'],
  },
  server: {
    fs: { allow: ['..'] },
  },
  build: {
    target: 'es2022',
    // Inlined data: fonts or scripts would break the CSP; ship files
    assetsInlineLimit: 0,
    // Every browser that runs the app supports modulepreload
    modulePreload: { polyfill: false },
  },
  worker: {
    format: 'es',
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'app',
          environment: 'jsdom',
          setupFiles: ['src/test/setup.ts'],
          include: ['src/**/*.test.{ts,tsx}'],
        },
      },
      {
        extends: true,
        test: {
          name: 'build',
          environment: 'node',
          include: ['build/**/*.test.ts', 'scripts/**/*.test.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      // Bootstrap and worker glue run only in a browser; the end-to-end
      // tests cover them
      exclude: [
        'src/wasm/**',
        'src/test/**',
        'src/**/*.test.{ts,tsx}',
        'src/main.tsx',
        'src/engine/engine.worker.ts',
        'src/engine/testing.ts',
      ],
    },
  },
});
