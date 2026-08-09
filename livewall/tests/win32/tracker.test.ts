import { describe, it, expect } from 'vitest'
import { WindowTracker } from '../../src/main/window-tracker'
import type { Rect } from '../../src/shared/types'

function setup(opts?: { pollMs?: number; debounceMs?: number }) {
  let now = 1000
  const rects = new Map<number, Rect | null>()
  const persisted: Array<{ slot: number; rect: Rect }> = []
  const changed: Array<{ slot: number; rect: Rect }> = []
  const tracker = new WindowTracker(
    (hwnd) => rects.get(hwnd) ?? null,
    (slot, rect) => persisted.push({ slot, rect }),
    opts?.pollMs ?? 150,
    opts?.debounceMs ?? 500,
    () => now
  )
  tracker.onRectChanged = (slot, rect) => changed.push({ slot, rect })
  return {
    tracker,
    rects,
    persisted,
    changed,
    advance: (ms: number) => {
      now += ms
    }
  }
}

describe('WindowTracker', () => {
  it('rect 变化时触发 onRectChanged', () => {
    const { tracker, rects, changed } = setup()
    tracker.registerHwnd(0, 42)
    rects.set(42, { x: 0, y: 0, w: 640, h: 360 })
    tracker.tick()
    expect(changed).toEqual([{ slot: 0, rect: { x: 0, y: 0, w: 640, h: 360 } }])

    // 未变化不再触发
    tracker.tick()
    expect(changed).toHaveLength(1)

    rects.set(42, { x: 10, y: 0, w: 640, h: 360 })
    tracker.tick()
    expect(changed).toHaveLength(2)
  })

  it('稳定 500ms 后 persist 恰好一次', () => {
    const { tracker, rects, persisted, advance } = setup()
    tracker.registerHwnd(1, 7)
    rects.set(7, { x: 5, y: 5, w: 100, h: 100 })
    tracker.tick() // t=1000：变化，记脏

    advance(499)
    tracker.tick() // t=1499：未达防抖，不 persist
    expect(persisted).toHaveLength(0)

    advance(1)
    tracker.tick() // t=1500：恰好到 500ms，persist
    expect(persisted).toEqual([{ slot: 1, rect: { x: 5, y: 5, w: 100, h: 100 } }])

    // 后续继续稳定，不再重复 persist
    advance(1000)
    tracker.tick()
    tracker.tick()
    expect(persisted).toHaveLength(1)
  })

  it('持续变化时每次变化重置防抖计时', () => {
    const { tracker, rects, persisted, advance } = setup()
    tracker.registerHwnd(0, 1)
    rects.set(1, { x: 0, y: 0, w: 10, h: 10 })
    tracker.tick()

    advance(400)
    rects.set(1, { x: 1, y: 0, w: 10, h: 10 })
    tracker.tick() // 变化，重置脏时间
    advance(400)
    tracker.tick() // 距上次变化仅 400ms，不 persist
    expect(persisted).toHaveLength(0)

    advance(100)
    tracker.tick() // 满 500ms
    expect(persisted).toHaveLength(1)
  })

  it('unregister 后不再跟踪', () => {
    const { tracker, rects, persisted, changed } = setup()
    tracker.registerHwnd(0, 9)
    rects.set(9, { x: 0, y: 0, w: 10, h: 10 })
    tracker.tick()
    expect(changed).toHaveLength(1)

    tracker.unregisterHwnd(0)
    rects.set(9, { x: 99, y: 99, w: 10, h: 10 })
    tracker.tick()
    tracker.tick()
    expect(changed).toHaveLength(1)
    expect(persisted).toHaveLength(0)
  })

  it('getRect 返回 null 时跳过且不报错、不清脏', () => {
    const { tracker, rects, persisted, changed, advance } = setup()
    tracker.registerHwnd(0, 3)
    rects.set(3, { x: 0, y: 0, w: 10, h: 10 })
    tracker.tick()
    expect(changed).toHaveLength(1)

    // 窗口暂时消失：跳过，不 persist、不触发变化
    rects.set(3, null)
    advance(600)
    expect(() => tracker.tick()).not.toThrow()
    expect(persisted).toHaveLength(0)
    expect(changed).toHaveLength(1)

    // 窗口回来且 rect 未变：防抖计时从原脏时间起算，立即 persist
    rects.set(3, { x: 0, y: 0, w: 10, h: 10 })
    tracker.tick()
    expect(changed).toHaveLength(1)
    expect(persisted).toHaveLength(1)
  })

  it('start/stop 用 pollMs 周期驱动 tick', () => {
    const { tracker, rects, changed } = setup({ pollMs: 150 })
    tracker.registerHwnd(0, 1)
    rects.set(1, { x: 0, y: 0, w: 10, h: 10 })
    tracker.start()
    return new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        try {
          tracker.stop()
          expect(changed.length).toBeGreaterThanOrEqual(1)
          resolve()
        } catch (e) {
          reject(e)
        }
      }, 400)
    })
  })
})
