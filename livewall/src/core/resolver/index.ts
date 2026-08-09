import type { ResolvedStream, Source } from '../../shared/types'
import { resolveBilibili } from './bilibili'

export async function resolveSource(
  source: Source,
  fetchFn: typeof fetch = fetch
): Promise<ResolvedStream> {
  if (source.platform === 'bilibili') {
    if (!source.roomId) throw new Error('bilibili 源缺少 roomId')
    return resolveBilibili(source.roomId, fetchFn)
  }
  if (!source.videoUrl) throw new Error('youtube 源缺少 videoUrl')
  return { url: source.videoUrl, headers: {}, title: source.label, platform: 'youtube' }
}
