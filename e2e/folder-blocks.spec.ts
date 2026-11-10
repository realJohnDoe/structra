import { expect, test, type Page } from '@playwright/test'

// Folder Blocks, "+N more" and the tile grid (#39), at phone width.
test.use({ viewport: { width: 390, height: 844 } })

const icicle = (page: Page) => page.getByTestId('icicle')
const block = (page: Page, name: string) => icicle(page).getByRole('button', { name, exact: true })
const twice = async (page: Page, name: string) => {
  await block(page, name).click()
  await block(page, name).click()
}

test('Folder Blocks read "N of M here" when partial and "all N" when complete', async ({ page }) => {
  await page.goto('./?repo=flask&lambda=0.60')
  await expect(block(page, 'tests/ · 23 of 41 here')).toContainText('23 of 41 here')

  await twice(page, 'tutorial/')
  await expect(block(page, 'tests/ · all 5')).toContainText('all 5')
  await expect(block(page, 'flaskr/ · all 4')).toContainText('all 4')
})

test('a single-file folder is drawn as the file itself', async ({ page }) => {
  await page.goto('./?repo=flask&lambda=0.60')
  await expect(block(page, 'docs/conf.py')).toHaveAttribute('data-kind', 'file')
  await expect(icicle(page).getByRole('button', { name: /^docs\// })).toHaveCount(1)
})

for (const repo of ['flask', 'django']) {
  test(`no "+1 more" is ever drawn in ${repo}`, async ({ page }) => {
    for (let s = 0; s <= 100; s += 5) {
      const lambda = (s / 100).toFixed(2)
      await page.goto(`./?repo=${repo}&lambda=${lambda}`)
      await expect(icicle(page).getByRole('button').first()).toHaveAccessibleName(/^All \d+ files$/)
      await expect(icicle(page).getByRole('button', { name: /^\+1 more/ }), `λ ${lambda}`).toHaveCount(0)
    }
  })
}

test('"+N more" opens as blocks, re-bucketed by folder, when its contents fit', async ({ page }) => {
  await page.goto('./?repo=flask&lambda=0.60')
  await twice(page, '+2 more · 2 files')
  await expect(page.getByTestId('tile-grid')).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toHaveText(/› \+2 more$/)
  await expect(icicle(page).locator('[data-kind=file]')).toHaveCount(2)
})

test('"+N more" opens into a tile grid when its contents don\'t fit, and a group tile zooms in on the second tap', async ({ page }) => {
  await page.goto('./?repo=django&lambda=0.30')
  await twice(page, '+300 more · 1066 files')
  const grid = page.getByTestId('tile-grid')
  await expect(grid).toBeVisible()
  await expect(icicle(page).locator('.grid-header')).toContainText('+300 more')
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toHaveText(/› \+300 more$/)

  // Tiles keep the tree's order: the larger widget_tests/ group comes first.
  const tile = grid.getByRole('button', { name: 'widget_tests/', exact: true }).first()
  await tile.click()
  await expect(tile).toHaveAttribute('aria-pressed', 'true')
  await tile.click()
  await expect(grid).toHaveCount(0)
  await expect(icicle(page).getByRole('button').first()).toHaveAccessibleName('widget_tests/')
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toHaveText(/› widget_tests\/$/)
})

test('in flask at λ 0.45, the root\'s largest child group is leftmost and group blocks show "N files"', async ({ page }) => {
  await page.goto('./?repo=flask&lambda=0.45')
  await expect(icicle(page).getByRole('button').first()).toHaveAccessibleName('All 83 files')
  const blocks = await icicle(page)
    .getByRole('button')
    .evaluateAll((els) =>
      els.map((el) => {
        const b = el as HTMLElement
        return {
          kind: b.dataset.kind,
          top: parseFloat(b.style.top),
          left: parseFloat(b.style.left),
          width: b.getBoundingClientRect().width,
          title: b.title,
          text: b.innerText,
        }
      }),
    )
  const filesOf = (title: string) => Number(/ · (\d+) files$/.exec(title)![1])
  const rowOne = blocks.filter((b) => b.top === 46).sort((a, b) => a.left - b.left)
  const groups = rowOne.filter((b) => b.kind === 'group')
  expect(rowOne[0].kind).toBe('group')
  expect(filesOf(rowOne[0].title)).toBe(Math.max(...groups.map((g) => filesOf(g.title))))

  // Every group block wide enough for a second line shows it; narrower ones carry it in their title.
  for (const g of blocks.filter((b) => b.kind === 'group')) {
    expect(g.title).toMatch(/ · \d+ files$/)
    if (g.width >= 44) expect(g.text).toContain(`${filesOf(g.title)} files`)
  }
  expect(blocks.filter((b) => b.kind === 'group' && b.width >= 44).length).toBeGreaterThan(2)
})
