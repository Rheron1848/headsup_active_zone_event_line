import { describe, it, expect } from 'vitest'
import { formatStreamPos, formatNoteLine, noteFilePath, appendNote } from '../../src/core/notes/writer'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

it('formatStreamPos', () => {
  expect(formatStreamPos(null)).toBe('--:--:--')
  expect(formatStreamPos(0)).toBe('00:00:00')
  expect(formatStreamPos(5025)).toBe('01:23:45')
})

it('formatNoteLine', () => {
  const now = new Date('2026-08-09T14:32:05')
  expect(formatNoteLine(now, 5025, '精彩操作')).toBe('- [14:32:05] (流内 01:23:45) 精彩操作')
})

it('noteFilePath 清洗非法字符', () => {
  const now = new Date('2026-08-09T14:32:05')
  expect(noteFilePath('/n', now, '主/播:A*B'))
    .toBe(path.join('/n', '2026-08-09-主_播_A_B.md'))
})

it('appendNote 追加写', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'livewall-notes-'))
  const now = new Date('2026-08-09T14:32:05')
  appendNote(dir, 's1', now, 10, '第一条')
  appendNote(dir, 's1', now, 20, '第二条')
  const content = readFileSync(noteFilePath(dir, now, 's1'), 'utf8')
  expect(content.split('\n').filter(Boolean)).toHaveLength(2)
  rmSync(dir, { recursive: true, force: true })
})
