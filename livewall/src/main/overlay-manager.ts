import { BrowserWindow } from 'electron'
import path from 'node:path'
import type { Rect } from '../shared/types'

const OVERLAY_HEIGHT = 36

/**
 * 每路直播的工具条覆盖窗管理：透明无边框小窗，贴在 mpv 窗口顶边，
 * 位置由 WindowTracker.onRectChanged 驱动。
 */
export class OverlayManager {
  private wins = new Map<number, BrowserWindow>()

  /** 槽位对应的覆盖窗（供 overlay:interactive 等 IPC handler 查找）。 */
  get(slot: number): BrowserWindow | undefined {
    return this.wins.get(slot)
  }

  create(slot: number, r: Rect): void {
    this.destroy(slot)
    const w = new BrowserWindow({
      x: r.x,
      y: r.y,
      width: r.w,
      height: OVERLAY_HEIGHT,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      show: false,
      webPreferences: {
        preload: path.join(import.meta.dirname, '../preload/overlay.mjs'),
        sandbox: false
      }
    })
    // mpv 是普通 ontop，覆盖窗用 screen-saver 级别确保在其之上
    w.setAlwaysOnTop(true, 'screen-saver')
    // 默认鼠标穿透，由 renderer 的 mouseenter/leave 切换交互
    w.setIgnoreMouseEvents(true, { forward: true })

    if (process.env.ELECTRON_RENDERER_URL) {
      w.loadURL(`${process.env.ELECTRON_RENDERER_URL}/overlay/?slot=${slot}`)
    } else {
      w.loadFile(path.join(import.meta.dirname, '../renderer/overlay/index.html'), {
        query: { slot: String(slot) }
      })
    }

    w.once('ready-to-show', () => w.showInactive())
    w.on('closed', () => this.wins.delete(slot))
    this.wins.set(slot, w)
  }

  move(slot: number, r: Rect): void {
    this.wins.get(slot)?.setBounds({ x: r.x, y: r.y, width: r.w, height: OVERLAY_HEIGHT })
  }

  destroy(slot: number): void {
    this.wins.get(slot)?.destroy()
    this.wins.delete(slot)
  }

  setAllVisible(v: boolean): void {
    for (const w of this.wins.values()) {
      if (v) w.showInactive()
      else w.hide()
    }
  }

  /** 切换某槽覆盖窗的鼠标穿透：interactive=true 时可点击。 */
  setInteractive(slot: number, interactive: boolean): void {
    this.wins.get(slot)?.setIgnoreMouseEvents(!interactive, { forward: true })
  }
}
