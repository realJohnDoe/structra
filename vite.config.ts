import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages project site: https://realjohndoe.github.io/structra/
  base: '/structra/',
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
})
