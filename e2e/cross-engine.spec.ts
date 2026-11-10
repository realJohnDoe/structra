import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { build, type Rolldown } from 'vite'

/**
 * Bundles `cross-engine.entry.ts` (the app's Example Repo loading plus the tree
 * core's snapshot) so it runs in Chromium without shipping a test hook in the app.
 */
async function bundleEntry(): Promise<string> {
  const out = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      lib: { entry: 'e2e/cross-engine.entry.ts', formats: ['iife'], name: 'crossEngine' },
    },
  })
  const [{ output }] = out as Rolldown.RolldownOutput[]
  return output.map((chunk) => (chunk.type === 'chunk' ? chunk.code : '')).join('\n')
}

type CrossEngine = Record<'flaskSnapshot' | 'uploadedFlaskSnapshot', () => Promise<string>>

for (const [title, entry] of [
  ["the browser's trees read off flask's shipped artifact", 'flaskSnapshot'],
  ["the browser's trees built from an uploaded flask Graph File", 'uploadedFlaskSnapshot'],
] as const) {
  test(`${title} match Node's 101-step snapshot`, async ({ page }) => {
    const code = await bundleEntry()
    await page.goto('./') // any page of the app's origin: crypto.subtle needs a secure context
    await page.addScriptTag({ content: code })
    const browser = await page.evaluate(
      (entry) => (window as unknown as { crossEngine: CrossEngine }).crossEngine[entry](),
      entry,
    )
    expect(browser).toBe(readFileSync('examples/flask.snapshot.json', 'utf8'))
  })
}
