import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages project site: https://realjohndoe.github.io/structra/.
  // PR previews override it with /structra/pr-preview/pr-<N>/ (preview.yml).
  base: process.env.BASE_PATH ?? '/structra/',
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
})
