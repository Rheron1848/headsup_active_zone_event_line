import type { Rect } from '../shared/types'

export type GetRect = (hwnd: number) => Rect | null
export type Persist = (slot: number, rect: Rect) => void
export type Now = () => number

interface Tracked {
  hwnd: number
  lastRect: Rect | null
  /** 距上次 rect 变化超过 persistDebounceMs 且仍有脏标记时，persist 一次。 */
  dirtySince: number | null
}

function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
}

/**
 * 跟踪已注册 hwnd 的窗口矩形变化：
 * - rect 变化时更新缓存、触发 onRectChanged（供 overlay 跟随）、记录脏时间；
 * - rect 连续未变且距上次变化超过 persistDebounceMs 时调 persist 一次并清脏。
 *
 * Win32 依赖通过构造函数注入，测试可注入假实现并手动驱动 tick()。
 */
export class WindowTracker {
  onRectChanged: ((slot: number, r: Rect) => void) | null = null

  private readonly tracked = new Map<number, Tracked>()
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly getRect: GetRect,
    private readonly persist: Persist,
    private readonly pollMs = 150,
    private readonly persistDebounceMs = 500,
    private readonly now: Now = Date.now
  ) {}

  registerHwnd(slot: number, hwnd: number): void {
    this.tracked.set(slot, { hwnd, lastRect: null, dirtySince: null })
  }

  unregisterHwnd(slot: number): void {
    this.tracked.delete(slot)
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => this.tick(), this.pollMs)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  tick(): void {
    const now = this.now()
    for (const [slot, t] of this.tracked) {
      const rect = this.getRect(t.hwnd)
      if (!rect) continue // 窗口可能已销毁，跳过本轮
      if (!t.lastRect || !sameRect(t.lastRect, rect)) {
        t.lastRect = rect
        t.dirtySince = now
        this.onRectChanged?.(slot, rect)
      } else if (
        t.dirtySince !== null &&
        now - t.dirtySince >= this.persistDebounceMs
      ) {
        this.persist(slot, rect)
        t.dirtySince = null
      }
    }
  }
}
