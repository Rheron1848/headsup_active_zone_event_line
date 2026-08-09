import { spawn, ChildProcess } from 'node:child_process'
import path from 'node:path'
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

interface StartParams {
  stream: ResolvedStream
  rect: Rect
  volume: number
}

const MAX_RESTARTS = 3

export class PlayerManager {
  private players = new Map<number, { proc: ChildProcess; ipc: MpvIpc }>()
  private lastParams = new Map<number, StartParams>()
  private restartCount = new Map<number, number>()
  private intentionalStop = new Set<number>()

  /** 非手动停止导致的退出。restarted=true 表示已自动重拉。 */
  onExit: ((slot: number, restarted: boolean) => void) | null = null

  constructor(private opts: { mpvPath: string; ytDlpDir: string; inputConfPath: string }) {}

  async start(
    slot: number,
    stream: ResolvedStream,
    rect: Rect,
    volume: number
  ): Promise<PlayerHandle> {
    await this.stop(slot)
    this.lastParams.set(slot, { stream, rect, volume })
    this.restartCount.set(slot, 0)
    return this.spawn(slot, stream, rect, volume)
  }

  private async spawn(
    slot: number,
    stream: ResolvedStream,
    rect: Rect,
    volume: number
  ): Promise<PlayerHandle> {
    const args = buildMpvArgs(stream, slot, rect, volume, {
      inputConfPath: this.opts.inputConfPath
    })
    const proc = spawn(this.opts.mpvPath, args, {
      env: {
        ...process.env,
        PATH: `${this.opts.ytDlpDir}${path.delimiter}${process.env.PATH}`
      },
      stdio: 'ignore'
    })
    const ipc = new MpvIpc(mpvPipeName(slot))
    // mpv 管道就绪有延迟：重试连接（100ms × 50）
    try {
      for (let i = 0; ; i++) {
        try {
          await ipc.connect()
          break
        } catch {
          if (i >= 50 || proc.exitCode !== null) throw new Error(`mpv slot ${slot} IPC 连接失败`)
          await new Promise((r) => setTimeout(r, 100))
        }
      }
    } catch (e) {
      // 连接失败必须收掉已起来的 mpv，避免无控窗口残留
      if (proc.exitCode === null) proc.kill()
      throw e
    }
    this.players.set(slot, { proc, ipc })
    proc.on('exit', () => this.handleExit(slot))
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

  private handleExit(slot: number): void {
    const p = this.players.get(slot)
    if (!p) return
    this.players.delete(slot)
    p.ipc.close()
    if (this.intentionalStop.has(slot)) {
      this.intentionalStop.delete(slot)
      return
    }
    // 非预期退出：指数退避重拉，最多 MAX_RESTARTS 次
    const n = this.restartCount.get(slot) ?? 0
    const params = this.lastParams.get(slot)
    if (!params || n >= MAX_RESTARTS) {
      this.onExit?.(slot, false)
      return
    }
    this.restartCount.set(slot, n + 1)
    const delayMs = 1000 * 2 ** n
    setTimeout(() => {
      this.spawn(slot, params.stream, params.rect, params.volume)
        .then(() => this.onExit?.(slot, true))
        .catch(() => this.onExit?.(slot, false))
    }, delayMs)
  }

  async stop(slot: number): Promise<void> {
    this.intentionalStop.add(slot)
    this.lastParams.delete(slot)
    const p = this.players.get(slot)
    if (!p) {
      this.intentionalStop.delete(slot)
      return
    }
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
