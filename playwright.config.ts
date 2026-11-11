import { defineConfig } from '@playwright/test'

// Seam 3 (spec #35): the built app, served as GitHub Pages would serve it.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173/structra/',
    trace: 'off',
  },
  webServer: {
    command: 'pnpm run build && pnpm exec vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/structra/',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
