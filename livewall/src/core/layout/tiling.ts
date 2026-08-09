import type { Rect } from '../../shared/types'

const GRIDS: Record<number, [number, number]> = {
  1: [1, 1], 2: [2, 1], 3: [3, 1], 4: [2, 2], 5: [3, 2], 6: [3, 2]
}

export function tileRects(count: 1 | 2 | 3 | 4 | 5 | 6, area: Rect, gap = 4): Rect[] {
  const [cols, rows] = GRIDS[count]
  const cw = Math.floor((area.w - gap * (cols + 1)) / cols)
  const ch = Math.floor((area.h - gap * (rows + 1)) / rows)
  return Array.from({ length: count }, (_, i) => {
    const c = i % cols, r = Math.floor(i / cols)
    const x = area.x + gap + c * (cw + gap)
    const y = area.y + gap + r * (ch + gap)
    // 末列/末行吸收整除余数，保证铺满整个 area
    const w = c === cols - 1 ? area.x + area.w - gap - x : cw
    const h = r === rows - 1 ? area.y + area.h - gap - y : ch
    return { x, y, w, h }
  })
}
