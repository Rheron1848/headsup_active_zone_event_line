import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { LayoutStore, defaultLayout } from '../../src/core/layout/store'

let dir: string
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 'livewall-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

it('文件不存在时返回 6 槽位默认布局', () => {
  const l = new LayoutStore(path.join(dir, 'layout.json')).load()
  expect(l.slots).toHaveLength(6)
  expect(l.slots[0].volume).toBe(60)
  expect(l.slots.map(s => s.index)).toEqual([0, 1, 2, 3, 4, 5])
})

it('损坏 JSON 容错返回默认', () => {
  const p = path.join(dir, 'layout.json')
  writeFileSync(p, '{oops')
  expect(new LayoutStore(p).load().slots).toHaveLength(6)
})

it('updateSlot 局部更新并持久化，重载可见', () => {
  const p = path.join(dir, 'layout.json')
  const s = new LayoutStore(p)
  s.updateSlot(2, { volume: 30, muted: true, rect: { x: 1, y: 2, w: 3, h: 4 } })
  const re = new LayoutStore(p).load()
  expect(re.slots[2]).toMatchObject({ volume: 30, muted: true, rect: { x: 1, y: 2, w: 3, h: 4 } })
  expect(re.slots[1].volume).toBe(60) // 其他槽位不受影响
})
