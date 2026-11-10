import { expect, test } from '@playwright/test'

test('?perf times the first tree and a run over every λ step, and keeps ?perf in the URL', async ({ page }) => {
  await page.goto('./?repo=react&perf')
  const readout = page.getByRole('region', { name: 'Timing' })
  await expect(readout).toContainText('facebook/react, 4445 files')
  await expect(readout).toContainText(/first tree: \d+ ms from page start/)

  await readout.getByRole('button', { name: 'Run λ 0→1' }).click()
  await expect(readout).toContainText(/redraw: median \d+ ms, max \d+ ms over 100 /, { timeout: 60_000 })
  await expect(page).toHaveURL(/\?repo=react&lambda=1\.00&perf$/)
})

test('without ?perf there is no readout', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByTestId('summary')).not.toBeEmpty()
  await expect(page.getByRole('region', { name: 'Timing' })).toHaveCount(0)
})
