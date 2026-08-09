import { describe, it, expect } from 'vitest'
import { encodeRect, decodeRect, RECT_SIZE } from '../../src/main/win32-rect'

describe('win32 RECT 编解码', () => {
  it('输出 16 字节小端 RECT（left,top,right,bottom）', () => {
    const b = encodeRect({ x: 10, y: 20, w: 300, h: 200 })
    expect(b.length).toBe(RECT_SIZE)
    expect(b.readInt32LE(0)).toBe(10) // left
    expect(b.readInt32LE(4)).toBe(20) // top
    expect(b.readInt32LE(8)).toBe(310) // right = x + w
    expect(b.readInt32LE(12)).toBe(220) // bottom = y + h
  })

  it('往返一致（含负数坐标，多显示器场景）', () => {
    const cases = [
      { x: 0, y: 0, w: 1920, h: 1080 },
      { x: -1920, y: -100, w: 800, h: 600 },
      { x: -1, y: 1, w: 1, h: 1 }
    ]
    for (const r of cases) {
      expect(decodeRect(encodeRect(r))).toEqual(r)
    }
  })

  it('decodeRect 拒绝过短 buffer', () => {
    expect(() => decodeRect(Buffer.alloc(8))).toThrow()
  })
})

it('import win32 模块不会加载 DLL（Linux 上也不抛错）', async () => {
  const mod = await import('../../src/main/win32')
  expect(typeof mod.findWindowByTitle).toBe('function')
  expect(typeof mod.setWindowRect).toBe('function')
  expect(typeof mod.showWindow).toBe('function')
  expect(typeof mod.getWindowRect).toBe('function')
})
