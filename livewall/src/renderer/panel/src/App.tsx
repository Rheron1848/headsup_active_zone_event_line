import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import type { Layout, Platform, Preset, SlotState, Source } from '../../../shared/types'

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
      listPresets: () => Promise<Preset[]>
      addPreset: (p: Omit<Preset, 'id'>) => Promise<Preset>
      updatePreset: (id: string, patch: Partial<Omit<Preset, 'id'>>) => Promise<Preset>
      removePreset: (id: string) => Promise<void>
      onHotkeyNote: (cb: (slot: number) => void) => () => void
    }
  }
}

function slotSourceKey(p: Preset): string {
  return p.platform === 'bilibili' ? `bilibili:${p.roomId}` : `youtube:${p.videoUrl}`
}

function sourceKey(s: Source): string {
  return s.platform === 'bilibili' ? `bilibili:${s.roomId}` : `youtube:${s.videoUrl}`
}

function buildPresetUsage(layout: Layout, presets: Preset[]): Map<string, number> {
  const usage = new Map<string, number>()
  for (const slot of layout.slots) {
    if (!slot.source) continue
    const key = sourceKey(slot.source)
    for (const p of presets) {
      if (slotSourceKey(p) === key) {
        usage.set(p.id, slot.index)
        break
      }
    }
  }
  return usage
}

function SlotCard({ slot, layout, presets, presetUsage, refresh, refreshPresets }: {
  slot: number
  layout: Layout
  presets: Preset[]
  presetUsage: Map<string, number>
  refresh: () => Promise<void>
  refreshPresets: () => Promise<void>
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

  function pickPreset(id: string): void {
    const p = presets.find((x) => x.id === id)
    if (!p) return
    setPlatform(p.platform)
    setInput(p.platform === 'bilibili' ? (p.roomId ?? '') : (p.videoUrl ?? ''))
  }

  async function savePreset(): Promise<void> {
    if (!input.trim()) return
    const label = input.trim().slice(0, 30)
    await window.livewall.addPreset(
      platform === 'bilibili'
        ? { platform, label, roomId: input.trim(), tags: [] }
        : { platform, label, videoUrl: input.trim(), tags: [] }
    )
    await refreshPresets()
    setStatus('已存为预设')
  }

  async function deletePreset(): Promise<void> {
    const p = presets.find(
      (x) => x.platform === platform && (x.roomId === input || x.videoUrl === input)
    )
    if (!p) {
      setStatus('当前输入没有匹配的预设')
      return
    }
    await window.livewall.removePreset(p.id)
    await refreshPresets()
    setStatus('预设已删除')
  }

  return (
    <div data-testid={`slot-card-${slot}`} style={{ border: '1px solid #444', borderRadius: 8, padding: 12 }}>
      <b>槽位 {slot + 1}</b>{' '}
      <span data-testid={`slot-status-${slot}`} style={{ color: '#888', fontSize: 12 }}>
        {s?.source ? s.source.label : '空闲'}
      </span>
      <div style={{ display: 'flex', gap: 4, margin: '8px 0' }}>
        <select value={platform} onChange={(e) => setPlatform(e.target.value as Platform)}>
          <option value="bilibili">B站</option>
          <option value="youtube">YT</option>
        </select>
        <input
          data-testid={`slot-input-${slot}`}
          style={{ flex: 1, minWidth: 0 }}
          placeholder={platform === 'bilibili' ? '房间号/URL' : 'watch URL'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        {running ? (
          <button data-testid={`slot-stop-${slot}`} onClick={stop}>停</button>
        ) : (
          <button data-testid={`slot-start-${slot}`} onClick={start}>播</button>
        )}
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        <select
          data-testid={`slot-preset-${slot}`}
          style={{ flex: 1, minWidth: 0 }}
          value=""
          onChange={(e) => e.target.value && pickPreset(e.target.value)}
        >
          <option value="">选择预设…</option>
          {presets.map((p) => {
            const usedSlot = presetUsage.get(p.id)
            const label = usedSlot !== undefined ? `${p.label} (已在槽位 ${usedSlot + 1})` : p.label
            return (
              <option key={p.id} value={p.id}>
                {label}
              </option>
            )
          })}
        </select>
        <button data-testid={`slot-save-preset-${slot}`} onClick={() => void savePreset()}>存预设</button>
        <button data-testid={`slot-delete-preset-${slot}`} onClick={() => void deletePreset()}>删预设</button>
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
    try {
      setMsg('请求二维码中…')
      setQr(null)
      const { url, qrcodeKey } = await window.livewall.loginStart()
      setQr(await QRCode.toDataURL(url, { width: 160 }))
      setMsg('请用 B 站 App 扫码')
      if (polling.current) return
      polling.current = true
      try {
        for (;;) {
          await new Promise((r) => setTimeout(r, 2000))
          if (!polling.current) break // 组件卸载/中断
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
      } finally {
        polling.current = false
      }
    } catch (e) {
      setMsg(`登录失败：${e instanceof Error ? e.message : String(e)}`)
      setQr(null)
    }
  }

  useEffect(() => {
    return () => {
      polling.current = false // 卸载时停止轮询
    }
  }, [])

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
  const [presets, setPresets] = useState<Preset[]>([])

  const refresh = useCallback(async () => {
    setLayout(await window.livewall.getLayout())
  }, [])
  const refreshPresets = useCallback(async () => {
    setPresets(await window.livewall.listPresets())
  }, [])

  useEffect(() => {
    void refresh()
    void refreshPresets()
    return window.livewall.onHotkeyNote((slot) => {
      document.querySelector<HTMLInputElement>(`input[data-note-slot="${slot}"]`)?.focus()
    })
  }, [refresh, refreshPresets])

  const presetUsage = useMemo(() => (layout ? buildPresetUsage(layout, presets) : new Map<string, number>()), [layout, presets])

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
          <SlotCard
            key={i}
            slot={i}
            layout={layout}
            presets={presets}
            presetUsage={presetUsage}
            refresh={refresh}
            refreshPresets={refreshPresets}
          />
        ))}
      </div>
    </div>
  )
}
