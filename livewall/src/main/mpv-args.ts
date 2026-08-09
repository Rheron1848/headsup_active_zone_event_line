import type { Rect, ResolvedStream } from '../shared/types'

export function mpvPipeName(slot: number, platform: NodeJS.Platform = process.platform): string {
  if (platform === 'win32') return `\\\\.\\pipe\\livewall-mpv-${slot}`
  return `/tmp/livewall-mpv-${slot}.sock`
}

export function buildMpvArgs(
  stream: ResolvedStream,
  slot: number,
  rect: Rect,
  volume: number,
  opts: { inputConfPath: string; platform?: NodeJS.Platform }
): string[] {
  const args = [
    '--ontop',
    '--no-border',
    '--keep-open=yes',
    `--title=livewall-slot-${slot}`,
    `--input-ipc-server=${mpvPipeName(slot, opts.platform)}`,
    `--geometry=${rect.w}x${rect.h}+${rect.x}+${rect.y}`,
    `--volume=${Math.round(volume)}`,
    `--input-conf=${opts.inputConfPath}`
  ]
  if (stream.platform === 'youtube') args.push('--ytdl=yes')
  // User-Agent 走 mpv 专用参数；其余头（如 Referer）进 http-header-fields
  const headerLines = Object.entries(stream.headers)
    .filter(([k]) => k.toLowerCase() !== 'user-agent')
    .map(([k, v]) => `${k}: ${v}`)
  if (headerLines.length) args.push(`--http-header-fields=${headerLines.join(',')}`)
  if (stream.headers['User-Agent']) args.push(`--user-agent=${stream.headers['User-Agent']}`)
  args.push(stream.url)
  return args
}
