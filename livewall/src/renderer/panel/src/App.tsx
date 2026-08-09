import React, { useCallback, useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import type { Layout, Platform, SlotState } from '../../../shared/types'

declare global {
  interface Window {
    livewall: {
      startStream: (
        slot: number,
        source: unknown,
        rect: unknown,
        volume: number
      ) => Promise<{ title: string; roomId?: string }>
      stopStream: (slot: number) => Promise<void>
      setVolume: (slot: number, v: number) => Promise<number>
      setVisible: (slot: number, visible: boolean) => Promise<void>
      setAllVisible: (visible: boolean) => Promise<void>
      getLayout: () => Promise<Layout>
      tile: (count: number) => Promise<Layout>
      sendDanmaku: (slot: number, msg: string) => Promise<{ ok: boolean; message: string }>
      addNote: (slot: number, text: string) => Promise<string>
      openNotesDir: () => Promise<void>
      loginStart: () => Promise<{ url: string; qrcodeKey: string }>
      loginPoll: (qrcodeKey: string) => Promise<{ status: string }>
      authStatus: () => Promise<{ loggedIn: boolean }>
      onHotkeyNote: (cb: (slot: number) => void) => void
    }
  }
}

function SlotCard({ slot, layout, refresh }: {
  slot: number
  layout: Layout
  refresh: () => Promise<void>
}): React.JSX.Element {
  const s: SlotState | undefined = layout.slots.find((x) => x.index === slot)
  const [platform, setPlatform] = useState<Platform>('bilibili')
  const [input, setInput] = useState('')
  const [status, setStatus] = useState('')
  const [danmaku, setDanmaku] = useState('')
  const [note, setNote] = useState('')
  const noteRef = useRef<HTMLInputElement>(null)
  const running = !!s?.source

  async function start(): Promise<void> {
    setStatus('解析中…')
    try {
      const source =
        platform === 'bilibili'
          ? { platform, label: input, roomId: input }
          : { platform, label: input, videoUrl: input }
      await window.livewall.startStream(slot, source, s?.rect ?? { x: 100, y: 100, w: 640, h: 360 }, s?.volume ?? 60)
      setStatus('')
      await refresh()
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    }
  }

  async function stop(): Promise<void> {
    await window.livewall.stopStream(slot)
    await refresh()
  }

  async function sendDanmaku(): Promise<void> {
    if (!danmaku.trim()) return
    const r = await window.livewall.sendDanmaku(slot, danmaku.trim())
    setStatus(r.message)
    if (r.ok) setDanmaku('')
  }

  async function addNote(): Promise<void> {
    if (!note.trim()) return
    await window.livewall.addNote(slot, note.trim())
    setNote('')
    setStatus('笔记已记录')
  }

  return (
    <div style={{ border: '1px solid #444', borderRadius: 8, padding: 12 }}>
      <b>槽位 {slot + 1}</b>{' '}
      <span style={{ color: '#888', fontSize: 12 }}>
        {s?.source ? s.source.label : '空闲'}
      </span>
      <div style={{ display: 'flex', gap: 4, margin: '8px 0' }}>
        <select value={platform} onChange={(e) => setPlatform(e.target.value as Platform)}>
          <option value="bilibili">B站</option>
          <option value="youtube">YT</option>
        </select>
        <input
          style={{ flex: 1, minWidth: 0 }}
          placeholder={platform === 'bilibili' ? '房间号/URL' : 'watch URL'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        {running ? <button onClick={stop}>停</button> : <button onClick={start}>播</button>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 12 }}>音量</span>
        <input
          type="range"
          min={0}
          max={100}
          value={s?.volume ?? 60}
          onChange={(e) => void window.livewall.setVolume(slot, Number(e.target.value)).then(refresh)}
          style={{ flex: 1 }}
        />
        <span style={{ fontSize: 12, width: 24 }}>{s?.volume ?? 60}</span>
        <button onClick={() => void window.livewall.setVisible(slot, !(s?.visible ?? true)).then(refresh)}>
          {s?.visible ? '隐' : '显'}
        </button>
      </div>
      {s?.source?.platform === 'bilibili' && (
        <input
          placeholder="弹幕，回车发送"
          value={danmaku}
          onChange={(e) => setDanmaku(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void sendDanmaku()}
          style={{ width: '100%', marginTop: 6, boxSizing: 'border-box' }}
        />
      )}
      <input
        ref={noteRef}
        data-note-slot={slot}
        placeholder="笔记，回车记录"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && void addNote()}
        style={{ width: '100%', marginTop: 6, boxSizing: 'border-box' }}
      />
      {status && <div style={{ color: '#e80', fontSize: 12, marginTop: 4 }}>{status}</div>}
    </div>
  )
}

function LoginSection(): React.JSX.Element {
  const [loggedIn, setLoggedIn] = useState(false)
  const [qr, setQr] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const polling = useRef(false)

  const check = useCallback(async () => {
    setLoggedIn((await window.livewall.authStatus()).loggedIn)
  }, [])

  useEffect(() => {
    void check()
  }, [check])

  async function login(): Promise<void> {
    const { url, qrcodeKey } = await window.livewall.loginStart()
    setQr(await QRCode.toDataURL(url, { width: 160 }))
    setMsg('请用 B 站 App 扫码')
    if (polling.current) return
    polling.current = true
    for (;;) {
      await new Promise((r) => setTimeout(r, 2000))
      const { status } = await window.livewall.loginPoll(qrcodeKey)
      if (status === 'confirmed') {
        setMsg('登录成功')
        setQr(null)
        await check()
        break
      }
      if (status === 'expired') {
        setMsg('二维码已过期，请重新点击登录')
        setQr(null)
        break
      }
      if (status === 'scanned') setMsg('已扫码，请在手机上确认')
    }
    polling.current = false
  }

  return (
    <div style={{ marginBottom: 12 }}>
      {loggedIn ? (
        <span style={{ color: '#6c6' }}>B 站已登录</span>
      ) : (
        <button onClick={() => void login()}>扫码登录 B 站</button>
      )}
      {qr && <img src={qr} alt="登录二维码" style={{ display: 'block', marginTop: 8 }} />}
      {msg && <span style={{ marginLeft: 8, fontSize: 12 }}>{msg}</span>}
    </div>
  )
}

export default function App(): React.JSX.Element {
  const [layout, setLayout] = useState<Layout | null>(null)

  const refresh = useCallback(async () => {
    setLayout(await window.livewall.getLayout())
  }, [])

  useEffect(() => {
    void refresh()
    window.livewall.onHotkeyNote((slot) => {
      document.querySelector<HTMLInputElement>(`input[data-note-slot="${slot}"]`)?.focus()
    })
  }, [refresh])

  if (!layout) return <div style={{ padding: 24 }}>加载中…</div>
  const anyVisible = layout.slots.some((s) => s.visible)

  return (
    <div style={{ fontFamily: 'sans-serif', padding: 16, color: '#ddd', background: '#222', minHeight: '100vh', boxSizing: 'border-box' }}>
      <h2 style={{ marginTop: 0 }}>livewall 控制面板</h2>
      <LoginSection />
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <button key={n} onClick={() => void window.livewall.tile(n).then(() => refresh())}>
            平铺{n}
          </button>
        ))}
        <button onClick={() => void window.livewall.setAllVisible(!anyVisible).then(refresh)}>
          {anyVisible ? '全部隐藏' : '全部显示'}
        </button>
        <button onClick={() => void window.livewall.openNotesDir()}>笔记目录</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <SlotCard key={i} slot={i} layout={layout} refresh={refresh} />
        ))}
      </div>
    </div>
  )
}
