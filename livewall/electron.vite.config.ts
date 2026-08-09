import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: { index: path.resolve(__dirname, 'src/main/index.ts') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: {
          panel: path.resolve(__dirname, 'src/preload/panel.ts'),
          overlay: path.resolve(__dirname, 'src/preload/overlay.ts')
        }
      }
    }
  },
  renderer: {
    plugins: [react()],
    root: 'src/renderer',
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: {
          panel: path.resolve(__dirname, 'src/renderer/panel/index.html'),
          overlay: path.resolve(__dirname, 'src/renderer/overlay/index.html')
        }
      }
    }
  }
})
