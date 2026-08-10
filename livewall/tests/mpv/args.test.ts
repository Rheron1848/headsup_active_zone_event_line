import { describe, it, expect } from 'vitest'
import { buildMpvArgs, mpvPipeName } from '../../src/main/mpv-args'
import type { ResolvedStream } from '../../src/shared/types'

const bili: ResolvedStream = {
  url: 'https://cn-live.example.com/s.flv?token=abc',
  headers: { Referer: 'https://live.bilibili.com', 'User-Agent': 'UA-X' },
  title: '测试',
  platform: 'bilibili',
  roomId: '12345'
}

describe('buildMpvArgs', () => {
  it('含置顶无边框、标题、管道、几何、音量与请求头', () => {
    const a = buildMpvArgs(bili, 0, { x: 10, y: 20, w: 640, h: 360 }, 55, {
      inputConfPath: 'C:/app/wheel.conf',
      platform: 'win32'
    })
    expect(a).toContain('--ontop')
    expect(a).toContain('--no-border')
    expect(a).toContain('--keepaspect=no')
    expect(a).toContain('--title=livewall-slot-0')
    expect(a).toContain('--input-ipc-server=\\\\.\\pipe\\livewall-mpv-0')
    expect(a).toContain('--geometry=640x360+10+20')
    expect(a).toContain('--volume=55')
    expect(a).toContain('--input-conf=C:/app/wheel.conf')
    expect(a).toContain('--http-header-fields=Referer: https://live.bilibili.com')
    expect(a).toContain('--user-agent=UA-X')
    expect(a[a.length - 1]).toBe(bili.url) // URL 永远最后
  })
  it('youtube 源无 headers 时不产出 header 参数', () => {
    const yt: ResolvedStream = {
      url: 'https://www.youtube.com/watch?v=x',
      headers: {},
      title: 'yt',
      platform: 'youtube'
    }
    const a = buildMpvArgs(yt, 1, { x: 0, y: 0, w: 640, h: 360 }, 80, { inputConfPath: 'c' })
    expect(a.some((s) => s.startsWith('--http-header-fields'))).toBe(false)
    expect(a).toContain('--ytdl=yes')
  })
  it('bilibili 视频源带 needsYtdl 时产出 ytdl 参数', () => {
    const v: ResolvedStream = {
      url: 'https://www.bilibili.com/video/BV1xx411c7mD',
      headers: { Referer: 'https://www.bilibili.com' },
      title: 'video',
      platform: 'bilibili',
      needsYtdl: true
    }
    const a = buildMpvArgs(v, 2, { x: 0, y: 0, w: 640, h: 360 }, 60, { inputConfPath: 'c' })
    expect(a).toContain('--ytdl=yes')
    expect(a).toContain('--http-header-fields=Referer: https://www.bilibili.com')
  })
})

it('mpvPipeName 按平台返回管道/套接字路径', () => {
  expect(mpvPipeName(3, 'win32')).toBe('\\\\.\\pipe\\livewall-mpv-3')
  expect(mpvPipeName(3, 'linux')).toBe('/tmp/livewall-mpv-3.sock')
})
