import { describe, it, expect } from 'vitest'
import { resolveBilibili, parseRoomInput, parseVideoInput, resolveBilibiliVideo } from '../../src/core/resolver/bilibili'

const roomInfoResp = {
  code: 0,
  data: { room_id: 12345, live_status: 1, title: '测试直播间' }
}
const playInfoResp = {
  code: 0,
  data: {
    playurl_info: {
      playurl: {
        stream: [
          {
            protocol_name: 'http_stream',
            format: [
              {
                format_name: 'flv',
                codec: [
                  {
                    codec_name: 'avc',
                    current_qn: 10000,
                    base_url: '/live/stream.flv?',
                    url_info: [
                      {
                        host: 'https://cn-live.example.com',
                        base_url: '/live/stream.flv?',
                        extra: '&token=abc'
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    }
  }
}

function fakeFetch(route: Record<string, unknown>): typeof fetch {
  return (async (input: any) => {
    const url = String(input)
    for (const [k, v] of Object.entries(route)) {
      if (url.includes(k)) return new Response(JSON.stringify(v), { status: 200 })
    }
    throw new Error('unexpected url: ' + url)
  }) as typeof fetch
}

describe('parseRoomInput', () => {
  it('接受纯数字', () => expect(parseRoomInput('12345')).toBe('12345'))
  it('从直播 URL 提取', () =>
    expect(parseRoomInput('https://live.bilibili.com/12345?spm_id_from=x')).toBe('12345'))
  it('非法输入抛错', () => expect(() => parseRoomInput('hello')).toThrow())
})

describe('parseVideoInput', () => {
  it('接受 BV 号', () => expect(parseVideoInput('BV1xx411c7mD')).toBe('BV1xx411c7mD'))
  it('接受 av 号', () => expect(parseVideoInput('av170001')).toBe('av170001'))
  it('从视频 URL 提取 BV', () =>
    expect(parseVideoInput('https://www.bilibili.com/video/BV1xx411c7mD?spm_id_from=x')).toBe('BV1xx411c7mD'))
  it('从视频 URL 提取 av', () =>
    expect(parseVideoInput('https://www.bilibili.com/video/av170001')).toBe('av170001'))
  it('非视频输入返回 null', () => expect(parseVideoInput('12345')).toBeNull())
})

describe('resolveBilibiliVideo', () => {
  it('BV 号返回视频页 URL 并标记 needsYtdl', async () => {
    const s = await resolveBilibiliVideo('BV1xx411c7mD')
    expect(s.url).toBe('https://www.bilibili.com/video/BV1xx411c7mD')
    expect(s.platform).toBe('bilibili')
    expect(s.needsYtdl).toBe(true)
  })
  it('av 号返回视频页 URL', async () => {
    const s = await resolveBilibiliVideo('av170001')
    expect(s.url).toBe('https://www.bilibili.com/video/av170001')
  })
})

describe('resolveBilibili', () => {
  it('短号→真实 room_id→拼接 flv 地址与请求头', async () => {
    const s = await resolveBilibili(
      '6',
      fakeFetch({ 'Room/get_info': roomInfoResp, getRoomPlayInfo: playInfoResp })
    )
    expect(s.roomId).toBe('12345')
    expect(s.title).toBe('测试直播间')
    expect(s.url).toBe('https://cn-live.example.com/live/stream.flv?&token=abc')
    expect(s.headers.Referer).toBe('https://live.bilibili.com')
    expect(s.headers['User-Agent']).toContain('Mozilla')
  })
  it('未开播抛错', async () => {
    await expect(
      resolveBilibili(
        '6',
        fakeFetch({ 'Room/get_info': { code: 0, data: { room_id: 12345, live_status: 0 } } })
      )
    ).rejects.toThrow(/未开播/)
  })
  it('接口 code 非 0 抛错', async () => {
    await expect(
      resolveBilibili('6', fakeFetch({ 'Room/get_info': { code: -404, message: '啥都没有' } }))
    ).rejects.toThrow()
  })
})
