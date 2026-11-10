import { expect, test, type Page } from '@playwright/test'

// Import lines, selection highlighting and the details card (#40), at phone width.
test.use({ viewport: { width: 390, height: 844 } })

const icicle = (page: Page) => page.getByTestId('icicle')
const block = (page: Page, name: string) => icicle(page).getByRole('button', { name, exact: true })
const details = (page: Page) => page.getByRole('region', { name: 'Details' })
const lines = (page: Page, which = '') => page.locator(`[data-testid=import-lines] path${which}`)
const twice = async (page: Page, name: string) => {
  await block(page, name).click()
  await block(page, name).click()
}

test('with nothing selected the explanation shows; selecting a block replaces it with the details card', async ({ page }) => {
  await page.goto('./?repo=flask&lambda=0.45')
  const explain = page.getByText(/Lines are imports between blocks; they rise to the lowest group containing both ends/)
  await expect(explain).toBeVisible()
  await expect(details(page)).toHaveCount(0)

  await block(page, '{globals, wrappers, …}').click()
  await expect(explain).toHaveCount(0)
  await expect(details(page)).toBeVisible()
})

test('a selected group\'s card shows its files, subgroups, and imports within, to and from outside', async ({ page }) => {
  await page.goto('./?repo=flask&lambda=0.45')
  await block(page, '{globals, wrappers, …}').click()
  const card = details(page)
  await expect(card.getByRole('heading', { level: 2 })).toHaveText('{globals, wrappers, …}')
  await expect(card).toContainText('(repo root)')
  await expect(card).toContainText('34 files')
  await expect(card).toContainText('4 subgroups · 24 files direct')
  await expect(card).toContainText('104 imports within')
  await expect(card).toContainText('→ 12 to outside')
  await expect(card).toContainText('← 13 from outside')
  await expect(card.getByRole('region', { name: 'Children' })).toContainText('{cli, __main__, …}')
  // No k and no cost numbers anywhere.
  await expect(card).not.toContainText(/\bk\b|cost|nats/i)

  await block(page, 'tutorial/').click()
  await expect(card).toContainText('9 files')
  await expect(card).toContainText('12 imports within')
  await expect(card).toContainText('→ 5 to outside')
  await expect(card).toContainText('← 0 from outside')
})

test('no card shows k or cost numbers', async ({ page }) => {
  const noTheory = /\bk\b|cost|nats/i
  await page.goto('./?repo=flask&lambda=0.60')
  for (const name of ['tests/ · 23 of 41 here', 'docs/conf.py', '+2 more · 2 files']) {
    await block(page, name).click()
    await expect(details(page)).toBeVisible()
    await expect(details(page)).not.toContainText(noTheory)
  }
})

test('a file\'s card lists what it imports and what imports it', async ({ page }) => {
  await page.goto('./?repo=flask&lambda=0.45')
  await block(page, '{globals, wrappers, …}').click()
  await details(page).getByRole('button', { name: 'flask/app.py', exact: true }).click()

  const card = details(page)
  await expect(card.getByRole('heading', { level: 2 })).toHaveText('flask/app.py')
  const imports = card.getByRole('region', { name: 'Imports' })
  await expect(imports.getByRole('heading')).toHaveText('Imports (13)')
  await expect(imports.getByRole('button')).toHaveCount(13)
  await expect(imports.getByRole('button', { name: 'src/flask/ctx.py', exact: true })).toBeVisible()
  await expect(imports.getByRole('button', { name: 'src/flask/wrappers.py', exact: true })).toBeVisible()
  await expect(card.getByRole('region', { name: 'Imported by' }).getByRole('heading')).toHaveText('Imported by (7)')
})

test('a partial Folder Block\'s card shows its imports, its files and how many of its files are elsewhere', async ({ page }) => {
  await page.goto('./?repo=flask&lambda=0.60')
  await block(page, 'tests/ · 23 of 41 here').click()
  const card = details(page)
  await expect(card).toContainText('23 of the folder\'s 41 files are in')
  await expect(card).toContainText('18 are elsewhere in the tree')
  await expect(card).toContainText(/\d+ imports within/)
  await expect(card).toContainText(/→ \d+ to outside/)
  await expect(card).toContainText(/← \d+ from outside/)
  await expect(card.getByRole('region', { name: 'Files' }).getByRole('button')).toHaveCount(23)
})

test('selecting a block highlights what it imports and what imports it, and dims the other lines', async ({ page }) => {
  await page.goto('./?repo=flask&lambda=0.45')
  await expect(lines(page).first()).toBeAttached()
  await expect(lines(page, ':not([data-kind=other])')).toHaveCount(0)

  await block(page, '{globals, wrappers, …}').click()
  await expect(lines(page, '[data-kind=out]').first()).toHaveAttribute('stroke', '#c8f060')
  await expect(lines(page, '[data-kind=in]').first()).toHaveAttribute('stroke', '#ff9a3c')
  await expect(lines(page, '[data-kind=other]').first()).toHaveAttribute('stroke-opacity', '0.1')
})

test('lines stay after zooming in, with dashed stubs for imports that leave the zoom', async ({ page }) => {
  await page.goto('./?repo=flask&lambda=0.45')
  await twice(page, '{flask, globals, …}')
  await twice(page, '{globals, wrappers, …}')
  await expect(block(page, 'All 83 files')).toHaveCount(0)
  await expect(lines(page, ':not([data-stub])').first()).toBeAttached()
  const stub = lines(page, '[data-stub]').first()
  await expect(stub).toHaveAttribute('stroke-dasharray', '2 3')
})
