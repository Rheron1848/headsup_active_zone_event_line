import type { Rect } from '../shared/types'

// Win32 RECT: 4 个 int32 小端（left, top, right, bottom）
export const RECT_SIZE = 16

export function encodeRect(r: Rect): Buffer {
  const b = Buffer.alloc(RECT_SIZE)
  b.writeInt32LE(r.x, 0)
  b.writeInt32LE(r.y, 4)
  b.writeInt32LE(r.x + r.w, 8)
  b.writeInt32LE(r.y + r.h, 12)
  return b
}

export function decodeRect(b: Buffer): Rect {
  if (b.length < RECT_SIZE) throw new Error(`RECT buffer too small: ${b.length}`)
  const left = b.readInt32LE(0)
  const top = b.readInt32LE(4)
  const right = b.readInt32LE(8)
  const bottom = b.readInt32LE(12)
  return { x: left, y: top, w: right - left, h: bottom - top }
}
