import type { ResolvedStream } from '../../shared/types'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
const HEADERS: Record<string, string> = { Referer: 'https://live.bilibili.com', 'User-Agent': UA }

export function parseRoomInput(input: string): string {
  const s = input.trim()
  if (/^\d+$/.test(s)) return s
  const m = s.match(/live\.bilibili\.com\/(?:h5\/)?(\d+)/)
  if (m) return m[1]
  throw new Error(`无法识别的房间输入: ${input}`)
}

async function getJson(url: string, fetchFn: typeof fetch): Promise<any> {
  const resp = await fetchFn(url, { headers: HEADERS })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${url}`)
  const j = await resp.json()
  if (j.code !== 0) throw new Error(`bilibili API 错误 code=${j.code} message=${j.message ?? ''}`)
  return j.data
}

export async function resolveBilibili(
  roomInput: string,
  fetchFn: typeof fetch = fetch
): Promise<ResolvedStream> {
  const id = parseRoomInput(roomInput)
  // Room/get_info 同时接受长/短号，返回真实 room_id、标题、开播状态
  const info = await getJson(
    `https://api.live.bilibili.com/room/v1/Room/get_info?room_id=${id}`,
    fetchFn
  )
  const roomId: number = info.room_id
  if (info.live_status !== 1) throw new Error(`房间 ${id} 未开播`)

  const play = await getJson(
    `https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo?room_id=${roomId}&protocol=0,1&format=0,1,2&codec=0,1&qn=10000&platform=web&ptype=8`,
    fetchFn
  )
  // 选第一个可用流；url = host + base_url + extra
  const streams = play.playurl_info.playurl.stream
  for (const st of streams) {
    for (const fmt of st.format ?? []) {
      for (const codec of fmt.codec ?? []) {
        const ui = codec.url_info?.[0]
        if (ui) {
          return {
            url: `${ui.host}${codec.base_url}${ui.extra}`,
            headers: HEADERS,
            title: info.title ?? `bilibili-${roomId}`,
            platform: 'bilibili',
            roomId: String(roomId)
          }
        }
      }
    }
  }
  throw new Error('未找到可用流地址')
}
