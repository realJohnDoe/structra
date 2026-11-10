import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

const flask = { name: 'flask.graph.json', mimeType: 'application/json', buffer: readFileSync('examples/flask.graph.json') }

const menu = (page: Page) => page.getByRole('combobox', { name: 'Example Repo' })
const root = (page: Page) => page.getByTestId('icicle').getByRole('button').first()

/** Drops a file on the page the way a browser does when one is dragged in from the desktop. */
async function dropFile(page: Page, file: { name: string; text: string }) {
  const dataTransfer = await page.evaluateHandle(({ name, text }) => {
    const dt = new DataTransfer()
    dt.items.add(new File([text], name, { type: 'application/json' }))
    return dt
  }, file)
  await page.dispatchEvent('main', 'dragover', { dataTransfer })
  await page.dispatchEvent('main', 'drop', { dataTransfer })
}

test.beforeEach(async ({ page }) => {
  await page.goto('./?repo=requests&lambda=0.45')
  await expect(root(page)).toHaveAccessibleName('All 37 files')
})

test('the repo menu ends with a divider and "Your own Graph File…"', async ({ page }) => {
  await expect(menu(page).getByRole('option').last()).toHaveText('Your own Graph File…')
  await expect(menu(page).locator('hr')).toHaveCount(1)
})

test('"Your own Graph File…" in the menu uploads a Graph File and shows it like an Example Repo', async ({ page }) => {
  const chooser = page.waitForEvent('filechooser')
  await menu(page).selectOption({ label: 'Your own Graph File…' })
  await (await chooser).setFiles(flask)

  await expect(root(page)).toHaveAccessibleName('All 83 files')
  await expect(page.getByTestId('summary')).toHaveText('12 groups · depth 5')
  await expect(menu(page).locator('option:checked')).toHaveText('pallets/flask (your file)')
  await expect(page).toHaveURL(/\?lambda=0\.45$/)
})

test('dropping a Graph File anywhere on the page uploads it', async ({ page }) => {
  await dropFile(page, { name: 'flask.graph.json', text: flask.buffer.toString('utf8') })
  await expect(root(page)).toHaveAccessibleName('All 83 files')

  // The slider works on the upload as on an Example Repo.
  const slider = page.getByRole('slider', { name: 'Balance λ' })
  await slider.focus()
  for (let i = 0; i < 15; i++) await page.keyboard.press('ArrowLeft')
  await expect(page.getByTestId('summary')).toHaveText('8 groups · depth 4')
})

test('an invalid Graph File shows the schema error and the previous repo stays loaded', async ({ page }) => {
  const graph = JSON.parse(flask.buffer.toString('utf8'))
  graph.meta.version = 2
  await dropFile(page, { name: 'old.graph.json', text: JSON.stringify(graph) })

  const alert = page.getByRole('alert')
  await expect(alert).toContainText('old.graph.json')
  await expect(alert).toContainText('another structra version')
  await expect(alert).toContainText('/meta must NOT have additional properties')
  await expect(root(page)).toHaveAccessibleName('All 37 files')
  await expect(menu(page)).toHaveValue('requests')
})

test('a file that is not JSON is rejected the same way', async ({ page }) => {
  const chooser = page.waitForEvent('filechooser')
  await menu(page).selectOption({ label: 'Your own Graph File…' })
  await (await chooser).setFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })

  await expect(page.getByRole('alert')).toContainText('not a valid Graph File')
  await expect(root(page)).toHaveAccessibleName('All 37 files')
})
