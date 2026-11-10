import { expect, test } from '@playwright/test'

test('the first visit shows flask at λ 0.45, rooted at "All 83 files"', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('combobox', { name: 'Example Repo' })).toHaveValue('flask')
  await expect(page.getByRole('slider', { name: 'Balance λ' })).toHaveValue('0.45')
  await expect(page.getByTestId('icicle').getByRole('button').first()).toHaveAccessibleName('All 83 files')
})

test('the repo menu lists the Example Repos as owner/name, in Example Repo List order', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('combobox', { name: 'Example Repo' }).getByRole('option')).toHaveText([
    'pallets/flask',
    'psf/requests',
    'numpy/numpy',
    'django/django',
  ])
})

test('dragging the λ slider changes the summary', async ({ page }) => {
  await page.goto('./')
  const summary = page.getByTestId('summary')
  await expect(summary).toHaveText('12 groups · depth 5')

  const slider = page.getByRole('slider', { name: 'Balance λ' })
  const box = (await slider.boundingBox())!
  const y = box.y + box.height / 2
  await slider.hover()
  await page.mouse.down()
  await page.mouse.move(box.x - 20, y, { steps: 10 })
  await page.mouse.up()

  await expect(slider).toHaveValue('0')
  await expect(summary).toHaveText('1 group · depth 1')
})

test('the URL carries the repo and λ, and round-trips', async ({ page }) => {
  await page.goto('./?repo=flask&lambda=0.30')
  const slider = page.getByRole('slider', { name: 'Balance λ' })
  await expect(slider).toHaveValue('0.3')
  await expect(page.getByTestId('summary')).toHaveText('8 groups · depth 4')

  await slider.focus()
  await page.keyboard.press('ArrowRight')
  await expect(page).toHaveURL(/\?repo=flask&lambda=0\.31$/)

  await page.reload()
  await expect(slider).toHaveValue('0.31')
})

test('a tap selects a block, a second tap zooms in, and the breadcrumb zooms out', async ({ page }) => {
  await page.goto('./?repo=flask&lambda=0.45')
  const icicle = page.getByTestId('icicle')
  const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' })
  const block = (name: string) => icicle.getByRole('button', { name, exact: true })

  await block('{flask, globals, …}').click()
  await expect(block('{flask, globals, …}')).toHaveAttribute('aria-pressed', 'true')
  await expect(block('All 83 files')).toBeVisible()

  await block('{flask, globals, …}').click()
  await expect(block('All 83 files')).toHaveCount(0)
  await expect(block('celery/')).toBeVisible()
  await expect(breadcrumb).toHaveText(/All 83 files.*\{flask, globals, …\}/)

  await breadcrumb.getByRole('button', { name: 'All 83 files' }).click()
  await expect(block('All 83 files')).toBeVisible()
  await expect(breadcrumb.getByRole('button')).toHaveCount(0)
})

test.describe('at phone width', () => {
  test.use({ viewport: { width: 375, height: 740 } })

  for (const lambda of ['0.00', '0.45', '1.00']) {
    test(`the page doesn't scroll sideways at λ ${lambda}`, async ({ page }) => {
      await page.goto(`./?repo=flask&lambda=${lambda}`)
      await expect(page.getByTestId('icicle').getByRole('button').first()).toHaveAccessibleName('All 83 files')
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow).toBeLessThanOrEqual(0)
    })
  }
})
