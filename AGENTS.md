# 仓库指南

多平台直播悬浮监控墙（Windows 目标平台）。设计文档：`docs/superpowers/specs/2026-08-09-live-monitor-wall-design.md`；实施计划：`docs/superpowers/plans/2026-08-09-live-monitor-wall.md`；交接状态：`docs/dev-handover.md`。

## 结构

- `livewall/` — Electron 应用（全部代码在此）
  - `src/shared/types.ts` — 全局共享类型（Source/SlotState/Rect/Layout/ResolvedStream/Preset）
  - `src/core/` — 纯逻辑，无 Electron 依赖，vitest 全覆盖：resolver（取流）/ danmaku（登录+发弹幕+节流）/ layout（平铺+存储）/ notes（Markdown 笔记）/ presets（预设源）
  - `src/main/` — Electron 主进程：player-manager（mpv 进程）、mpv-ipc（命名管道 JSON IPC）、mpv-args、win32 + win32-rect + window-tracker（窗口控制/跟随）、overlay-manager（工具条覆盖窗）、ipc-handlers、tray、shortcuts、cookie-store
  - `src/preload/`、`src/renderer/{panel,overlay}/` — 面板与工具条 UI（React）
  - `scripts/` — fetch-binaries.mjs（下载 mpv/yt-dlp 到 resources/bin/）、test-*.mts（本机链路验证脚本）
  - `tests/` — vitest，与 src 镜像

## 常用命令（在 livewall/ 下）

```bash
npm install
node scripts/fetch-binaries.mjs   # 下载 mpv + yt-dlp 到 resources/bin/（gitignore，必须跑）
npm run dev                       # 开发模式
npm test                          # vitest（必须全绿才算完成）
npm run e2e                       # 构建 + Playwright Electron 端到端验收
npx tsc --noEmit                  # 类型检查（必须干净）
npm run build                     # electron-vite 构建
npm run dist                      # electron-builder NSIS 安装包（仅 Windows）
```

## 约定

- 提交信息用中文、`feat:/fix:/test:/chore:/docs:` 前缀
- 纯逻辑一律放 `src/core/` 并配 vitest；Electron/Win32 依赖注入以便测试（参见 WindowTracker 的构造注入）
- 不引入 axios（用内置 fetch）；不引入需要 node-gyp 的原生模块（koffi 除外）
- win32.ts 的 koffi 绑定必须保持惰性加载，保证非 Windows 平台 import 不炸、单测可跑
- `resources/bin/` 二进制不进 git；`.tools/`（开发机本地 Node）不进 git
