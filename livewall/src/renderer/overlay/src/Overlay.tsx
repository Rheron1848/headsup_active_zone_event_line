import React, { useRef, useState } from 'react'

declare global {
  interface Window {
    livewallOverlay: {
      setInteractive: (b: boolean) => void
      setVolume: (slot: number, v: number) => Promise<number>
      sendDanmaku: (slot: number, msg: string) => Promise<{ ok: boolean; message: string }>
      addNote: (slot: number, text: string) => Promise<string>
      setVisible: (slot: number, visible: boolean) => Promise<void>
    }
  }
}

const slot = Number(new URLSearchParams(window.location.search).get('slot') ?? '-1')

const font: React.CSSProperties = { fontSize: 12, color: '#fff' }

const btn: React.CSSProperties = {
  ...font,
  background: 'rgba(255,255,255,0.15)',
  border: 'none',
  borderRadius: 4,
  padding: '2px 8px',
  cursor: 'pointer',
  flexShrink: 0
}

const input: React.CSSProperties = {
  ...font,
  background: 'rgba(255,255,255,0.12)',
  border: '1px solid rgba(255,255,255,0.25)',
  borderRadius: 4,
  padding: '2px 6px',
  outline: 'none',
  width: 120
}

export default function Overlay() {
  const [volume, setVolume] = useState(60)
  const [danmaku, setDanmaku] = useState('')
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2000)
  }

  const onVolume = (v: number) => {
    setVolume(v)
    void window.livewallOverlay.setVolume(slot, v)
  }

  const onSendDanmaku = async () => {
    const msg = danmaku.trim()
    if (!msg) return
    setDanmaku('')
    const r = await window.livewallOverlay.sendDanmaku(slot, msg)
    showToast(r.ok ? '弹幕已发送' : `发送失败：${r.message}`)
  }

  const onAddNote = async () => {
    const text = note.trim()
    if (!text) return
    setNote('')
    await window.livewallOverlay.addNote(slot, text)
    showToast('笔记已保存')
  }

  return (
    <div
      onMouseEnter={() => window.livewallOverlay.setInteractive(true)}
      onMouseLeave={() => window.livewallOverlay.setInteractive(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 36,
        padding: '0 10px',
        boxSizing: 'border-box',
        background: 'rgba(0,0,0,0.75)',
        borderRadius: 8,
        fontFamily: 'sans-serif',
        userSelect: 'none'
      }}
    >
      <span style={{ ...font, flexShrink: 0, opacity: 0.7 }}>槽{slot + 1}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={volume}
        onChange={(e) => onVolume(Number(e.target.value))}
        style={{ width: 70, flexShrink: 0 }}
        title={`音量 ${volume}`}
      />
      <input
        style={{ ...input, flex: 1, minWidth: 60 }}
        placeholder="发弹幕，回车发送"
        title="弹幕输入框：回车发送（需先在面板扫码登录 B 站）"
        value={danmaku}
        onChange={(e) => setDanmaku(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void onSendDanmaku()
        }}
      />
      {noteOpen ? (
        <input
          style={{ ...input, flex: 1, minWidth: 60 }}
          placeholder="笔记内容，回车保存"
          title="笔记：回车保存（带播放时间戳，存为 Markdown）"
          autoFocus
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              void onAddNote()
              setNoteOpen(false)
            } else if (e.key === 'Escape') {
              setNoteOpen(false)
            }
          }}
          onBlur={() => setNoteOpen(false)}
        />
      ) : (
        <button style={btn} title="记录笔记（带当前播放时间戳）" onClick={() => setNoteOpen(true)}>
          笔记
        </button>
      )}
      <button
        style={btn}
        title="隐藏本路画面（在控制面板点眼睛图标或按 Ctrl+Alt+H 恢复）"
        onClick={() => void window.livewallOverlay.setVisible(slot, false)}
      >
        隐藏
      </button>
      {toast && (
        <span style={{ ...font, flexShrink: 0, color: '#8f8', whiteSpace: 'nowrap' }}>
          {toast}
        </span>
      )}
    </div>
  )
}
