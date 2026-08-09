const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0'

export function parseSetCookies(headers: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const h of headers) {
    const first = h.split(';')[0]
    const i = first.indexOf('=')
    if (i > 0) out[first.slice(0, i).trim()] = first.slice(i + 1).trim()
  }
  return out
}

export async function createLoginQr(fetchFn: typeof fetch = fetch) {
  const r = await fetchFn('https://passport.bilibili.com/x/passport-login/qrcode/generate',
    { headers: { 'User-Agent': UA } })
  const j = await r.json()
  if (j.code !== 0) throw new Error(`二维码生成失败: ${j.message}`)
  return { url: j.data.url as string, qrcodeKey: j.data.qrcode_key as string }
}

export type QrStatus = {
  status: 'waiting' | 'scanned' | 'confirmed' | 'expired'
  cookies?: Record<string, string>
}

export async function pollLoginQr(qrcodeKey: string, fetchFn: typeof fetch = fetch): Promise<QrStatus> {
  const r = await fetchFn(
    `https://passport.bilibili.com/x/passport-login/qrcode/poll?qrcode_key=${qrcodeKey}`,
    { headers: { 'User-Agent': UA } })
  const j = await r.json()
  const code: number = j.data?.code
  if (code === 0) {
    const setCookies: string[] =
      typeof (r.headers as any).getSetCookie === 'function'
        ? (r.headers as any).getSetCookie()
        : (r.headers.get('set-cookie') ?? '').split(', ').filter(Boolean)
    return { status: 'confirmed', cookies: parseSetCookies(setCookies) }
  }
  if (code === 86090) return { status: 'scanned' }
  if (code === 86038) return { status: 'expired' }
  return { status: 'waiting' }
}
