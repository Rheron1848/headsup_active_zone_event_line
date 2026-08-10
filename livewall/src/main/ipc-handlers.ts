import { ipcMain, screen, shell } from 'electron'
import type { BrowserWindow } from 'electron'
import type { Rect, Source } from '../shared/types'
import { resolveSource } from '../core/resolver'
import { tileRects } from '../core/layout/tiling'
import type { LayoutStore } from '../core/layout/store'
import type { PresetStore } from '../core/presets/store'
import type { CookieStore } from './cookie-store'
import { createLoginQr, pollLoginQr } from '../core/danmaku/login'
import { sendDanmaku } from '../core/danmaku/bilibili'
import { Throttler } from '../core/danmaku/throttle'
import { appendNote } from '../core/notes/writer'
import { clampVolume, type PlayerManager } from './player-manager'
import type { WindowTracker } from './window-tracker'
import type { OverlayManager } from './overlay-manager'
import { findWindowByTitle, setWindowRect, showWindow } from './win32'

export interface HandlerDeps {
  pm: PlayerManager
  layout: LayoutStore
  presets: PresetStore
  cookies: CookieStore
  hwnds: Map<number, number>
  tracker: WindowTracker
  overlays: OverlayManager
  notesDir: string
  /** 取面板窗口（可能已关闭），用于把布局变更推送给渲染端 / panel window getter, may be null */
  getPanel: () => BrowserWindow | null
}

/** 布局变更后推送给面板，保证工具条/热键等入口发起的改动同步回 UI
 *  Push layout changes to the panel so actions from overlay/hotkeys stay in sync */
function broadcastLayout(deps: HandlerDeps): void {
  const win = deps.getPanel()
  if (win && !win.isDestroyed()) win.webContents.send('layout:changed', deps.layout.load())
}

const isWin = process.platform === 'win32'

/** win32 调用在非 Windows 平台（开发机）上静默跳过 */
function tryWin32<T>(fn: () => T): T | null {
  if (!isWin) return null
  try {
    return fn()
  } catch {
    return null
  }
}

const throttlers = new Map<number, Throttler>()

async function findHwndWithRetry(title: string, tries = 10): Promise<number | null> {
  for (let i = 0; i < tries; i++) {
    const h = tryWin32(() => findWindowByTitle(title))
    if (h) return h
    await new Promise((r) => setTimeout(r, 100))
  }
  return null
}

/** 流起来后的窗口侧接线：登记 hwnd、开始跟踪、创建工具条覆盖窗 */
async function attachWindow(deps: HandlerDeps, slot: number): Promise<void> {
  const rect = deps.layout.load().slots.find((s) => s.index === slot)?.rect
  if (!rect) return
  const hwnd = await findHwndWithRetry(`livewall-slot-${slot}`)
  if (hwnd) {
    deps.hwnds.set(slot, hwnd)
    deps.tracker.registerHwnd(slot, hwnd)
    tryWin32(() => setWindowRect(hwnd, rect))
  }
  deps.overlays.create(slot, rect)
}

function detachWindow(deps: HandlerDeps, slot: number): void {
  deps.hwnds.delete(slot)
  deps.tracker.unregisterHwnd(slot)
  deps.overlays.destroy(slot)
}

export function setAllVisible(deps: HandlerDeps, visible: boolean): void {
  const l = deps.layout.load()
  for (const s of l.slots) {
    const hwnd = deps.hwnds.get(s.index)
    if (hwnd) tryWin32(() => showWindow(hwnd, visible))
    const player = deps.pm.get(s.index)
    if (player) {
      // 隐藏时静音，显示时恢复该槽布局里的音量
      const v = visible ? (s.muted ? 0 : s.volume) : 0
      void player.ipc.setProperty('volume', clampVolume(v)).catch(() => {})
    }
    deps.layout.updateSlot(s.index, { visible })
  }
  deps.overlays.setAllVisible(visible)
  broadcastLayout(deps)
}

export function registerHandlers(deps: HandlerDeps): void {
  // mpv 崩溃自愈：重拉成功则重新接线窗口；彻底失败则清理并标记槽位空闲
  deps.pm.onExit = (slot, restarted) => {
    if (restarted) {
      void attachWindow(deps, slot)
    } else {
      detachWindow(deps, slot)
      deps.layout.updateSlot(slot, { source: null })
      broadcastLayout(deps)
    }
  }

  ipcMain.handle(
    'stream:start',
    async (_e, slot: number, source: Source, rect: Rect, volume: number) => {
      const stream = await resolveSource(source) // 未开播/解析失败会 throw，渲染端展示
      await deps.pm.start(slot, stream, rect, volume)
      // B 站：把解析出的真实 roomId 回写到槽位源，供发弹幕使用
      const savedSource =
        stream.platform === 'bilibili' ? { ...source, roomId: stream.roomId } : source
      deps.layout.updateSlot(slot, { source: savedSource, rect, volume, visible: true })
      await attachWindow(deps, slot)
      broadcastLayout(deps)
      return { title: stream.title, roomId: stream.roomId }
    }
  )

  ipcMain.handle('stream:stop', async (_e, slot: number) => {
    await deps.pm.stop(slot)
    detachWindow(deps, slot)
    deps.layout.updateSlot(slot, { source: null })
    broadcastLayout(deps)
  })

  ipcMain.handle('stream:setVolume', async (_e, slot: number, v: number) => {
    const vol = clampVolume(v)
    const player = deps.pm.get(slot)
    if (player) await player.ipc.setProperty('volume', vol)
    deps.layout.updateSlot(slot, { volume: vol, muted: vol === 0 })
    broadcastLayout(deps)
    return vol
  })

  ipcMain.handle('stream:setVisible', (_e, slot: number, visible: boolean) => {
    const hwnd = deps.hwnds.get(slot)
    if (hwnd) tryWin32(() => showWindow(hwnd, visible))
    const player = deps.pm.get(slot)
    if (player) {
      const s = deps.layout.load().slots.find((x) => x.index === slot)
      const v = visible ? (s?.muted ? 0 : (s?.volume ?? 60)) : 0
      void player.ipc.setProperty('volume', v).catch(() => {})
    }
    deps.layout.updateSlot(slot, { visible })
    if (!visible) deps.overlays.get(slot)?.hide()
    else deps.overlays.get(slot)?.showInactive()
    broadcastLayout(deps)
  })

  ipcMain.handle('stream:setAllVisible', (_e, visible: boolean) => {
    setAllVisible(deps, visible)
  })

  ipcMain.handle('layout:get', () => deps.layout.load())

  ipcMain.handle('layout:tile', (_e, count: 1 | 2 | 3 | 4 | 5 | 6) => {
    const wa = screen.getPrimaryDisplay().workArea
    const area: Rect = { x: wa.x, y: wa.y, w: wa.width, h: wa.height }
    const rects = tileRects(count, area)
    const l = deps.layout.load()
    for (const s of l.slots.slice(0, count)) {
      const r = rects[s.index]
      const hwnd = deps.hwnds.get(s.index)
      if (hwnd) tryWin32(() => setWindowRect(hwnd, r))
      deps.layout.updateSlot(s.index, { rect: r })
    }
    broadcastLayout(deps)
    return deps.layout.load()
  })

  ipcMain.handle('presets:list', () => deps.presets.list())
  ipcMain.handle('presets:add', (_e, p) => deps.presets.add(p))
  ipcMain.handle('presets:update', (_e, id: string, patch) => deps.presets.update(id, patch))
  ipcMain.handle('presets:remove', (_e, id: string) => deps.presets.remove(id))

  ipcMain.handle('danmaku:send', async (_e, slot: number, msg: string) => {
    const s = deps.layout.load().slots.find((x) => x.index === slot)
    if (!s?.source || s.source.platform !== 'bilibili' || !s.source.roomId) {
      return { ok: false, message: '该槽位没有 B 站直播源' }
    }
    const cookies = deps.cookies.load()
    if (!cookies) return { ok: false, message: '未登录' }
    let th = throttlers.get(slot)
    if (!th) throttlers.set(slot, (th = new Throttler(3000)))
    if (!th.tryAcquire()) {
      return { ok: false, message: `太快了，${Math.ceil(th.retryAfterMs() / 1000)} 秒后再试` }
    }
    return sendDanmaku(cookies, s.source.roomId, msg)
  })

  ipcMain.handle('note:add', async (_e, slot: number, text: string) => {
    const s = deps.layout.load().slots.find((x) => x.index === slot)
    const label = s?.source?.label ?? `slot${slot}`
    let pos: number | null = null
    const player = deps.pm.get(slot)
    if (player) {
      try {
        pos = await player.ipc.getProperty<number>('time-pos')
      } catch {
        pos = null
      }
    }
    return appendNote(deps.notesDir, label, new Date(), pos, text)
  })

  ipcMain.handle('note:openDir', () => shell.openPath(deps.notesDir))

  ipcMain.handle('auth:loginStart', () => createLoginQr())

  ipcMain.handle('auth:loginPoll', async (_e, qrcodeKey: string) => {
    const r = await pollLoginQr(qrcodeKey)
    if (r.status === 'confirmed' && r.cookies) deps.cookies.save(r.cookies)
    return { status: r.status }
  })

  ipcMain.handle('auth:status', () => {
    const c = deps.cookies.load()
    return { loggedIn: !!(c && c.SESSDATA && c.bili_jct) }
  })

  // 工具条覆盖窗的鼠标交互切换（preload 用 send，不等待回复）
  ipcMain.on('overlay:interactive', (_e, slot: number, interactive: boolean) => {
    deps.overlays.setInteractive(slot, interactive)
  })
}
