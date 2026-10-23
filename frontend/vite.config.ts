import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  ...(mode === 'demo'
    ? {
        // Demonstração: um só bundle (sem chunks), para virar uma página HTML única
        base: './',
        build: {
          outDir: 'dist-demo',
          rollupOptions: { output: { inlineDynamicImports: true } },
        },
      }
    : {}),
}))
