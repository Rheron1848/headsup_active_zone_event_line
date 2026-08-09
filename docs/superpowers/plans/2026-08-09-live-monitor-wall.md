# 多平台直播监控墙（livewall）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Windows 桌面应用：≤6 路 Bilibili/YouTube 直播悬浮同播，每路独立音量/布局/工具条，B 站扫码发弹幕，快捷笔记落 Markdown，NSIS 打包分发。

**Architecture:** 每路直播 = 独立 mpv.exe 进程（无边框置顶窗）+ 一个跟随的 Electron 透明工具条覆盖窗；Electron 主进程经命名管道 JSON IPC 控 mpv、经 koffi 调 Win32 管窗口；控制面板为 React SPA；纯逻辑（取流/弹幕/布局/笔记）集中在 `src/core/`，不依赖 Electron，vitest 单测覆盖。

**Tech Stack:** Electron + electron-vite + TypeScript + React · mpv.exe + yt-dlp.exe（随包分发）· koffi（Win32 FFI）· vitest · electron-builder（NSIS）

**Spec:** `docs/superpowers/specs/2026-08-09-live-monitor-wall-design.md`

## Global Constraints

- 目标平台仅 Windows 10/11 x64；一期不做其他平台。
- 最多 6 路（槽位 index 0..5）。
- B 站单账号；YouTube 只播不发。
- 笔记为本地 Markdown 文件，不做应用内浏览。
- 不引入 axios（用内置 fetch）；不引入需要 node-gyp 编译的原生模块（koffi 除外，其为纯预编译 FFI）。
- mpv/yt-dlp 二进制不提交 git，由 `scripts/fetch-binaries.mjs` 下载到 `resources/bin/`，打包时随包分发。
- 所有持久化文件在 `app.getPath('userData')` 下；测试用临时目录注入。
- 提交规范：`feat:` / `fix:` / `test:` / `chore:` 前缀。

## 仓库结构（目标态）

```
livewall/
  package.json  electron.vite.config.ts  vitest.config.ts  electron-builder.yml
  scripts/fetch-binaries.mjs
  resources/bin/            # mpv.exe yt-dlp.exe（gitignore）
  src/
    shared/types.ts         # Source/SlotState/Rect/ResolvedStream 等
    core/                   # 纯逻辑，无 Electron 依赖，vitest 覆盖
      resolver/{index.ts,bilibili.ts}
      danmaku/{bilibili.ts,login.ts,throttle.ts}
      layout/{tiling.ts,store.ts}
      notes/writer.ts
      presets/store.ts
    main/                   # Electron 主进程
      index.ts  win32.ts  mpv-ipc.ts  player-manager.ts
      window-tracker.ts  overlay-manager.ts  tray.ts  shortcuts.ts  ipc-handlers.ts
    preload/{panel.ts,overlay.ts}
    renderer/
      panel/                # 控制面板 React
      overlay/              # 工具条 React
  tests/                    # 与 src/core 镜像的 vitest 用例
```

---

## Task 1: M0 工程脚手架

**Files:**
- Create: `livewall/package.json`, `electron.vite.config.ts`, `vitest.config.ts`, `src/main/index.ts`, `src/preload/panel.ts`, `src/renderer/panel/{index.html,src/App.tsx}`, `.gitignore`

**Interfaces:**
- Produces: `npm run dev`（electron-vite dev）、`npm test`（vitest run）、`npm run build`。

- [ ] **Step 1: 脚手架**

```bash
npm create @quick-start/electron@latest livewall -- --template react-ts --skip
cd livewall && npm install
npm install -D vitest
npm install koffi
```

若交互式模板不可用，手工建 `package.json`：

```json
{
  "name": "livewall",
  "version": "0.1.0",
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "start": "electron-vite preview",
    "test": "vitest run"
  },
  "dependencies": { "koffi": "^2.9.0", "react": "^18.3.1", "react-dom": "^18.3.1" },
  "devDependencies": {
    "electron": "^31.0.0", "electron-vite": "^2.3.0", "typescript": "^5.5.0",
    "vite": "^5.3.0", "@vitejs/plugin-react": "^4.3.0", "vitest": "^2.0.0",
    "@types/react": "^18.3.0", "@types/react-dom": "^18.3.0", "@types/node": "^20.14.0"
  }
}
```

- [ ] **Step 2: 最小 main 进程**（`src/main/index.ts`）

```ts
import { app, BrowserWindow } from 'electron'
import path from 'node:path'

function createPanel(): void {
  const win = new BrowserWindow({
    width: 960, height: 640, title: 'livewall 控制面板',
    webPreferences: { preload: path.join(__dirname, '../preload/panel.js'), sandbox: false }
  })
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL + '/panel/')
  else win.loadFile(path.join(__dirname, '../renderer/panel/index.html'))
}

app.whenReady().then(() => {
  createPanel()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createPanel() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
```

`src/preload/panel.ts` 暂为 `import { contextBridge } from 'electron'; contextBridge.exposeInMainWorld('livewall', {})`。`src/renderer/panel/src/App.tsx` 渲染 `<h1>livewall</h1>` 占位。

- [ ] **Step 3: vitest 配置**（`vitest.config.ts`）

```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: { environment: 'node', include: ['tests/**/*.test.ts'] }
})
```

写一个冒烟用例 `tests/smoke.test.ts`：`it('works', () => { expect(1 + 1).toBe(2) })`。

- [ ] **Step 4: 验证**

Run: `npm test` → PASS；`npm run dev` → 弹出"livewall 控制面板"空窗口（Windows 目标机手测）。
`.gitignore`：`node_modules/ out/ dist/ resources/bin/`。

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: scaffold electron-vite + react + vitest"
```

---

## Task 2: M1a B 站取流解析器

**Files:**
- Create: `src/shared/types.ts`, `src/core/resolver/bilibili.ts`, `src/core/resolver/index.ts`
- Test: `tests/resolver/bilibili.test.ts`

**Interfaces:**
- Produces:
  - `resolveBilibili(roomInput: string, fetchFn?: typeof fetch): Promise<ResolvedStream>` — 接受房间号（长/短号）或含房间号的 URL；`fetchFn` 可注入便于测试。
  - `resolveSource(source: Source, fetchFn?): Promise<ResolvedStream>` — bilibili 走上面；youtube 直接返回 `{ url: videoUrl, headers: {} }`（交给 mpv ytdl hook）。
  - `ResolvedStream = { url: string; headers: Record<string,string>; title: string; platform: Platform; roomId?: string }`

- [ ] **Step 1: 共享类型**（`src/shared/types.ts`）

```ts
export type Platform = 'bilibili' | 'youtube'
export interface Source {
  platform: Platform
  label: string
  roomId?: string       // bilibili
  videoUrl?: string     // youtube watch URL
}
export interface Preset extends Source { id: string; tags: string[] }
export interface Rect { x: number; y: number; w: number; h: number }
export interface SlotState {
  index: number          // 0..5
  source: Source | null
  rect: Rect
  volume: number         // 0..100
  muted: boolean
  visible: boolean
}
export interface Layout { slots: SlotState[] }
export interface ResolvedStream {
  url: string
  headers: Record<string, string>
  title: string
  platform: Platform
  roomId?: string
}
```

- [ ] **Step 2: 写失败测试**（`tests/resolver/bilibili.test.ts`）

```ts
import { describe, it, expect } from 'vitest'
import { resolveBilibili, parseRoomInput } from '../../src/core/resolver/bilibili'

const roomInitResp = { code: 0, data: { room_id: 12345, live_status: 1 } }
const playInfoResp = {
  code: 0,
  data: {
    title: '测试直播间',
    playurl_info: { playurl: { stream: [
      { protocol_name: 'http_stream', format: [
        { format_name: 'flv', codec: [
          { codec_name: 'avc', current_qn: 10000, base_url: '/live/stream.flv?',
            url_info: [{ host: 'https://cn-live.example.com', base_url: '/live/stream.flv?', extra: '&token=abc' }] }
        ] }
      ] }
    ] } }
  }
}

function fakeFetch(route: Record<string, unknown>): typeof fetch {
  return (async (input: any) => {
    const url = String(input)
    for (const [k, v] of Object.entries(route)) {
      if (url.includes(k)) return new Response(JSON.stringify(v), { status: 200 })
    }
    throw new Error('unexpected url: ' + url)
  }) as typeof fetch
}

describe('parseRoomInput', () => {
  it('接受纯数字', () => expect(parseRoomInput('12345')).toBe('12345'))
  it('从直播 URL 提取', () =>
    expect(parseRoomInput('https://live.bilibili.com/12345?spm_id_from=x')).toBe('12345'))
  it('非法输入抛错', () => expect(() => parseRoomInput('hello')).toThrow())
})

describe('resolveBilibili', () => {
  it('短号→真实 room_id→拼接 flv 地址与请求头', async () => {
    const s = await resolveBilibili('6', fakeFetch({
      'room_init': roomInitResp, 'getRoomPlayInfo': playInfoResp
    }))
    expect(s.roomId).toBe('12345')
    expect(s.title).toBe('测试直播间')
    expect(s.url).toBe('https://cn-live.example.com/live/stream.flv?&token=abc')
    expect(s.headers.Referer).toBe('https://live.bilibili.com')
    expect(s.headers['User-Agent']).toContain('Mozilla')
  })
  it('未开播抛错', async () => {
    await expect(resolveBilibili('6', fakeFetch({
      'room_init': { code: 0, data: { room_id: 12345, live_status: 0 } }
    }))).rejects.toThrow(/未开播/)
  })
  it('接口 code 非 0 抛错', async () => {
    await expect(resolveBilibili('6', fakeFetch({
      'room_init': { code: -404, message: '啥都没有' }
    }))).rejects.toThrow()
  })
})
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npx vitest run tests/resolver/bilibili.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 4: 实现**（`src/core/resolver/bilibili.ts`）

```ts
import type { ResolvedStream } from '../../shared/types'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
const HEADERS: Record<string, string> = { Referer: 'https://live.bilibili.com', 'User-Agent': UA }

export function parseRoomInput(input: string): string {
  const s = input.trim()
  if (/^\d+$/.test(s)) return s
  const m = s.match(/live\.bilibili\.com\/(?:h5\/)?(\d+)/)
  if (m) return m[1]
  throw new Error(`无法识别的房间输入: ${input}`)
}

async function getJson(url: string, fetchFn: typeof fetch): Promise<any> {
  const resp = await fetchFn(url, { headers: HEADERS })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${url}`)
  const j = await resp.json()
  if (j.code !== 0) throw new Error(`bilibili API 错误 code=${j.code} message=${j.message ?? ''}`)
  return j.data
}

export async function resolveBilibili(
  roomInput: string,
  fetchFn: typeof fetch = fetch
): Promise<ResolvedStream> {
  const id = parseRoomInput(roomInput)
  const init = await getJson(
    `https://api.live.bilibili.com/room/v1/Room/room_init?id=${id}`, fetchFn)
  const roomId: number = init.room_id
  if (init.live_status !== 1) throw new Error(`房间 ${id} 未开播`)

  const info = await getJson(
    `https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo?room_id=${roomId}&protocol=0,1&format=0,1,2&codec=0,1&qn=10000&platform=web&ptype=8`,
    fetchFn)
  // 选第一个 http_stream/flv/avc 组合；url = host + base_url + extra
  const streams = info.playurl_info.playurl.stream
  for (const st of streams) {
    for (const fmt of st.format ?? []) {
      for (const codec of fmt.codec ?? []) {
        const ui = codec.url_info?.[0]
        if (ui) {
          return {
            url: `${ui.host}${codec.base_url}${ui.extra}`,
            headers: HEADERS,
            title: info.title ?? `bilibili-${roomId}`,
            platform: 'bilibili',
            roomId: String(roomId)
          }
        }
      }
    }
  }
  throw new Error('未找到可用流地址')
}
```

`src/core/resolver/index.ts`：

```ts
import type { ResolvedStream, Source } from '../../shared/types'
import { resolveBilibili } from './bilibili'

export async function resolveSource(
  source: Source, fetchFn: typeof fetch = fetch
): Promise<ResolvedStream> {
  if (source.platform === 'bilibili') {
    if (!source.roomId) throw new Error('bilibili 源缺少 roomId')
    return resolveBilibili(source.roomId, fetchFn)
  }
  if (!source.videoUrl) throw new Error('youtube 源缺少 videoUrl')
  return { url: source.videoUrl, headers: {}, title: source.label, platform: 'youtube' }
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run tests/resolver/bilibili.test.ts`
Expected: 6 passed

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/core/resolver tests/resolver && git commit -m "feat: bilibili stream resolver"
```

---

## Task 3: M1b mpv 参数构建与命名管道 IPC 客户端

**Files:**
- Create: `src/main/mpv-args.ts`（纯函数，可测）, `src/main/mpv-ipc.ts`
- Test: `tests/mpv/args.test.ts`, `tests/mpv/ipc-codec.test.ts`

**Interfaces:**
- Produces:
  - `buildMpvArgs(stream: ResolvedStream, slot: number, rect: Rect, volume: number, opts: { inputConfPath: string }): string[]` — 纯函数。
  - `mpvPipeName(slot: number): string` → `\\.\pipe\livewall-mpv-{slot}`。
  - `encodeCommand(args: (string|number|boolean)[], requestId: number): string` — 纯函数，以 `\n` 结尾。
  - `parseIpcLine(line: string): { kind: 'reply'; requestId: number; error: string; data?: unknown } | { kind: 'event'; event: string; data: unknown }` — 纯函数。
  - `class MpvIpc { constructor(pipe: string); connect(): Promise<void>; command(args): Promise<unknown>; setProperty(k,v): Promise<void>; getProperty<T>(k): Promise<T>; onEvent(cb): void; close(): void }`

- [ ] **Step 1: 写失败测试**（`tests/mpv/args.test.ts`）

```ts
import { describe, it, expect } from 'vitest'
import { buildMpvArgs, mpvPipeName } from '../../src/main/mpv-args'
import type { ResolvedStream } from '../../src/shared/types'

const bili: ResolvedStream = {
  url: 'https://cn-live.example.com/s.flv?token=abc',
  headers: { Referer: 'https://live.bilibili.com', 'User-Agent': 'UA-X' },
  title: '测试', platform: 'bilibili', roomId: '12345'
}

describe('buildMpvArgs', () => {
  it('含置顶无边框、标题、管道、几何、音量与请求头', () => {
    const a = buildMpvArgs(bili, 0, { x: 10, y: 20, w: 640, h: 360 }, 55, { inputConfPath: 'C:/app/wheel.conf' })
    expect(a).toContain('--ontop')
    expect(a).toContain('--no-border')
    expect(a).toContain('--title=livewall-slot-0')
    expect(a).toContain('--input-ipc-server=\\\\.\\pipe\\livewall-mpv-0')
    expect(a).toContain('--geometry=640x360+10+20')
    expect(a).toContain('--volume=55')
    expect(a).toContain('--input-conf=C:/app/wheel.conf')
    expect(a).toContain('--http-header-fields=Referer: https://live.bilibili.com')
    expect(a).toContain('--user-agent=UA-X')
    expect(a[a.length - 1]).toBe(bili.url)   // URL 永远最后
  })
  it('youtube 源无 headers 时不产出 header 参数', () => {
    const yt: ResolvedStream = { url: 'https://www.youtube.com/watch?v=x', headers: {}, title: 'yt', platform: 'youtube' }
    const a = buildMpvArgs(yt, 1, { x: 0, y: 0, w: 640, h: 360 }, 80, { inputConfPath: 'c' })
    expect(a.some(s => s.startsWith('--http-header-fields'))).toBe(false)
    expect(a).toContain('--ytdl=yes')
  })
})

it('mpvPipeName', () => expect(mpvPipeName(3)).toBe('\\\\.\\pipe\\livewall-mpv-3'))
```

`tests/mpv/ipc-codec.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { encodeCommand, parseIpcLine } from '../../src/main/mpv-ipc'

it('encodeCommand 输出单行 JSON + 换行', () => {
  expect(encodeCommand(['set_property', 'volume', 60], 7))
    .toBe('{"command":["set_property","volume",60],"request_id":7}\n')
})

describe('parseIpcLine', () => {
  it('解析 reply', () => {
    expect(parseIpcLine('{"data":66.0,"request_id":7,"error":"success"}'))
      .toEqual({ kind: 'reply', requestId: 7, error: 'success', data: 66 })
  })
  it('解析 event', () => {
    expect(parseIpcLine('{"event":"property-change","name":"pause","data":true}'))
      .toEqual({ kind: 'event', event: 'property-change', data: { event: 'property-change', name: 'pause', data: true } })
  })
})
```

- [ ] **Step 2: 跑测试确认失败** → `npx vitest run tests/mpv`，模块不存在。

- [ ] **Step 3: 实现 `src/main/mpv-args.ts`**

```ts
import type { Rect, ResolvedStream } from '../shared/types'

export function mpvPipeName(slot: number): string {
  return `\\\\.\\pipe\\livewall-mpv-${slot}`
}

export function buildMpvArgs(
  stream: ResolvedStream, slot: number, rect: Rect, volume: number,
  opts: { inputConfPath: string }
): string[] {
  const args = [
    '--ontop', '--no-border', '--keep-open=yes',
    `--title=livewall-slot-${slot}`,
    `--input-ipc-server=${mpvPipeName(slot)}`,
    `--geometry=${rect.w}x${rect.h}+${rect.x}+${rect.y}`,
    `--volume=${Math.round(volume)}`,
    `--input-conf=${opts.inputConfPath}`
  ]
  if (stream.platform === 'youtube') args.push('--ytdl=yes')
  const headerLines = Object.entries(stream.headers).map(([k, v]) => `${k}: ${v}`)
  if (headerLines.length) args.push(`--http-header-fields=${headerLines.join(',')}`)
  if (stream.headers['User-Agent']) args.push(`--user-agent=${stream.headers['User-Agent']}`)
  args.push(stream.url)
  return args
}
```

- [ ] **Step 4: 实现 `src/main/mpv-ipc.ts`**（编码/解析纯函数 + net.Socket 客户端）

```ts
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
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
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
          msg.error === 'success' ? p.resolve(msg.data) : p.reject(new Error(msg.error))
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
      this.pending.set(id, { resolve, reject })
      this.sock!.write(encodeCommand(args, id))
    })
  }

  setProperty(k: string, v: string | number | boolean): Promise<unknown> {
    return this.command(['set_property', k, v])
  }
  async getProperty<T>(k: string): Promise<T> { return (await this.command(['get_property', k])) as T }
  onEvent(cb: (data: unknown) => void): void { this.eventCbs.push(cb) }
  close(): void { this.sock?.destroy(); this.sock = null }
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run tests/mpv`
Expected: 全部 PASS（IPC 客户端本身不进单测，进程级验证在 Task 4 手测）。

- [ ] **Step 6: Commit**

```bash
git add src/main/mpv-args.ts src/main/mpv-ipc.ts tests/mpv && git commit -m "feat: mpv arg builder and named-pipe IPC client"
```

---

## Task 4: M1c 播放器进程管理 + 面板打通单路播放

**Files:**
- Create: `src/main/player-manager.ts`, `src/main/ipc-handlers.ts`, `scripts/fetch-binaries.mjs`, `resources/wheel-volume.conf`
- Modify: `src/main/index.ts`, `src/preload/panel.ts`, `src/renderer/panel/src/App.tsx`

**Interfaces:**
- Consumes: `resolveSource`、`buildMpvArgs`、`mpvPipeName`、`MpvIpc`。
- Produces:
  - `class PlayerManager { constructor(opts: { mpvPath: string; env: NodeJS.ProcessEnv; inputConfPath: string }); start(slot: number, stream: ResolvedStream, rect: Rect, volume: number): Promise<PlayerHandle>; stop(slot: number): Promise<void>; stopAll(): Promise<void>; get(slot): PlayerHandle | undefined }`
  - `PlayerHandle = { slot: number; ipc: MpvIpc; setVolume(v: number): Promise<void>; getTimePos(): Promise<number | null>; stop(): Promise<void> }`
  - 渲染进程桥：`window.livewall.startStream(slot, source)`, `window.livewall.stopStream(slot)`（IPC channel：`stream:start`, `stream:stop`）。

- [ ] **Step 1: 二进制下载脚本**（`scripts/fetch-binaries.mjs`，跑一次即可）

```js
// 用法: node scripts/fetch-binaries.mjs
// 下载 yt-dlp.exe（GitHub releases 最新）与 mpv x86_64 构建（sourceforge shinchiro）到 resources/bin/
import { createWriteStream, mkdirSync } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { execFileSync } from 'node:child_process'

mkdirSync('resources/bin', { recursive: true })
const ytdlp = await fetch('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe')
await pipeline(ytdlp.body, createWriteStream('resources/bin/yt-dlp.exe'))
// mpv: 从 https://sourceforge.net/projects/mpv-player-windows/files/64bit/ 取最新 7z，解压出 mpv.exe
// （实现时用 https://sourceforge.net/projects/mpv-player-windows/best_release.json 拿下载直链，7z 用系统 7z 或 7zip-bin 包解压）
console.log('done')
```

Run: `node scripts/fetch-binaries.mjs`，确认 `resources/bin/mpv.exe`、`resources/bin/yt-dlp.exe` 存在。

- [ ] **Step 2: 滚轮音量配置**（`resources/wheel-volume.conf`，打进应用包，dev 下从项目根取）

```
WHEEL_UP add volume 2
WHEEL_DOWN add volume -2
9 add volume -2
0 add volume 2
```

- [ ] **Step 3: 实现 `src/main/player-manager.ts`**

```ts
import { spawn, ChildProcess } from 'node:child_process'
import path from 'node:path'
import type { Rect, ResolvedStream } from '../shared/types'
import { buildMpvArgs, mpvPipeName } from './mpv-args'
import { MpvIpc } from './mpv-ipc'

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

  async start(slot: number, stream: ResolvedStream, rect: Rect, volume: number): Promise<PlayerHandle> {
    await this.stop(slot)
    const args = buildMpvArgs(stream, slot, rect, volume, { inputConfPath: this.opts.inputConfPath })
    const proc = spawn(this.opts.mpvPath, args, {
      env: { ...process.env, PATH: `${this.opts.ytDlpDir};${process.env.PATH}` },
      stdio: 'ignore'
    })
    const ipc = new MpvIpc(mpvPipeName(slot))
    // mpv 管道就绪有延迟：重试连接（100ms × 50）
    for (let i = 0; ; i++) {
      try { await ipc.connect(); break } catch (e) {
        if (i >= 50 || proc.exitCode !== null) throw new Error(`mpv slot ${slot} IPC 连接失败`)
        await new Promise(r => setTimeout(r, 100))
      }
    }
    this.players.set(slot, { proc, ipc })
    proc.on('exit', () => this.players.delete(slot))
    const self = this
    return {
      slot, ipc,
      async setVolume(v) { await ipc.setProperty('volume', Math.max(0, Math.min(100, v))) },
      async getTimePos() {
        try { return await ipc.getProperty<number>('time-pos') } catch { return null }
      },
      async stop() { await self.stop(slot) }
    }
  }

  async stop(slot: number): Promise<void> {
    const p = this.players.get(slot)
    if (!p) return
    this.players.delete(slot)
    try { await p.ipc.command(['quit']) } catch { /* 进程可能已死 */ }
    p.ipc.close()
    if (p.proc.exitCode === null) p.proc.kill()
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.players.keys()].map(s => this.stop(s)))
  }

  get(slot: number): { proc: ChildProcess; ipc: MpvIpc } | undefined { return this.players.get(slot) }
}
```

- [ ] **Step 4: 主进程接线**（`src/main/ipc-handlers.ts` + `index.ts`）

```ts
// ipc-handlers.ts
import { ipcMain } from 'electron'
import { resolveSource } from '../core/resolver'
import type { PlayerManager } from './player-manager'
import type { Source } from '../shared/types'

export function registerStreamHandlers(pm: PlayerManager): void {
  ipcMain.handle('stream:start', async (_e, slot: number, source: Source, rect, volume: number) => {
    const stream = await resolveSource(source)          // 未开播/解析失败会 throw，渲染端展示
    await pm.start(slot, stream, rect, volume)
    return { title: stream.title, roomId: stream.roomId }
  })
  ipcMain.handle('stream:stop', (_e, slot: number) => pm.stop(slot))
}
```

`index.ts`：创建 `PlayerManager`（`mpvPath = resources/bin/mpv.exe`，dev 路径用 `path.join(app.getAppPath(),'resources/bin')`，打包后用 `process.resourcesPath`，封装 `binDir()` 函数）；`app.whenReady` 里 `registerStreamHandlers(pm)`；`before-quit` 里 `pm.stopAll()`。
`preload/panel.ts`：

```ts
import { contextBridge, ipcRenderer } from 'electron'
contextBridge.exposeInMainWorld('livewall', {
  startStream: (slot: number, source: unknown, rect: unknown, volume: number) =>
    ipcRenderer.invoke('stream:start', slot, source, rect, volume),
  stopStream: (slot: number) => ipcRenderer.invoke('stream:stop', slot)
})
```

- [ ] **Step 5: 面板最小 UI**（`App.tsx`：一个输入框 + 开播/停止按钮，调 `window.livewall.startStream(0, {platform:'bilibili',roomId:输入值,label:输入值}, {x:100,y:100,w:640,h:360}, 60)`；错误 `alert` 展示）。

- [ ] **Step 6: 手测验收（Windows）**

- B 站：面板输入一个开播中的房间号 → mpv 无边框置顶窗口出现并有画面声音。
- YouTube：输入 watch URL → 同上（yt-dlp 经 PATH 生效）。
- 关闭面板 → mpv 全部退出。

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: player manager and single-stream playback (bilibili + youtube)"
```

---

## Task 5: M2a 槽位模型与布局持久化

**Files:**
- Create: `src/core/layout/store.ts`
- Test: `tests/layout/store.test.ts`

**Interfaces:**
- Produces:
  - `defaultLayout(): Layout` — 6 槽位，`source:null, volume:60, muted:false, visible:true`，rect 为 6 格平铺（依赖 Task 6 的 `tileRects`，先内联占位，Task 6 完成后改为调用）。
  - `class LayoutStore { constructor(filePath: string); load(): Layout; save(l: Layout): void; updateSlot(index: number, patch: Partial<SlotState>): Layout }` — load 时文件不存在返回 `defaultLayout()`；损坏 JSON 容错返回默认。

- [ ] **Step 1: 写失败测试**（`tests/layout/store.test.ts`）

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { LayoutStore, defaultLayout } from '../../src/core/layout/store'

let dir: string
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 'livewall-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

it('文件不存在时返回 6 槽位默认布局', () => {
  const l = new LayoutStore(path.join(dir, 'layout.json')).load()
  expect(l.slots).toHaveLength(6)
  expect(l.slots[0].volume).toBe(60)
  expect(l.slots.map(s => s.index)).toEqual([0, 1, 2, 3, 4, 5])
})

it('损坏 JSON 容错返回默认', () => {
  const p = path.join(dir, 'layout.json')
  writeFileSync(p, '{oops')
  expect(new LayoutStore(p).load().slots).toHaveLength(6)
})

it('updateSlot 局部更新并持久化，重载可见', () => {
  const p = path.join(dir, 'layout.json')
  const s = new LayoutStore(p)
  s.updateSlot(2, { volume: 30, muted: true, rect: { x: 1, y: 2, w: 3, h: 4 } })
  const re = new LayoutStore(p).load()
  expect(re.slots[2]).toMatchObject({ volume: 30, muted: true, rect: { x: 1, y: 2, w: 3, h: 4 } })
  expect(re.slots[1].volume).toBe(60)  // 其他槽位不受影响
})
```

- [ ] **Step 2: 跑测试确认失败** → `npx vitest run tests/layout`

- [ ] **Step 3: 实现 `src/core/layout/store.ts`**

```ts
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import type { Layout, SlotState } from '../../shared/types'

export function defaultLayout(): Layout {
  const slots: SlotState[] = Array.from({ length: 6 }, (_, i) => ({
    index: i,
    source: null,
    rect: { x: 0, y: 0, w: 640, h: 360 },   // Task 6 后替换为 tileRects 结果
    volume: 60,
    muted: false,
    visible: true
  }))
  return { slots }
}

export class LayoutStore {
  private cache: Layout | null = null
  constructor(private filePath: string) {}

  load(): Layout {
    if (this.cache) return this.cache
    try {
      const j = JSON.parse(readFileSync(this.filePath, 'utf8'))
      this.cache = normalize(j)
    } catch {
      this.cache = defaultLayout()
    }
    return this.cache
  }

  save(l: Layout): void {
    this.cache = l
    mkdirSync(path.dirname(this.filePath), { recursive: true })
    writeFileSync(this.filePath, JSON.stringify(l, null, 2), 'utf8')
  }

  updateSlot(index: number, patch: Partial<SlotState>): Layout {
    const l = this.load()
    const i = l.slots.findIndex(s => s.index === index)
    if (i < 0) throw new Error(`slot ${index} 不存在`)
    l.slots[i] = { ...l.slots[i], ...patch, index }
    this.save(l)
    return l
  }
}

function normalize(j: any): Layout {
  const d = defaultLayout()
  if (!Array.isArray(j?.slots)) return d
  for (const s of j.slots) {
    const t = d.slots.find(x => x.index === s?.index)
    if (t) Object.assign(t, s, { index: t.index })
  }
  return d
}
```

- [ ] **Step 4: 跑测试确认通过** → 3 passed

- [ ] **Step 5: Commit** → `git commit -m "feat: layout store with tolerant persistence"`

---

## Task 6: M2b 平铺算法

**Files:**
- Create: `src/core/layout/tiling.ts`
- Modify: `src/core/layout/store.ts`（defaultLayout 改用 tileRects）
- Test: `tests/layout/tiling.test.ts`

**Interfaces:**
- Produces: `tileRects(count: 1|2|3|4|5|6, area: Rect, gap?: number): Rect[]` — 网格：1→1×1，2→2×1，3→3×1，4→2×2，5/6→3×2；行优先填满，多余格子留空；返回数组长度 = count。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from 'vitest'
import { tileRects } from '../../src/core/layout/tiling'

const area = { x: 0, y: 0, w: 1920, h: 1040 }

describe('tileRects', () => {
  it('1 路铺满', () => {
    expect(tileRects(1, area, 4)).toEqual([{ x: 4, y: 4, w: 1912, h: 1032 }])
  })
  it('4 路 2×2 无重叠且覆盖全区', () => {
    const r = tileRects(4, area, 4)
    expect(r).toHaveLength(4)
    expect(r[0]).toEqual({ x: 4, y: 4, w: 954, h: 514 })
    expect(r[3].x).toBe(4 + 954 + 4)
    expect(r[3].y).toBe(4 + 514 + 4)
  })
  it('6 路 3×2', () => {
    const r = tileRects(6, area, 4)
    expect(r).toHaveLength(6)
    expect(r[5].x + r[5].w).toBe(area.w - 4)
  })
  it('5 路用 3×2 网格前 5 格', () => {
    const r5 = tileRects(5, area, 4)
    const r6 = tileRects(6, area, 4)
    expect(r5).toEqual(r6.slice(0, 5))
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现 `src/core/layout/tiling.ts`**

```ts
import type { Rect } from '../../shared/types'

const GRIDS: Record<number, [number, number]> = {
  1: [1, 1], 2: [2, 1], 3: [3, 1], 4: [2, 2], 5: [3, 2], 6: [3, 2]
}

export function tileRects(count: 1 | 2 | 3 | 4 | 5 | 6, area: Rect, gap = 4): Rect[] {
  const [cols, rows] = GRIDS[count]
  const cw = Math.floor((area.w - gap * (cols + 1)) / cols)
  const ch = Math.floor((area.h - gap * (rows + 1)) / rows)
  return Array.from({ length: count }, (_, i) => {
    const c = i % cols, r = Math.floor(i / cols)
    return { x: area.x + gap + c * (cw + gap), y: area.y + gap + r * (ch + gap), w: cw, h: ch }
  })
}
```

注意：1 路用上面公式得 `{x:4,y:4,w:1912,h:1032}`（1920-8=1912 ✓）；4 路 `cw=(1920-12)/2=954` ✓。

- [ ] **Step 4: store.ts 接入** — `defaultLayout()` 的 rect 改为调用方注入区域后的平铺结果？为保持 `LayoutStore` 与屏幕解耦，约定：**主进程在 load 后若所有 rect 均为占位（0,0）则执行一次 tile 并 save**。测试不变，重跑全绿。

- [ ] **Step 5: 跑测试确认通过** → `npx vitest run tests/layout` 全 PASS

- [ ] **Step 6: Commit** → `git commit -m "feat: tiling algorithm"`

---

## Task 7: M2c Win32 窗口控制 + 轮询跟踪器（移动/缩放/落盘）

**Files:**
- Create: `src/main/win32.ts`, `src/main/window-tracker.ts`
- Modify: `src/main/index.ts`（启动 tracker）
- Test: `tests/win32/rect.test.ts`（仅 RECT buffer 编解码纯函数）

**Interfaces:**
- Produces:
  - `findWindowByTitle(title: string): number | null`（HWND，Number 即可，koffi 处理）
  - `setWindowRect(hwnd: number, r: Rect): void`（SetWindowPos，含 HWND_TOPMOST）
  - `showWindow(hwnd: number, visible: boolean): void`
  - `getWindowRect(hwnd: number): Rect | null`
  - `class WindowTracker { constructor(layout: LayoutStore, pollMs?: number); start(): void; stop(): void; registerHwnd(slot: number, hwnd: number): void; unregisterHwnd(slot: number): void; onRectChanged?: (slot: number, r: Rect) => void }` — 每 `pollMs`（默认 150ms）对注册 hwnd 做 `GetWindowRect`，变化时调回调；tracker 自身防抖（500ms 无变化）后 `layout.updateSlot(slot, {rect})`。

- [ ] **Step 1: 写失败测试**（RECT buffer 编解码）

```ts
import { it, expect } from 'vitest'
import { encodeRect, decodeRect } from '../../src/main/win32'

it('RECT 16 字节小端往返', () => {
  const buf = encodeRect({ x: 10, y: -20, w: 640, h: 360 })  // 存 left/top/right/bottom
  expect(buf.length).toBe(16)
  expect(decodeRect(buf)).toEqual({ x: 10, y: -20, w: 640, h: 360 })
})
```

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现 `src/main/win32.ts`**

```ts
import koffi from 'koffi'
import type { Rect } from '../shared/types'

export function encodeRect(r: Rect): Buffer {
  const b = Buffer.alloc(16)
  b.writeInt32LE(r.x, 0); b.writeInt32LE(r.y, 4)
  b.writeInt32LE(r.x + r.w, 8); b.writeInt32LE(r.y + r.h, 12)
  return b
}
export function decodeRect(b: Buffer): Rect {
  const l = b.readInt32LE(0), t = b.readInt32LE(4)
  return { x: l, y: t, w: b.readInt32LE(8) - l, h: b.readInt32LE(12) - t }
}

const user32 = koffi.load('user32.dll')
const FindWindowW = user32.func('void* __stdcall FindWindowW(str16 cls, str16 title)')
const SetWindowPos = user32.func('bool __stdcall SetWindowPos(void* hwnd, void* after, int x, int y, int cx, int cy, uint32 flags)')
const ShowWindow = user32.func('bool __stdcall ShowWindow(void* hwnd, int cmd)')
const GetWindowRect = user32.func('bool __stdcall GetWindowRect(void* hwnd, void* rect)')

const SWP_NOACTIVATE = 0x0010, HWND_TOPMOST = -1
const SW_HIDE = 0, SW_SHOW = 5

export function findWindowByTitle(title: string): number | null {
  const h = FindWindowW(null, title)
  return h ? Number(koffi.address(h as object)) : null
}

export function setWindowRect(hwnd: number, r: Rect): void {
  SetWindowPos(hwnd as never, HWND_TOPMOST as never, r.x, r.y, r.w, r.h, SWP_NOACTIVATE)
}
export function showWindow(hwnd: number, visible: boolean): void {
  ShowWindow(hwnd as never, visible ? SW_SHOW : SW_HIDE)
}
export function getWindowRect(hwnd: number): Rect | null {
  const buf = Buffer.alloc(16)
  return GetWindowRect(hwnd as never, buf) ? decodeRect(buf) : null
}
```

> HWND 在 koffi 中以 `void*` 传递；若 `koffi.address` 方案在你的 koffi 版本不可用，改用 `uintptr_t` 类型签名直接收发 Number。实现时在 Windows 上以 Task 4 的播放窗口实测一次即可定稿。

- [ ] **Step 4: 实现 `src/main/window-tracker.ts`**

```ts
import type { Rect } from '../shared/types'
import type { LayoutStore } from '../core/layout/store'
import { getWindowRect } from './win32'

const eq = (a: Rect, b: Rect) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h

export class WindowTracker {
  private hwnds = new Map<number, number>()
  private last = new Map<number, Rect>()
  private dirtyAt = new Map<number, number>()
  private timer: NodeJS.Timeout | null = null
  onRectChanged: ((slot: number, r: Rect) => void) | null = null

  constructor(private layout: LayoutStore, private pollMs = 150) {}

  registerHwnd(slot: number, hwnd: number): void { this.hwnds.set(slot, hwnd) }
  unregisterHwnd(slot: number): void {
    this.hwnds.delete(slot); this.last.delete(slot); this.dirtyAt.delete(slot)
  }

  start(): void {
    this.timer = setInterval(() => this.tick(), this.pollMs)
  }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = null }

  private tick(): void {
    const now = Date.now()
    for (const [slot, hwnd] of this.hwnds) {
      const r = getWindowRect(hwnd)
      if (!r) continue
      const prev = this.last.get(slot)
      if (!prev || !eq(prev, r)) {
        this.last.set(slot, r)
        this.dirtyAt.set(slot, now)
        this.onRectChanged?.(slot, r)          // 供 overlay 跟随
      } else if (this.dirtyAt.has(slot) && now - this.dirtyAt.get(slot)! > 500) {
        this.layout.updateSlot(slot, { rect: r }) // 防抖落盘
        this.dirtyAt.delete(slot)
      }
    }
  }
}
```

- [ ] **Step 5: 主进程接线** — `PlayerManager.start` 成功后 `findWindowByTitle('livewall-slot-N')`（重试 10×100ms）→ `tracker.registerHwnd`；`stop` 时 `unregisterHwnd`。应用启动时读布局：若 rect 全为占位则对主屏 `screen.getPrimaryDisplay().workArea` 执行 `tileRects(6, ...)` 并 save。

- [ ] **Step 6: 手测验收（Windows）** — 开 2 路 → 拖动/缩放窗口 → 500ms 后 `layout.json` 更新；杀应用重启 → 窗口恢复上次位置。

- [ ] **Step 7: Commit** → `git commit -m "feat: win32 window control and tracking loop"`

---

## Task 8: M2d 面板六槽位 UI + 平铺按钮 + 全局显隐 + 托盘

**Files:**
- Create: `src/main/tray.ts`, `src/main/shortcuts.ts`
- Modify: `src/main/ipc-handlers.ts`, `src/main/index.ts`, `src/preload/panel.ts`, `src/renderer/panel/src/App.tsx`

**Interfaces:**
- Produces IPC（渲染端 `window.livewall.*`）：
  - `getLayout(): Promise<Layout>` / `tile(count): Promise<Layout>` / `setAllVisible(visible: boolean): Promise<void>`
  - `setVolume(slot, v): Promise<void>`（转发 PlayerHandle.setVolume + `layout.updateSlot`）
  - 热键：`Ctrl+Alt+H` 切换全部显隐。
- 托盘：图标菜单「显示/隐藏全部」「打开面板」「退出」。

- [ ] **Step 1: ipc-handlers 扩展**

```ts
ipcMain.handle('layout:get', () => layoutStore.load())
ipcMain.handle('layout:tile', (_e, count: 1|2|3|4|5|6) => {
  const area = screen.getPrimaryDisplay().workArea
  const rects = tileRects(count, area)
  const l = layoutStore.load()
  for (const s of l.slots.slice(0, count)) {
    const r = rects[s.index]
    const hwnd = hwndOf(s.index)          // 由 tracker 提供查询
    if (hwnd) setWindowRect(hwnd, r)
    layoutStore.updateSlot(s.index, { rect: r })
  }
  return layoutStore.load()
})
ipcMain.handle('stream:setAllVisible', (_e, visible: boolean) => setAllVisible(visible))
```

`setAllVisible`：遍历已注册 hwnd `showWindow(hwnd, v)`；隐藏时 `ipc.setProperty('volume', 0)`、显示时恢复 `layout` 里该槽音量；`layout.updateSlot(i, {visible})`。

- [ ] **Step 2: 托盘与热键**

```ts
// tray.ts
export function createTray(onToggleAll: () => void, onOpenPanel: () => void): Tray {
  const tray = new Tray(path.join(process.resourcesPath ?? '.', 'icon.png'))
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示/隐藏全部', click: onToggleAll },
    { label: '打开面板', click: onOpenPanel },
    { type: 'separator' },
    { label: '退出', click: () => app.exit(0) }
  ]))
  return tray
}
// shortcuts.ts
export function registerShortcuts(onToggleAll: () => void): void {
  globalShortcut.register('Ctrl+Alt+H', onToggleAll)
}
app.on('will-quit', () => globalShortcut.unregisterAll())
```

- [ ] **Step 3: 面板 UI** — 6 张槽位卡片网格：源输入（房间号/URL + 平台下拉）、开播/停止、音量 slider（`setVolume`）、平铺按钮组（1/2/3/4/5/6）、「全部显隐」按钮。状态以 `layout:get` 初始化，操作后刷新。

- [ ] **Step 4: 手测验收（Windows）** — 6 路同开互不干扰；点平铺 4 → 前 4 窗均分屏幕；`Ctrl+Alt+H` 全部隐藏（静音）再按恢复（音量回来）；托盘菜单三项可用。

- [ ] **Step 5: Commit** → `git commit -m "feat: six-slot panel, tiling, global visibility toggle, tray"`

---

## Task 9: M3 每路音量闭环（滑条/滚轮/持久化）

**Files:**
- Modify: `src/main/ipc-handlers.ts`, `src/main/player-manager.ts`, `src/renderer/panel/src/App.tsx`
- Test: `tests/player/volume.test.ts`（音量 clamp 纯函数）

**Interfaces:**
- Produces: `clampVolume(v: number): number`（0..100 取整）；IPC `stream:setVolume(slot, v)` 返回实际生效值。

- [ ] **Step 1: 写失败测试**

```ts
import { it, expect } from 'vitest'
import { clampVolume } from '../../src/main/player-manager'

it('clamp 到 0..100 并取整', () => {
  expect(clampVolume(-5)).toBe(0)
  expect(clampVolume(105)).toBe(100)
  expect(clampVolume(59.6)).toBe(60)
})
```

- [ ] **Step 2: 失败确认** → **Step 3: 实现**

```ts
export function clampVolume(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)))
}
// setVolume 内部改用 clampVolume
```

- [ ] **Step 4: IPC + 面板滑条防抖（200ms）调 `stream:setVolume`；handler 内 `handle.setVolume(v)` + `layout.updateSlot(slot, {volume: v})`。**

- [ ] **Step 5: 手测验收** — 面板滑条、滚轮各自生效互不影响；重启后各路音量恢复。

- [ ] **Step 6: Commit** → `git commit -m "feat: per-slot volume control with persistence"`

---

## Task 10: M4a B 站扫码登录与 Cookie 存储

**Files:**
- Create: `src/core/danmaku/login.ts`, `src/main/cookie-store.ts`
- Test: `tests/danmaku/login.test.ts`

**Interfaces:**
- Produces:
  - `parseSetCookies(setCookieHeaders: string[]): Record<string, string>` — 纯函数。
  - `createLoginQr(fetchFn?): Promise<{ url: string; qrcodeKey: string }>`
  - `pollLoginQr(qrcodeKey: string, fetchFn?): Promise<{ status: 'waiting' | 'scanned' | 'confirmed' | 'expired'; cookies?: Record<string,string> }>` — poll 接口 code：86101 未扫 / 86090 已扫未确认 / 0 成功（cookie 在响应 set-cookie）/ 86038 过期。
  - `class CookieStore { constructor(filePath: string, encrypt: (s: string) => Buffer, decrypt: (b: Buffer) => string); save(c: Record<string,string>): void; load(): Record<string,string> | null }` — 主进程用 `safeStorage.encryptString/decryptString` 注入。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from 'vitest'
import { parseSetCookies, pollLoginQr } from '../../src/core/danmaku/login'

it('parseSetCookies 提取键值、忽略属性', () => {
  const c = parseSetCookies([
    'SESSDATA=abc%2C123; Expires=Wed, 01 Jan 2031 00:00:00 GMT; Path=/; Domain=.bilibili.com',
    'bili_jct=xyz; Path=/'
  ])
  expect(c).toEqual({ SESSDATA: 'abc%2C123', bili_jct: 'xyz' })
})

describe('pollLoginQr', () => {
  const fake = (code: number, cookies: string[] = []): typeof fetch =>
    (async () => new Response(JSON.stringify({ code: 0, data: { code } }),
      { status: 200, headers: cookies.length ? { 'set-cookie': cookies.join(', ') } : {} })) as any
  // 注意：undici 的 Response 不暴露多值 set-cookie 拼接，实现时用 resp.headers.getSetCookie()
  it('86101→waiting, 86090→scanned, 86038→expired', async () => {
    expect((await pollLoginQr('k', fake(86101))).status).toBe('waiting')
    expect((await pollLoginQr('k', fake(86090))).status).toBe('scanned')
    expect((await pollLoginQr('k', fake(86038))).status).toBe('expired')
  })
  it('0→confirmed 且带回 cookie', async () => {
    const r = await pollLoginQr('k', fake(0, ['SESSDATA=s; Path=/', 'bili_jct=j; Path=/']))
    expect(r.status).toBe('confirmed')
    expect(r.cookies).toMatchObject({ SESSDATA: 's', bili_jct: 'j' })
  })
})
```

- [ ] **Step 2: 失败确认**

- [ ] **Step 3: 实现 `src/core/danmaku/login.ts`**

```ts
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

export type QrStatus = { status: 'waiting' | 'scanned' | 'confirmed' | 'expired'; cookies?: Record<string, string> }

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
        : [r.headers.get('set-cookie') ?? '']
    return { status: 'confirmed', cookies: parseSetCookies(setCookies) }
  }
  if (code === 86090) return { status: 'scanned' }
  if (code === 86038) return { status: 'expired' }
  return { status: 'waiting' }
}
```

`src/main/cookie-store.ts`：`save` 时 `JSON.stringify → encrypt → base64 写文件`；`load` 反向，失败返回 null。

- [ ] **Step 4: 通过确认** → `npx vitest run tests/danmaku/login.test.ts`

- [ ] **Step 5: 主进程接线 + 面板登录 UI** — IPC `auth:loginStart`（createLoginQr，返回 url；面板用 `qrcode` npm 包或 canvas 画二维码）、`auth:loginPoll`（确认后 CookieStore.save）、`auth:status`（有无有效 cookie）。面板登录区展示二维码与状态轮询（2s）。

- [ ] **Step 6: 手测验收** — 真账号扫码登录成功，重启应用 `auth:status` 仍为已登录。

- [ ] **Step 7: Commit** → `git commit -m "feat: bilibili QR login with encrypted cookie store"`

---

## Task 11: M4b 发弹幕

**Files:**
- Create: `src/core/danmaku/bilibili.ts`, `src/core/danmaku/throttle.ts`
- Modify: `src/main/ipc-handlers.ts`, `src/preload/panel.ts`, `src/renderer/panel/src/App.tsx`
- Test: `tests/danmaku/send.test.ts`, `tests/danmaku/throttle.test.ts`

**Interfaces:**
- Produces:
  - `buildDanmakuBody(p: { msg: string; roomId: string; csrf: string; rnd?: number }): URLSearchParams`
  - `sendDanmaku(cookies: Record<string,string>, roomId: string, msg: string, fetchFn?): Promise<{ ok: boolean; message: string }>` — 无 SESSDATA/bili_jct 直接返回 `{ok:false, message:'未登录'}`；响应 `code!==0` 透传 message。
  - `class Throttler { constructor(intervalMs: number, now?: () => number); tryAcquire(): boolean; retryAfterMs(): number }`
  - IPC `danmaku:send(slot, msg)` → 用该槽 source 的 roomId + CookieStore。

- [ ] **Step 1: 写失败测试**

```ts
// tests/danmaku/send.test.ts
import { describe, it, expect } from 'vitest'
import { buildDanmakuBody, sendDanmaku } from '../../src/core/danmaku/bilibili'

it('buildDanmakuBody 含必要字段', () => {
  const b = buildDanmakuBody({ msg: '主播好', roomId: '12345', csrf: 'jct', rnd: 1700000000 })
  expect(b.get('msg')).toBe('主播好')
  expect(b.get('roomid')).toBe('12345')
  expect(b.get('csrf')).toBe('jct')
  expect(b.get('csrf_token')).toBe('jct')
  expect(b.get('mode')).toBe('1')
  expect(b.get('fontsize')).toBe('25')
  expect(b.get('color')).toBe('16777215')
})

it('缺登录信息直接失败，不发请求', async () => {
  let called = false
  const f = (async () => { called = true; return new Response('{}') }) as any
  const r = await sendDanmaku({ bili_jct: 'j' }, '1', 'hi', f)   // 缺 SESSDATA
  expect(r.ok).toBe(false)
  expect(called).toBe(false)
})

it('接口报错透传 message', async () => {
  const f = (async () => new Response(JSON.stringify({ code: -101, message: '账号未登录' }))) as any
  const r = await sendDanmaku({ SESSDATA: 's', bili_jct: 'j' }, '1', 'hi', f)
  expect(r).toEqual({ ok: false, message: '账号未登录' })
})
```

```ts
// tests/danmaku/throttle.test.ts
import { it, expect } from 'vitest'
import { Throttler } from '../../src/core/danmaku/throttle'

it('窗口期内拒绝并给出剩余毫秒', () => {
  let t = 1000
  const th = new Throttler(3000, () => t)
  expect(th.tryAcquire()).toBe(true)
  t += 1000
  expect(th.tryAcquire()).toBe(false)
  expect(th.retryAfterMs()).toBe(2000)
  t += 2000
  expect(th.tryAcquire()).toBe(true)
})
```

- [ ] **Step 2: 失败确认**

- [ ] **Step 3: 实现**

```ts
// throttle.ts
export class Throttler {
  private last = -Infinity
  constructor(private intervalMs: number, private now: () => number = Date.now) {}
  tryAcquire(): boolean {
    if (this.now() - this.last < this.intervalMs) return false
    this.last = this.now(); return true
  }
  retryAfterMs(): number { return Math.max(0, this.intervalMs - (this.now() - this.last)) }
}

// bilibili.ts
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0'

export function buildDanmakuBody(p: { msg: string; roomId: string; csrf: string; rnd?: number }): URLSearchParams {
  const rnd = p.rnd ?? Math.floor(Date.now() / 1000)
  return new URLSearchParams({
    bubble: '0', msg: p.msg, color: '16777215', mode: '1', fontsize: '25',
    rnd: String(rnd), roomid: p.roomId, csrf: p.csrf, csrf_token: p.csrf
  })
}

export async function sendDanmaku(
  cookies: Record<string, string>, roomId: string, msg: string,
  fetchFn: typeof fetch = fetch
): Promise<{ ok: boolean; message: string }> {
  if (!cookies.SESSDATA || !cookies.bili_jct) return { ok: false, message: '未登录' }
  const cookieHeader = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ')
  const resp = await fetchFn('https://api.live.bilibili.com/msg/send', {
    method: 'POST',
    headers: {
      'User-Agent': UA, Referer: 'https://live.bilibili.com',
      Cookie: cookieHeader, 'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: buildDanmakuBody({ msg, roomId, csrf: cookies.bili_jct })
  })
  const j = await resp.json()
  return j.code === 0 ? { ok: true, message: '已发送' } : { ok: false, message: j.message ?? `code=${j.code}` }
}
```

- [ ] **Step 4: 通过确认**

- [ ] **Step 5: 主进程 + UI** — `danmaku:send(slot, msg)`：槽位无 bilibili 源 → `{ok:false}`；`Throttler(3000)` 每槽位一个，拒绝时返回 `{ok:false, message:'太快了，N 秒后再试'}`。面板每槽位加弹幕输入框（回车发送，结果显示 2s）。

- [ ] **Step 6: 手测验收** — 真号真房间发弹幕，直播间可见；3s 内连发被拒。

- [ ] **Step 7: Commit** → `git commit -m "feat: bilibili danmaku sending with throttle"`

---

## Task 12: M5 快捷笔记

**Files:**
- Create: `src/core/notes/writer.ts`
- Modify: `src/main/ipc-handlers.ts`, `src/preload/panel.ts`, 面板 UI
- Test: `tests/notes/writer.test.ts`

**Interfaces:**
- Produces:
  - `formatStreamPos(sec: number | null): string` — `null` → `'--:--:--'`；否则 `HH:MM:SS`。
  - `formatNoteLine(now: Date, streamPosSec: number | null, text: string): string` → `- [14:32:05] (流内 01:23:45) 文本`。
  - `noteFilePath(dir: string, now: Date, streamerName: string): string` → `{dir}/2026-08-09-主播名.md`（文件名非法字符替换为 `_`）。
  - `appendNote(dir, streamerName, now, posSec, text): string`（返回写入路径）。
  - IPC `note:add(slot, text)`：取该槽 PlayerHandle.getTimePos() + source.label；`note:openDir()`。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from 'vitest'
import { formatStreamPos, formatNoteLine, noteFilePath, appendNote } from '../../src/core/notes/writer'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

it('formatStreamPos', () => {
  expect(formatStreamPos(null)).toBe('--:--:--')
  expect(formatStreamPos(0)).toBe('00:00:00')
  expect(formatStreamPos(5025)).toBe('01:23:45')
})

it('formatNoteLine', () => {
  const now = new Date('2026-08-09T14:32:05')
  expect(formatNoteLine(now, 5025, '精彩操作')).toBe('- [14:32:05] (流内 01:23:45) 精彩操作')
})

it('noteFilePath 清洗非法字符', () => {
  const now = new Date('2026-08-09T14:32:05')
  expect(noteFilePath('/n', now, '主/播:A*B'))
    .toBe(path.join('/n', '2026-08-09-主_播_A_B.md'))
})

it('appendNote 追加写', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'livewall-notes-'))
  const now = new Date('2026-08-09T14:32:05')
  appendNote(dir, 's1', now, 10, '第一条')
  appendNote(dir, 's1', now, 20, '第二条')
  const content = readFileSync(noteFilePath(dir, now, 's1'), 'utf8')
  expect(content.split('\n').filter(Boolean)).toHaveLength(2)
  rmSync(dir, { recursive: true, force: true })
})
```

- [ ] **Step 2: 失败确认 → Step 3: 实现**

```ts
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
```

- [ ] **Step 4: 通过确认**

- [ ] **Step 5: 主进程 + UI** — `note:add` handler；面板每槽位「记笔记」按钮弹 prompt 输入；「打开笔记目录」按钮 `shell.openPath(notesDir)`。热键 `Ctrl+Alt+1..6` 注册在 shortcuts.ts，唤起一个小 popup 输入窗（复用 overlay 渲染入口，简单实现可用面板聚焦 + 选中对应槽位输入框）。

- [ ] **Step 6: 手测验收** — 播放中记一条笔记，文件内容与时间戳正确；无流时记笔记流内时间为 `--:--:--`。

- [ ] **Step 7: Commit** → `git commit -m "feat: quick notes to markdown"`

---

## Task 13: M5.5 工具条覆盖窗

**Files:**
- Create: `src/main/overlay-manager.ts`, `src/preload/overlay.ts`, `src/renderer/overlay/{index.html,src/Overlay.tsx}`
- Modify: `src/main/index.ts`（onRectChanged → overlay 移动）

**Interfaces:**
- Consumes: `WindowTracker.onRectChanged`、`PlayerHandle.setVolume/getTimePos`、IPC `danmaku:send`、`note:add`。
- Produces:
  - `class OverlayManager { create(slot: number): void; move(slot: number, r: Rect): void; destroy(slot: number): void; setAllVisible(v: boolean): void }`
  - 覆盖窗参数：`{ width: r.w, height: 36, x: r.x, y: r.y, frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true, focusable: false, resizable: false }`；置顶 level `'screen-saver'` 以确保在 mpv（普通 ontop）之上。

- [ ] **Step 1: OverlayManager**

```ts
import { BrowserWindow } from 'electron'
import path from 'node:path'
import type { Rect } from '../shared/types'

export class OverlayManager {
  private wins = new Map<number, BrowserWindow>()
  constructor(private rendererBase: string) {}  // dev: ELECTRON_RENDERER_URL；prod: 文件路径

  create(slot: number, r: Rect): void {
    this.destroy(slot)
    const w = new BrowserWindow({
      x: r.x, y: r.y, width: r.w, height: 36,
      frame: false, transparent: true, resizable: false, movable: false,
      alwaysOnTop: true, skipTaskbar: true, focusable: false, show: false,
      webPreferences: { preload: path.join(__dirname, '../preload/overlay.js'), sandbox: false }
    })
    w.setAlwaysOnTop(true, 'screen-saver')
    w.setIgnoreMouseEvents(true, { forward: true })   // 默认穿透
    w.loadURL(`${this.rendererBase}/overlay/?slot=${slot}`)
    w.once('ready-to-show', () => w.showInactive())
    this.wins.set(slot, w)
    w.on('closed', () => this.wins.delete(slot))
  }

  move(slot: number, r: Rect): void {
    this.wins.get(slot)?.setBounds({ x: r.x, y: r.y, width: r.w, height: 36 })
  }
  destroy(slot: number): void { this.wins.get(slot)?.destroy(); this.wins.delete(slot) }
  setAllVisible(v: boolean): void {
    for (const w of this.wins.values()) v ? w.showInactive() : w.hide()
  }
}
```

接线：`tracker.onRectChanged = (slot, r) => overlays.move(slot, r)`；`PlayerManager.start` 成功后 `overlays.create(slot, rect)`；`stop` 时 `overlays.destroy(slot)`；`setAllVisible` 同时作用于 overlay。

- [ ] **Step 2: 点击穿透切换** — `preload/overlay.ts` 暴露 `setInteractive(b: boolean)` → IPC `overlay:interactive(slot, b)` → 主进程 `win.setIgnoreMouseEvents(!b, {forward:true})`。`Overlay.tsx` 根元素 `onMouseEnter → setInteractive(true)`，`onMouseLeave → setInteractive(false)`。

- [ ] **Step 3: Overlay UI（React）** — 单行 flex 工具条（半透明黑底）：
  - 音量 slider + 静音 toggle（调 `stream:setVolume`）
  - 弹幕输入框（仅 bilibili 槽位显示）：回车 → `danmaku:send(slot, msg)`，结果 toast 2s
  - 「笔记」按钮：点击展开同行输入框，回车 → `note:add(slot, text)`
  - 「隐藏」按钮 → 该槽 `stream:setAllVisible` 的单槽版本 `stream:setVisible(slot, false)`（在 Task 8 handler 基础上加单槽支持）
  - 从 URL query 读 slot。

- [ ] **Step 4: 手测验收（Windows）** —
  - 工具条贴在每个 mpv 窗顶边，拖动直播窗时跟随（≤150ms 滞后）；
  - 鼠标在画面上操作不受挡（穿透），移到工具条上可交互；
  - 工具条音量/弹幕/笔记/隐藏均可用；全局显隐时工具条同步。

- [ ] **Step 5: Commit** → `git commit -m "feat: per-stream overlay toolbar"`

---

## Task 14: M6 打磨与 NSIS 打包

**Files:**
- Create: `electron-builder.yml`
- Modify: `package.json`（`dist` 脚本）、`src/main/index.ts`（binDir 双路径）、设置页（yt-dlp 更新按钮）

- [ ] **Step 1: binDir 双路径**

```ts
function binDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'bin')
    : path.join(app.getAppPath(), 'resources', 'bin')
}
```

- [ ] **Step 2: `electron-builder.yml`**

```yaml
appId: com.livewall.app
productName: livewall
directories: { output: dist }
files:
  - out/**
  - resources/wheel-volume.conf
extraResources:
  - from: resources/bin
    to: bin
    filter: ["**/*"]
win:
  target: nsis
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
```

`package.json` 加 `"dist": "electron-vite build && electron-builder"`；`npm install -D electron-builder`。

- [ ] **Step 3: yt-dlp 一键更新** — 设置页按钮 → 主进程下载 `https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe` 覆盖 `binDir()/yt-dlp.exe`（打包后 resources 只读 → 下载到 `userData/bin/` 并优先使用该路径；PlayerManager spawn 时 PATH 先查 userData/bin 再查内置 bin）。

- [ ] **Step 4: 打磨清单**
  - 解析失败/未开播：面板槽位卡片红字显示原因（handler 错误 message 透传）。
  - mpv 崩溃：tracker 发现 hwnd 消失且进程退出 → 槽位卡片置灰 + 「重开」按钮。
  - Cookie 失效：`auth:status` 启动时试取一次 `nav` 接口校验，失效提示重扫。

- [ ] **Step 5: 验收（干净 Windows 机器）** — `npm run dist` 产出 `dist/livewall Setup x.y.z.exe`；虚拟机/干净机安装：6 路同播、布局恢复、弹幕、笔记、工具条、托盘全部可用；卸载无残留（userData 除外）。

- [ ] **Step 6: Commit** → `git commit -m "chore: nsis packaging and polish"`

---

## 自查记录（writing-plans self-review）

- **Spec 覆盖**：§3.1→Task 2/4；§3.2→Task 3/4；§3.3→Task 5/6/7；§3.4→Task 10/11；§3.5→Task 12；§3.6→预设 CRUD 并入 Task 8 面板 UI（`src/core/presets/store.ts` 仿 LayoutStore，JSON 数组 CRUD，测试同构）；§3.7→Task 8；§3.8→Task 13；打包→Task 14。热键 Ctrl+Alt+1..6 → Task 12 Step 5。
- **类型一致性**：`ResolvedStream`/`SlotState`/`Rect` 在 Task 2 定义后全计划复用；`mpvPipeName` 仅 Task 3/4 使用且签名一致；`clampVolume` 定义于 Task 9 并被 PlayerManager 使用。
- **已知留白**：`presets/store.ts` 未给完整代码（与 LayoutStore 同构，执行时按同模式实现并配测试）；React UI 以行为描述为主、组件代码从简——执行代理需按描述实现完整 UI。
