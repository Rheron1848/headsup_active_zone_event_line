import { app, BrowserWindow, safeStorage, screen } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { PlayerManager } from './player-manager'
import { registerHandlers, setAllVisible } from './ipc-handlers'
import { LayoutStore } from '../core/layout/store'
import { PresetStore } from '../core/presets/store'
import { tileRects } from '../core/layout/tiling'
import { CookieStore } from './cookie-store'
import { WindowTracker } from './window-tracker'
import { OverlayManager } from './overlay-manager'
import { getWindowRect } from './win32'
import { createTray } from './tray'
import { registerShortcuts, bindShortcutCleanup } from './shortcuts'

const dirname = import.meta.dirname
const isWin = process.platform === 'win32'

export function binDir(): string {
  if (app.isPackaged) return path.join(process.resourcesPath, 'bin')

  // 非打包态：dev 模式、本机调试、Playwright 直接启动 out/main/index.js 时路径不同，逐个尝试
  const candidates = [
    path.join(app.getAppPath(), 'resources', 'bin'),
    path.join(dirname, '..', '..', 'resources', 'bin'),
    path.join(process.cwd(), 'resources', 'bin')
  ]
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir
  }
  // 兜底：返回最可能的 dev 路径，让后续 spawn 报出明确错误
  return candidates[0]
}

let panel: BrowserWindow | null = null
let pm: PlayerManager | null = null
let allVisible = true

function createPanel(): void {
  panel = new BrowserWindow({
    width: 960,
    height: 640,
    title: 'livewall 控制面板',
    webPreferences: {
      preload: path.join(dirname, '../preload/panel.mjs'),
      sandbox: false
    }
  })
  panel.on('closed', () => (panel = null))
  panel.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    const label = ['debug', 'info', 'warn', 'error'][level] ?? String(level)
    console.log(`[renderer:${label}] ${sourceId}:${line} ${message}`)
  })
  if (process.env.NODE_ENV === 'development' || process.env.ELECTRON_RENDERER_URL) {
    panel.webContents.openDevTools({ mode: 'detach' })
  }
  if (process.env.ELECTRON_RENDERER_URL) {
    panel.loadURL(process.env.ELECTRON_RENDERER_URL + '/panel/')
  } else {
    panel.loadFile(path.join(dirname, '../renderer/panel/index.html'))
  }
}

/** 首次启动：全部槽位还是占位 rect 时，按主屏工作区做一次 6 格平铺 */
function ensureInitialTiling(layout: LayoutStore): void {
  const l = layout.load()
  const placeholder = l.slots.every((s) => s.rect.x === 0 && s.rect.y === 0)
  if (!placeholder) return
  const wa = screen.getPrimaryDisplay().workArea
  const rects = tileRects(6, { x: wa.x, y: wa.y, w: wa.width, h: wa.height })
  for (const s of l.slots) layout.updateSlot(s.index, { rect: rects[s.index] })
}

app.whenReady().then(() => {
  const userData = process.env.LIVEWALL_USER_DATA ?? app.getPath('userData')
  const layout = new LayoutStore(path.join(userData, 'layout.json'))
  ensureInitialTiling(layout)
  const presets = new PresetStore(path.join(userData, 'presets.json'))

  // safeStorage 在部分 Linux 环境不可用：退化为不加密（仅开发机；Windows 上用 DPAPI）
  const canEncrypt = safeStorage.isEncryptionAvailable()
  const cookies = new CookieStore(
    path.join(userData, 'cookies.bin'),
    (s) => (canEncrypt ? safeStorage.encryptString(s) : Buffer.from(s, 'utf8')),
    (b) => (canEncrypt ? safeStorage.decryptString(b) : b.toString('utf8'))
  )

  pm = new PlayerManager({
    mpvPath: path.join(binDir(), isWin ? 'mpv.exe' : 'mpv'),
    ytDlpDir: binDir(),
    inputConfPath: path.join(app.getAppPath(), 'resources', 'wheel-volume.conf')
  })
  const hwnds = new Map<number, number>()
  const overlays = new OverlayManager()
  const tracker = new WindowTracker(
    (hwnd) => {
      if (!isWin) return null
      try {
        return getWindowRect(hwnd)
      } catch {
        return null
      }
    },
    (slot, rect) => layout.updateSlot(slot, { rect })
  )
  tracker.onRectChanged = (slot, r) => overlays.move(slot, r)
  tracker.start()

  const deps = {
    pm,
    layout,
    presets,
    cookies,
    hwnds,
    tracker,
    overlays,
    notesDir: path.join(userData, 'notes')
  }
  registerHandlers(deps)

  // 滚轮直接改的是 mpv 内部音量：每 2s 回读，同步进布局持久化
  setInterval(() => {
    const l = layout.load()
    for (const s of l.slots) {
      if (!s.visible) continue // 隐藏时被强制静音，不回读
      const player = pm?.get(s.index)
      if (!player) continue
      void player.ipc
        .getProperty<number>('volume')
        .then((v) => {
          const vol = Math.round(v)
          if (vol !== s.volume) layout.updateSlot(s.index, { volume: vol, muted: vol === 0 })
        })
        .catch(() => {})
    }
  }, 2000)

  const toggleAll = (): void => {
    allVisible = !allVisible
    setAllVisible(deps, allVisible)
  }
  createTray(toggleAll, () => {
    if (panel) panel.focus()
    else createPanel()
  })
  registerShortcuts({
    onToggleAll: toggleAll,
    onNoteSlot: (slot) => {
      if (panel) {
        panel.show()
        panel.focus()
        panel.webContents.send('hotkey-note', slot)
      }
    }
  })
  bindShortcutCleanup()

  createPanel()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createPanel()
  })
})

// 退出前先把 mpv 全部收掉（app.quit 才会触发 before-quit）
let quitting = false
app.on('before-quit', (e) => {
  if (quitting) return
  quitting = true
  e.preventDefault()
  void pm?.stopAll().finally(() => app.quit())
})

app.on('window-all-closed', () => {
  // 测试模式下窗口全关就退出，方便自动化
  if (process.env.LIVEWALL_USER_DATA || (!isWin && process.platform !== 'darwin')) app.quit()
})
