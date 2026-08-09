import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { PlayerManager } from './player-manager'
import { registerHandlers, setAllVisible } from './ipc-handlers'
import { LayoutStore } from '../core/layout/store'
import { CookieStore } from './cookie-store'
import { WindowTracker } from './window-tracker'
import { getWindowRect } from './win32'
import { createTray } from './tray'
import { registerShortcuts, bindShortcutCleanup } from './shortcuts'
import { safeStorage } from 'electron'

const dirname = import.meta.dirname
const isWin = process.platform === 'win32'

export function binDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'bin')
    : path.join(app.getAppPath(), 'resources', 'bin')
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
  if (process.env.ELECTRON_RENDERER_URL) {
    panel.loadURL(process.env.ELECTRON_RENDERER_URL + '/panel/')
  } else {
    panel.loadFile(path.join(dirname, '../renderer/panel/index.html'))
  }
}

app.whenReady().then(() => {
  const userData = app.getPath('userData')
  const layout = new LayoutStore(path.join(userData, 'layout.json'))
  const cookies = new CookieStore(
    path.join(userData, 'cookies.bin'),
    (s) => safeStorage.encryptString(s),
    (b) => safeStorage.decryptString(b)
  )
  pm = new PlayerManager({
    mpvPath: path.join(binDir(), isWin ? 'mpv.exe' : 'mpv'),
    ytDlpDir: binDir(),
    inputConfPath: path.join(app.getAppPath(), 'resources', 'wheel-volume.conf')
  })
  const hwnds = new Map<number, number>()
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
  tracker.start()

  const deps = { pm, layout, cookies, hwnds, notesDir: path.join(userData, 'notes') }
  registerHandlers(deps)

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

app.on('before-quit', () => {
  void pm?.stopAll()
})

app.on('window-all-closed', () => {
  // 常驻托盘：面板关闭不退出，只有托盘「退出」才 app.exit
  if (!isWin && process.platform !== 'darwin') app.quit()
})
