// Takes the README stills: flask at λ 0.20, 0.45 and 0.80, at phone width.
//
//   npm run readme:stills
//
// Writes docs/images/flask-<λ>.png. Not part of the e2e suite: the default
// Playwright config doesn't match this file, and CI never runs it.
import { devices, expect, test } from '@playwright/test'
import { join } from 'node:path'

const { viewport, deviceScaleFactor, isMobile, hasTouch, userAgent } = devices['Pixel 7']
test.use({ viewport, deviceScaleFactor, isMobile, hasTouch, userAgent })

const images = join(import.meta.dirname, '..', 'docs', 'images')

for (const lambda of ['0.20', '0.45', '0.80']) {
  test(`flask at λ ${lambda}`, async ({ page }) => {
    await page.goto(`./?repo=flask&lambda=${lambda}`)
    await expect(page.getByRole('slider', { name: 'Balance λ' })).toHaveValue(String(Number(lambda)))
    await expect(page.getByTestId('icicle').getByRole('button').first()).toHaveAccessibleName('All 83 files')
    await page.screenshot({ path: join(images, `flask-${lambda}.png`), animations: 'disabled', caret: 'hide' })
  })
}
