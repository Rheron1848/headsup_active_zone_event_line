import net from 'node:net'

export function encodeCommand(args: (string | number | boolean)[], requestId: number): string {
  return JSON.stringify({ command: args, request_id: requestId }) + '\n'
}

export type IpcMsg =
  | { kind: 'reply'; requestId: number; error: string; data?: unknown }
  | { kind: 'event'; event: string; data: unknown }

export function parseIpcLine(line: string): IpcMsg {
  const j = JSON.parse(line)
  if (j.event) return { kind: 'event', event: j.event, data: j }
  return { kind: 'reply', requestId: j.request_id ?? -1, error: j.error, data: j.data }
}

export class MpvIpc {
  private sock: net.Socket | null = null
  private buf = ''
  private nextId = 1
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >()
  private eventCbs: ((data: unknown) => void)[] = []

  constructor(private pipe: string) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.sock = net.connect(this.pipe)
      this.sock.once('connect', () => resolve())
      this.sock.once('error', reject)
      this.sock.on('data', (d) => this.onData(d.toString('utf8')))
      this.sock.on('close', () => {
        for (const p of this.pending.values()) p.reject(new Error('mpv ipc closed'))
        this.pending.clear()
      })
    })
  }

  private onData(chunk: string): void {
    this.buf += chunk
    let i: number
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, i).trim()
      this.buf = this.buf.slice(i + 1)
      if (!line) continue
      const msg = parseIpcLine(line)
      if (msg.kind === 'reply') {
        const p = this.pending.get(msg.requestId)
        if (p) {
          this.pending.delete(msg.requestId)
          if (msg.error === 'success') p.resolve(msg.data)
          else p.reject(new Error(msg.error))
        }
      } else {
        for (const cb of this.eventCbs) cb(msg.data)
      }
    }
  }

  command(args: (string | number | boolean)[]): Promise<unknown> {
    if (!this.sock) return Promise.reject(new Error('not connected'))
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error('mpv ipc 超时'))
      }, 5000)
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer)
          resolve(v)
        },
        reject: (e) => {
          clearTimeout(timer)
          reject(e)
        }
      })
      this.sock!.write(encodeCommand(args, id))
    })
  }

  setProperty(k: string, v: string | number | boolean): Promise<unknown> {
    return this.command(['set_property', k, v])
  }

  async getProperty<T>(k: string): Promise<T> {
    return (await this.command(['get_property', k])) as T
  }

  onEvent(cb: (data: unknown) => void): void {
    this.eventCbs.push(cb)
  }

  close(): void {
    this.sock?.destroy()
    this.sock = null
  }
}
