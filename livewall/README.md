# livewall

## 中文

献给灰泽满Hazel

本代码由 Kimi K3 参与生成。

### 简介

livewall 是一个 Windows 桌面应用：多路（最多 6 路）Bilibili / YouTube 直播悬浮监控墙。每路用独立 `mpv.exe` 窗口播放，Electron 主进程通过命名管道 IPC 控制 mpv、通过 Win32 API 管理窗口，另有一个透明工具条覆盖窗贴在每个直播窗顶边。

### 功能

- 最多 6 路直播同播，每路独立音量、布局、显隐
- B 站直播间 / 视频播放（BV/av 号走 yt-dlp）
- YouTube 视频播放
- B 站扫码登录、发送弹幕（带 3 秒节流）
- 快捷笔记（时间戳 + 文本，落盘 Markdown）
- 预设源统一管理
- 工具条覆盖窗：音量、弹幕、笔记、显隐
- 全局显隐热键 `Ctrl+Alt+H`、笔记热键 `Ctrl+Alt+1..6`
- 布局持久化、平铺预设（1/2/3/4/5/6）
- NSIS 打包分发

### 开发

```bash
npm install
node scripts/fetch-binaries.mjs   # 下载 mpv + yt-dlp 到 resources/bin/
npm run dev
npm test
npm run e2e
npx tsc --noEmit
npm run build
npm run dist
```

### 结构

```
livewall/
  src/shared/types.ts       # 全局共享类型
  src/core/                 # 纯逻辑（无 Electron 依赖）
  src/main/                 # Electron 主进程
  src/preload/              # 预加载脚本
  src/renderer/panel/       # 控制面板 React
  src/renderer/overlay/     # 工具条 React
  tests/                    # vitest 单元测试
  tests-e2e/                # Playwright 端到端测试
```

---

## English

Dedicated to Hazel

This code was generated with the participation of Kimi K3.

### Introduction

livewall is a Windows desktop application: a floating monitoring wall for multiple (up to 6) Bilibili / YouTube live streams. Each stream plays in an independent `mpv.exe` window; the Electron main process controls mpv via named-pipe IPC and manages windows via Win32 API. A transparent toolbar overlay window is attached to the top edge of each stream window.

### Features

- Up to 6 concurrent streams with independent volume, layout and visibility
- Bilibili live rooms / videos (BV/av numbers resolved via yt-dlp)
- YouTube video playback
- Bilibili QR login and danmaku sending (3-second throttle)
- Quick notes (timestamp + text, saved as Markdown)
- Unified preset source management
- Per-stream toolbar overlay: volume, danmaku, notes, visibility
- Global visibility hotkey `Ctrl+Alt+H`, note hotkeys `Ctrl+Alt+1..6`
- Layout persistence and tiling presets (1/2/3/4/5/6)
- NSIS packaging

### Development

```bash
npm install
node scripts/fetch-binaries.mjs   # download mpv + yt-dlp into resources/bin/
npm run dev
npm test
npm run e2e
npx tsc --noEmit
npm run build
npm run dist
```

### Structure

```
livewall/
  src/shared/types.ts       # shared types
  src/core/                 # pure logic (no Electron deps)
  src/main/                 # Electron main process
  src/preload/              # preload scripts
  src/renderer/panel/       # control panel React
  src/renderer/overlay/     # toolbar React
  tests/                    # vitest unit tests
  tests-e2e/                # Playwright E2E tests
```
