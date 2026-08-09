import { describe, it, expect } from 'vitest'
import { parseSetCookies, pollLoginQr } from '../../src/core/danmaku/login'

it('parseSetCookies 提取键值、忽略属性', () => {
  const c = parseSetCookies([
    'SESSDATA=abc%2C123; Expires=Wed, 01 Jan 2031 00:00:00 GMT; Path=/; Domain=.bilibili.com',
    'bili_jct=xyz; Path=/'
  ])
  expect(c).toEqual({ SESSDATA: 'abc%2C123', bili_jct: 'xyz' })
})

describe('pollLoginQr', () => {
  // 用 Headers.append 模拟多值 set-cookie；实现里优先走 headers.getSetCookie()
  const fake = (code: number, cookies: string[] = []): typeof fetch =>
    (async () => {
      const headers = new Headers()
      for (const c of cookies) headers.append('set-cookie', c)
      return new Response(JSON.stringify({ code: 0, data: { code } }), { status: 200, headers })
    }) as any

  it('86101→waiting, 86090→scanned, 86038→expired', async () => {
    expect((await pollLoginQr('k', fake(86101))).status).toBe('waiting')
    expect((await pollLoginQr('k', fake(86090))).status).toBe('scanned')
    expect((await pollLoginQr('k', fake(86038))).status).toBe('expired')
  })

  it('0→confirmed 且带回 cookie', async () => {
    const r = await pollLoginQr('k', fake(0, ['SESSDATA=s; Path=/', 'bili_jct=j; Path=/']))
    expect(r.status).toBe('confirmed')
    expect(r.cookies).toMatchObject({ SESSDATA: 's', bili_jct: 'j' })
  })
})
