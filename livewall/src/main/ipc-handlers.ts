import { ipcMain, screen, shell } from 'electron'
import type { Rect, Source } from '../shared/types'
import { resolveSource } from '../core/resolver'
import { tileRects } from '../core/layout/tiling'
import type { LayoutStore } from '../core/layout/store'
import type { CookieStore } from './cookie-store'
import { createLoginQr, pollLoginQr } from '../core/danmaku/login'
import { sendDanmaku } from '../core/danmaku/bilibili'
import { Throttler } from '../core/danmaku/throttle'
import { appendNote } from '../core/notes/writer'
import { clampVolume, type PlayerManager } from './player-manager'
import { findWindowByTitle, setWindowRect, showWindow } from './win32'

export interface HandlerDeps {
  pm: PlayerManager
  layout: LayoutStore
  cookies: CookieStore
  hwnds: Map<number, number>
  notesDir: string
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
}

export function registerHandlers(deps: HandlerDeps): void {
  ipcMain.handle(
    'stream:start',
    async (_e, slot: number, source: Source, rect: Rect, volume: number) => {
      const stream = await resolveSource(source) // 未开播/解析失败会 throw，渲染端展示
      await deps.pm.start(slot, stream, rect, volume)
      // B 站：把解析出的真实 roomId 回写到槽位源，供发弹幕使用
      const savedSource =
        stream.platform === 'bilibili' ? { ...source, roomId: stream.roomId } : source
      deps.layout.updateSlot(slot, { source: savedSource, rect, volume, visible: true })
      const hwnd = await findHwndWithRetry(`livewall-slot-${slot}`)
      if (hwnd) {
        deps.hwnds.set(slot, hwnd)
        tryWin32(() => setWindowRect(hwnd, rect))
      }
      return { title: stream.title, roomId: stream.roomId, hwnd }
    }
  )

  ipcMain.handle('stream:stop', async (_e, slot: number) => {
    await deps.pm.stop(slot)
    deps.hwnds.delete(slot)
  })

  ipcMain.handle('stream:setVolume', async (_e, slot: number, v: number) => {
    const vol = clampVolume(v)
    const player = deps.pm.get(slot)
    if (player) await player.ipc.setProperty('volume', vol)
    deps.layout.updateSlot(slot, { volume: vol, muted: vol === 0 })
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
    return deps.layout.load()
  })

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
}
