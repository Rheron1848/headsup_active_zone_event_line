import { test, expect, type ElectronApplication, type Page, _electron as electron } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import os from 'node:os'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const electronPath = path.join(root, 'node_modules/electron/dist/electron.exe')

let userDataDir: string

async function launchApp(): Promise<ElectronApplication> {
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'livewall-e2e-'))
  return await electron.launch({
    executablePath: electronPath,
    args: [path.join(root, 'out/main/index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      LIVEWALL_USER_DATA: userDataDir
    }
  })
}

test.afterEach(async ({}, testInfo) => {
  if (testInfo.attachments.length) return
})

test.describe('livewall smoke', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async () => {
    app = await launchApp()
    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)
  })

  test.afterAll(async () => {
    await app.close()
    fs.rmSync(userDataDir, { recursive: true, force: true })
  })

  test('panel renders with 6 slots', async () => {
    await expect(page.locator('text=livewall 控制面板')).toBeVisible()
    for (let i = 1; i <= 6; i++) {
      await expect(page.locator(`text=槽位 ${i}`)).toBeVisible()
    }
  })

  test('preset can be added in manager and appears in all slot selectors', async () => {
    await page.locator('input[placeholder="房间号/URL/BV号"]').first().fill('114514')
    await page.locator('[data-testid="preset-add"]').click()
    await page.waitForTimeout(300)

    // slot 1 selector should show the preset
    await page.locator('[data-testid="slot-preset-0"]').selectOption({ label: '114514' })

    // slot 2 selector should also show it
    await expect(page.locator('[data-testid="slot-preset-1"] option:has-text("114514")')).toHaveCount(1)

    // preset manager should list it
    await expect(page.locator('text=114514').first()).toBeVisible()
  })

  test('tile 6 updates layout.json with 6 rects', async () => {
    await page.locator('button:has-text("平铺6")').click()
    await page.waitForTimeout(500)

    const layoutPath = path.join(userDataDir, 'layout.json')
    const layout = JSON.parse(fs.readFileSync(layoutPath, 'utf8'))
    expect(layout.slots).toHaveLength(6)
    for (const s of layout.slots) {
      expect(s.rect.w).toBeGreaterThan(0)
      expect(s.rect.h).toBeGreaterThan(0)
    }
  })
})
