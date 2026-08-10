import type { ResolvedStream, Source } from '../../shared/types'
import { resolveBilibili, resolveBilibiliVideo, parseVideoInput } from './bilibili'

export async function resolveSource(
  source: Source,
  fetchFn: typeof fetch = fetch
): Promise<ResolvedStream> {
  if (source.platform === 'bilibili') {
    if (!source.roomId) throw new Error('bilibili 源缺少 roomId')
    // 输入是 BV/av/视频页 URL 时按视频处理，走 yt-dlp
    if (parseVideoInput(source.roomId)) return resolveBilibiliVideo(source.roomId, fetchFn)
    return resolveBilibili(source.roomId, fetchFn)
  }
  if (!source.videoUrl) throw new Error('youtube 源缺少 videoUrl')
  return {
    url: source.videoUrl,
    headers: {},
    title: source.label,
    platform: 'youtube',
    needsYtdl: true
  }
}
