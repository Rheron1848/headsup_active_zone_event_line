# 开发交接（2026-08-10 更新）

## 当前状态

仓库已改名 `headsup_active_zone_event_marker_livewall`，remote 走 SSH（`git@github.com:Rheron1848/...`），提交署名 `Rheron1848 <rheronren@outlook.com>`。README 在仓库根目录，先中文后英文双语，标注「献给灰泽满Hazel / Kimi K3 参与生成」；关键源码文件（types.ts、main/index.ts、win32.ts、resolver/bilibili.ts）有双语注释。

代码在 `main` 分支，58 个 vitest 全绿，`tsc --noEmit` 干净，`npm run e2e`（3 passed + 1 skipped）通过，`npm run dist` 已产出 NSIS 安装包。

**Windows 本机已真实验证**：B 站取流、mpv 起播、窗口平铺/置顶/跟随、扫码登录 B 站（用户亲测成功）、预设管理、视频播放（BV/av 走 yt-dlp）、EPIPE 修复后面板正常启动。

**仍未实测**：B 站发送弹幕（登录已成功，发弹幕未试）、笔记热键全流程、干净机器安装包验收。

## 本机环境

- Node 不在系统 PATH，在 `.tools/node/`（不进 git）。所有 npm/node 命令前：`export PATH=".../.tools/node:$PATH"`
- 下载 mpv/yt-dlp 若被 GitHub 断连：`GH_PROXY=https://gh-proxy.com node scripts/fetch-binaries.mjs`
- 杀残留进程：`powershell.exe -Command "Get-Process electron -ErrorAction SilentlyContinue | Stop-Process -Force"`
- 用户预设存在 `%APPDATA%/livewall/presets.json`（4 个测试直播间）

## 自动化验收

`npm run e2e`（Playwright Electron）：smoke 测试面板加载/槽位/预设 UI；streaming 测试用 `resolveBilibili` 探测真实房间，未开播自动 skip（设计行为，不是失败）。测试用 `LIVEWALL_USER_DATA` 环境变量隔离用户数据，不会污染真实配置。

## 近期主要变更（时间倒序）

- `fix` 无控制台启动时渲染日志转发 EPIPE 崩溃（main/index.ts try/catch）
- `feat` B 站视频播放：BV/av 号走 yt-dlp（ResolvedStream.needsYtdl + mpv-args `--ytdl=yes`）
- `feat` 预设全局统一管理入口（顶部全局区，槽位只留下拉框，显示是否已被选用/在哪个槽位）+ 按钮 SVG 图标化
- `feat` Playwright e2e 验收测试（tests-e2e/）
- `fix` 面板白屏（hooks 顺序）、B 站扫码接口改 /web/ 路径、mpv 路径多候选查找
- `chore` fetch-binaries 支持 GH_PROXY

## 已知设计决策（不要再翻案，除非实测出问题）

- 播放用外部 mpv 进程（非 webview）；窗口控制走 Win32（koffi），布局轮询 150ms + 500ms 防抖落盘
- YouTube 一期只播不发聊天；B 站单账号
- Linux 上 win32 全部静默 no-op（`tryWin32`），这是刻意的
- mpv 拉流不计入直播间在线人数/观看时长（用户问过，已确认这是预期）

## 待办

- 用户实测发弹幕、笔记热键、工具条手感
- 干净机器跑 NSIS 安装包验收
