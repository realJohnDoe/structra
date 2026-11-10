import { defineConfig } from '@playwright/test'
import base from './playwright.config.ts'

// The README stills (e2e/readme.stills.ts): the same harness as the e2e tests,
// but run by hand with `npm run readme:stills`, never in CI.
export default defineConfig({
  ...base,
  testMatch: '*.stills.ts',
  fullyParallel: false,
  reporter: 'list',
})
