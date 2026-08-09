import { spawn, ChildProcess } from 'node:child_process'
import type { Rect, ResolvedStream } from '../shared/types'
import { buildMpvArgs, mpvPipeName } from './mpv-args'
import { MpvIpc } from './mpv-ipc'

export function clampVolume(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)))
}

export interface PlayerHandle {
  slot: number
  ipc: MpvIpc
  setVolume(v: number): Promise<void>
  getTimePos(): Promise<number | null>
  stop(): Promise<void>
}

export class PlayerManager {
  private players = new Map<number, { proc: ChildProcess; ipc: MpvIpc }>()

  constructor(private opts: { mpvPath: string; ytDlpDir: string; inputConfPath: string }) {}

  async start(
    slot: number,
    stream: ResolvedStream,
    rect: Rect,
    volume: number
  ): Promise<PlayerHandle> {
    await this.stop(slot)
    const args = buildMpvArgs(stream, slot, rect, volume, {
      inputConfPath: this.opts.inputConfPath
    })
    const proc = spawn(this.opts.mpvPath, args, {
      env: { ...process.env, PATH: `${this.opts.ytDlpDir}:${process.env.PATH}` },
      stdio: 'ignore'
    })
    const ipc = new MpvIpc(mpvPipeName(slot))
    // mpv 管道就绪有延迟：重试连接（100ms × 50）
    for (let i = 0; ; i++) {
      try {
        await ipc.connect()
        break
      } catch {
        if (i >= 50 || proc.exitCode !== null) throw new Error(`mpv slot ${slot} IPC 连接失败`)
        await new Promise((r) => setTimeout(r, 100))
      }
    }
    this.players.set(slot, { proc, ipc })
    proc.on('exit', () => this.players.delete(slot))
    const self = this
    return {
      slot,
      ipc,
      async setVolume(v) {
        await ipc.setProperty('volume', clampVolume(v))
      },
      async getTimePos() {
        try {
          return await ipc.getProperty<number>('time-pos')
        } catch {
          return null
        }
      },
      async stop() {
        await self.stop(slot)
      }
    }
  }

  async stop(slot: number): Promise<void> {
    const p = this.players.get(slot)
    if (!p) return
    this.players.delete(slot)
    try {
      await p.ipc.command(['quit'])
    } catch {
      // 进程可能已死
    }
    p.ipc.close()
    if (p.proc.exitCode === null) p.proc.kill()
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.players.keys()].map((s) => this.stop(s)))
  }

  get(slot: number): { proc: ChildProcess; ipc: MpvIpc } | undefined {
    return this.players.get(slot)
  }
}
