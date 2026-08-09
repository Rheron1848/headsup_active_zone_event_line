import { test, expect, type ElectronApplication, type Page, _electron as electron } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import os from 'node:os'
import { resolveBilibili } from '../src/core/resolver/bilibili'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const electronPath = path.join(root, 'node_modules/electron/dist/electron.exe')

const ROOMS = [
  'https://live.bilibili.com/1967216004?live_from=71002',
  'https://live.bilibili.com/510?live_from=71002',
  'https://live.bilibili.com/21457197?live_from=71002',
  'https://live.bilibili.com/2136976?live_from=73001'
]

let userDataDir: string

test.describe('livewall streaming', () => {
  test.setTimeout(60000)
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async () => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'livewall-streaming-'))
    app = await electron.launch({
      executablePath: electronPath,
      args: [path.join(root, 'out/main/index.js')],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        LIVEWALL_USER_DATA: userDataDir
      }
    })
    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)
  })

  test.afterAll(async () => {
    await app.close()
    fs.rmSync(userDataDir, { recursive: true, force: true })
  })

  test('starts 4 bilibili streams and tiles them', async () => {
    // 直播间可能下线，先探测可用性，失败则跳过本次直播流验收
    const liveRooms: string[] = []
    for (const room of ROOMS) {
      try {
        await resolveBilibili(room)
        liveRooms.push(room)
      } catch (e) {
        console.warn(`跳过：${room} 未开播或解析失败`)
      }
    }
    if (liveRooms.length < 4) {
      test.skip(`仅 ${liveRooms.length}/4 个房间可用，跳过直播流验收`)
      return
    }

    for (let i = 0; i < liveRooms.length; i++) {
      await page.locator(`[data-testid="slot-input-${i}"]`).fill(liveRooms[i])
      await page.locator(`[data-testid="slot-start-${i}"]`).click()
      // Wait for startStream to resolve and UI to update
      await page.waitForTimeout(5000)
    }

    // Verify each slot shows a stream title instead of '空闲'
    for (let i = 0; i < liveRooms.length; i++) {
      await expect(page.locator(`[data-testid="slot-status-${i}"]`)).not.toHaveText('空闲', { timeout: 10000 })
    }

    // Tile 4 windows
    await page.locator('button:has-text("平铺4")').click()
    await page.waitForTimeout(1000)

    const layoutPath = path.join(userDataDir, 'layout.json')
    const layout = JSON.parse(fs.readFileSync(layoutPath, 'utf8'))
    expect(layout.slots).toHaveLength(6)
    for (let i = 0; i < liveRooms.length; i++) {
      expect(layout.slots[i].rect.w).toBeGreaterThan(0)
      expect(layout.slots[i].rect.h).toBeGreaterThan(0)
      expect(layout.slots[i].source).not.toBeNull()
    }

    // Stop all streams
    for (let i = 0; i < liveRooms.length; i++) {
      await page.locator(`[data-testid="slot-stop-${i}"]`).click()
      await page.waitForTimeout(200)
    }
  })
})
