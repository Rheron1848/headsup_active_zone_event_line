import { it, expect } from 'vitest'
import { buildDanmakuBody, sendDanmaku } from '../../src/core/danmaku/bilibili'

it('buildDanmakuBody 含必要字段', () => {
  const b = buildDanmakuBody({ msg: '主播好', roomId: '12345', csrf: 'jct', rnd: 1700000000 })
  expect(b.get('msg')).toBe('主播好')
  expect(b.get('roomid')).toBe('12345')
  expect(b.get('csrf')).toBe('jct')
  expect(b.get('csrf_token')).toBe('jct')
  expect(b.get('mode')).toBe('1')
  expect(b.get('fontsize')).toBe('25')
  expect(b.get('color')).toBe('16777215')
})

it('缺登录信息直接失败，不发请求', async () => {
  let called = false
  const f = (async () => { called = true; return new Response('{}') }) as any
  const r = await sendDanmaku({ bili_jct: 'j' }, '1', 'hi', f) // 缺 SESSDATA
  expect(r.ok).toBe(false)
  expect(called).toBe(false)
})

it('接口报错透传 message', async () => {
  const f = (async () => new Response(JSON.stringify({ code: -101, message: '账号未登录' }))) as any
  const r = await sendDanmaku({ SESSDATA: 's', bili_jct: 'j' }, '1', 'hi', f)
  expect(r).toEqual({ ok: false, message: '账号未登录' })
})
