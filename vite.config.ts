/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    // Vite 8 roadmap: tsconfigPaths — built-in TS path resolution
    // Not yet available in 8.0.x; alias above handles @/ paths for now
  },
  server: {
    // Vite 8 roadmap: forwardConsole — pipes browser console to dev terminal
    // Not yet available in 8.0.x; planned for agentic dev workflows
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('@xterm')) return 'xterm';
          if (id.includes('react-dom') || id.includes('react/')) return 'react-vendor';
        },
      },
    },
    chunkSizeWarningLimit: 500,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
    css: true,
  },
})
