import { describe, it, expect } from 'vitest'
import { tileRects } from '../../src/core/layout/tiling'

const area = { x: 0, y: 0, w: 1920, h: 1040 }

describe('tileRects', () => {
  it('1 路铺满', () => {
    expect(tileRects(1, area, 4)).toEqual([{ x: 4, y: 4, w: 1912, h: 1032 }])
  })
  it('4 路 2×2 无重叠且覆盖全区', () => {
    const r = tileRects(4, area, 4)
    expect(r).toHaveLength(4)
    expect(r[0]).toEqual({ x: 4, y: 4, w: 954, h: 514 })
    expect(r[3].x).toBe(4 + 954 + 4)
    expect(r[3].y).toBe(4 + 514 + 4)
  })
  it('6 路 3×2', () => {
    const r = tileRects(6, area, 4)
    expect(r).toHaveLength(6)
    expect(r[5].x + r[5].w).toBe(area.w - 4)
  })
  it('5 路用 3×2 网格前 5 格', () => {
    const r5 = tileRects(5, area, 4)
    const r6 = tileRects(6, area, 4)
    expect(r5).toEqual(r6.slice(0, 5))
  })
})
