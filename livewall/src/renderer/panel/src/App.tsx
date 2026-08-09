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

const iconStyle: React.CSSProperties = {
  width: 16,
  height: 16,
  fill: 'currentColor',
  verticalAlign: 'middle'
}

function Icon({ path, title }: { path: string; title: string }): React.JSX.Element {
  return (
    <svg style={iconStyle} viewBox="0 0 24 24" role="img" aria-label={title}>
      <title>{title}</title>
      <path d={path} />
    </svg>
  )
}

const PlayIcon = () => <Icon title="播放" path="M8 5v14l11-7z" />
const StopIcon = () => <Icon title="停止" path="M6 6h12v12H6z" />
const EyeIcon = () => <Icon title="显示" path="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
const EyeOffIcon = () => <Icon title="隐藏" path="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z" />
const PlusIcon = () => <Icon title="添加" path="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
const TrashIcon = () => <Icon title="删除" path="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
const EditIcon = () => <Icon title="编辑" path="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
const FolderIcon = () => <Icon title="笔记目录" path="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
const SaveIcon = () => <Icon title="保存" path="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z" />

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

function PresetManager({ presets, presetUsage, refreshPresets }: {
  presets: Preset[]
  presetUsage: Map<string, number>
  refreshPresets: () => Promise<void>
}): React.JSX.Element {
  const [platform, setPlatform] = useState<Platform>('bilibili')
  const [input, setInput] = useState('')
  const [label, setLabel] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  function resetForm(): void {
    setInput('')
    setLabel('')
    setEditingId(null)
    setMsg('')
  }

  async function add(): Promise<void> {
    if (!input.trim()) return
    const p: Omit<Preset, 'id'> = platform === 'bilibili'
      ? { platform, label: label.trim() || input.trim().slice(0, 30), roomId: input.trim(), tags: [] }
      : { platform, label: label.trim() || input.trim().slice(0, 30), videoUrl: input.trim(), tags: [] }
    await window.livewall.addPreset(p)
    await refreshPresets()
    resetForm()
    setMsg('已添加预设')
  }

  async function saveEdit(): Promise<void> {
    if (!editingId) return
    await window.livewall.updatePreset(editingId, {
      label: label.trim() || undefined,
      roomId: platform === 'bilibili' ? input.trim() : undefined,
      videoUrl: platform === 'youtube' ? input.trim() : undefined
    })
    await refreshPresets()
    resetForm()
    setMsg('已更新预设')
  }

  async function remove(id: string): Promise<void> {
    await window.livewall.removePreset(id)
    await refreshPresets()
    if (editingId === id) resetForm()
  }

  function startEdit(p: Preset): void {
    setEditingId(p.id)
    setPlatform(p.platform)
    setInput(p.platform === 'bilibili' ? (p.roomId ?? '') : (p.videoUrl ?? ''))
    setLabel(p.label)
    setMsg('')
  }

  return (
    <div style={{ border: '1px solid #444', borderRadius: 8, padding: 12, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <b>预设管理</b>
        <span style={{ fontSize: 12, color: '#888' }}>全局共享，所有槽位可选用</span>
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        <select value={platform} onChange={(e) => setPlatform(e.target.value as Platform)}>
          <option value="bilibili">B站</option>
          <option value="youtube">YT</option>
        </select>
        <input
          placeholder={platform === 'bilibili' ? '房间号/URL' : 'watch URL'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          style={{ flex: 1, minWidth: 0 }}
        />
        <input
          placeholder="别名（可选）"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          style={{ width: 120 }}
        />
        {editingId ? (
          <>
            <button onClick={() => void saveEdit()} title="保存修改"><SaveIcon /></button>
            <button onClick={resetForm} title="取消编辑">✕</button>
          </>
        ) : (
          <button data-testid="preset-add" onClick={() => void add()} title="添加预设"><PlusIcon /></button>
        )}
      </div>
      {msg && <div style={{ color: '#e80', fontSize: 12, marginBottom: 8 }}>{msg}</div>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {presets.length === 0 && <span style={{ fontSize: 12, color: '#888' }}>暂无预设</span>}
        {presets.map((p) => {
          const usedSlot = presetUsage.get(p.id)
          return (
            <div
              key={p.id}
              data-testid={`preset-item-${p.id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 8px',
                border: '1px solid #444',
                borderRadius: 6,
                fontSize: 12,
                background: usedSlot !== undefined ? '#2a3a2a' : 'transparent'
              }}
            >
              <span>
                {p.platform === 'bilibili' ? 'B' : 'Y'}: {p.label}
                {usedSlot !== undefined && <span style={{ color: '#6c6' }}> (槽位 {usedSlot + 1})</span>}
              </span>
              <button onClick={() => startEdit(p)} title="编辑"><EditIcon /></button>
              <button data-testid={`preset-delete-${p.id}`} onClick={() => void remove(p.id)} title="删除"><TrashIcon /></button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SlotCard({ slot, layout, presets, presetUsage, refresh }: {
  slot: number
  layout: Layout
  presets: Preset[]
  presetUsage: Map<string, number>
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

  function pickPreset(id: string): void {
    const p = presets.find((x) => x.id === id)
    if (!p) return
    setPlatform(p.platform)
    setInput(p.platform === 'bilibili' ? (p.roomId ?? '') : (p.videoUrl ?? ''))
  }

  return (
    <div data-testid={`slot-card-${slot}`} style={{ border: '1px solid #444', borderRadius: 8, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <b>槽位 {slot + 1}</b>
        <span data-testid={`slot-status-${slot}`} style={{ color: '#888', fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {s?.source ? s.source.label : '空闲'}
        </span>
        <button onClick={() => void window.livewall.setVisible(slot, !(s?.visible ?? true)).then(refresh)} title={s?.visible ? '隐藏' : '显示'}>
          {s?.visible ? <EyeIcon /> : <EyeOffIcon />}
        </button>
      </div>
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
          <button data-testid={`slot-stop-${slot}`} onClick={stop} title="停止"><StopIcon /></button>
        ) : (
          <button data-testid={`slot-start-${slot}`} onClick={start} title="播放"><PlayIcon /></button>
        )}
      </div>
      <div style={{ marginBottom: 8 }}>
        <select
          data-testid={`slot-preset-${slot}`}
          style={{ width: '100%' }}
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
        <button onClick={() => void window.livewall.setAllVisible(!anyVisible).then(refresh)} title={anyVisible ? '全部隐藏' : '全部显示'}>
          {anyVisible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
        <button onClick={() => void window.livewall.openNotesDir()} title="笔记目录">
          <FolderIcon />
        </button>
      </div>
      <PresetManager presets={presets} presetUsage={presetUsage} refreshPresets={refreshPresets} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <SlotCard
            key={i}
            slot={i}
            layout={layout}
            presets={presets}
            presetUsage={presetUsage}
            refresh={refresh}
          />
        ))}
      </div>
    </div>
  )
}
