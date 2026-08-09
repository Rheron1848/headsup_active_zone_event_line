const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0'

export function buildDanmakuBody(p: { msg: string; roomId: string; csrf: string; rnd?: number }): URLSearchParams {
  const rnd = p.rnd ?? Math.floor(Date.now() / 1000)
  return new URLSearchParams({
    bubble: '0', msg: p.msg, color: '16777215', mode: '1', fontsize: '25',
    rnd: String(rnd), roomid: p.roomId, csrf: p.csrf, csrf_token: p.csrf
  })
}

export async function sendDanmaku(
  cookies: Record<string, string>, roomId: string, msg: string,
  fetchFn: typeof fetch = fetch
): Promise<{ ok: boolean; message: string }> {
  if (!cookies.SESSDATA || !cookies.bili_jct) return { ok: false, message: '未登录' }
  const cookieHeader = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ')
  const resp = await fetchFn('https://api.live.bilibili.com/msg/send', {
    method: 'POST',
    headers: {
      'User-Agent': UA, Referer: 'https://live.bilibili.com',
      Cookie: cookieHeader, 'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: buildDanmakuBody({ msg, roomId, csrf: cookies.bili_jct })
  })
  const j = await resp.json()
  return j.code === 0 ? { ok: true, message: '已发送' } : { ok: false, message: j.message ?? `code=${j.code}` }
}
