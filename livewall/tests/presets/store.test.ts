import { it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PresetStore } from '../../src/core/presets/store'

let dir: string
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 'livewall-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

it('文件不存在时 list 返回 []', () => {
  expect(new PresetStore(path.join(dir, 'presets.json')).list()).toEqual([])
})

it('损坏 JSON 容错返回 []', () => {
  const p = path.join(dir, 'presets.json')
  writeFileSync(p, '{oops')
  expect(new PresetStore(p).list()).toEqual([])
})

it('add 生成 id 并持久化，重新构造实例后 list 可见', () => {
  const p = path.join(dir, 'sub', 'presets.json') // 顺带验证 save 自动建目录
  const s = new PresetStore(p)
  const added = s.add({ platform: 'bilibili', label: '某直播间', roomId: '12345', tags: ['守望'] })
  expect(added.id).toBeTruthy()
  const re = new PresetStore(p).list()
  expect(re).toHaveLength(1)
  expect(re[0]).toEqual(added)
})

it('update 局部更新且 id 不可覆盖', () => {
  const p = path.join(dir, 'presets.json')
  const s = new PresetStore(p)
  const a = s.add({ platform: 'youtube', label: 'Lofi', videoUrl: 'https://youtu.be/x', tags: ['音乐'] })
  const updated = s.update(a.id, { label: 'Lofi 24/7', tags: ['音乐', '工作'], id: 'hacked' } as any)
  expect(updated).toMatchObject({ id: a.id, label: 'Lofi 24/7', tags: ['音乐', '工作'], platform: 'youtube' })
  expect(new PresetStore(p).list()[0]).toEqual(updated)
})

it('update 不存在 id 抛错', () => {
  const p = path.join(dir, 'presets.json')
  new PresetStore(p).add({ platform: 'bilibili', label: 'A', roomId: '1', tags: [] })
  expect(() => new PresetStore(p).update('no-such-id', { label: 'X' })).toThrow()
})

it('remove 删除；remove 不存在 id 抛错', () => {
  const p = path.join(dir, 'presets.json')
  const s = new PresetStore(p)
  const a = s.add({ platform: 'bilibili', label: 'A', roomId: '1', tags: [] })
  const b = s.add({ platform: 'bilibili', label: 'B', roomId: '2', tags: [] })
  s.remove(a.id)
  const re = new PresetStore(p).list()
  expect(re).toHaveLength(1)
  expect(re[0].id).toBe(b.id)
  expect(() => s.remove('no-such-id')).toThrow()
})
