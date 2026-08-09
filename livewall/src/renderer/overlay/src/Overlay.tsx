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
        placeholder="弹幕…"
        value={danmaku}
        onChange={(e) => setDanmaku(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void onSendDanmaku()
        }}
      />
      {noteOpen ? (
        <input
          style={{ ...input, flex: 1, minWidth: 60 }}
          placeholder="笔记…"
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
        <button style={btn} onClick={() => setNoteOpen(true)}>
          笔记
        </button>
      )}
      <button style={btn} onClick={() => void window.livewallOverlay.setVisible(slot, false)}>
        隐
      </button>
      {toast && (
        <span style={{ ...font, flexShrink: 0, color: '#8f8', whiteSpace: 'nowrap' }}>
          {toast}
        </span>
      )}
    </div>
  )
}
