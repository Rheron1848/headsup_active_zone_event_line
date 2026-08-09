import { appendFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const pad = (n: number) => String(n).padStart(2, '0')

export function formatStreamPos(sec: number | null): string {
  if (sec === null) return '--:--:--'
  const s = Math.max(0, Math.floor(sec))
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`
}

export function formatNoteLine(now: Date, streamPosSec: number | null, text: string): string {
  const wall = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  return `- [${wall}] (流内 ${formatStreamPos(streamPosSec)}) ${text.replace(/\n/g, ' ')}`
}

const dateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export function noteFilePath(dir: string, now: Date, streamerName: string): string {
  const safe = streamerName.replace(/[\\/:*?"<>|]/g, '_').slice(0, 50) || 'unknown'
  return path.join(dir, `${dateStr(now)}-${safe}.md`)
}

export function appendNote(
  dir: string, streamerName: string, now: Date, posSec: number | null, text: string
): string {
  mkdirSync(dir, { recursive: true })
  const p = noteFilePath(dir, now, streamerName)
  appendFileSync(p, formatNoteLine(now, posSec, text) + '\n', 'utf8')
  return p
}
