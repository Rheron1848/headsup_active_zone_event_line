# 开发交接（2026-08-10）

## 当前状态

代码在 `main` 分支，三个 commit。Linux 开发机上完成，50 个 vitest 全绿，`tsc --noEmit` 干净，`npm run build` 通过。

**已在本机真实验证**：B 站取流（5 个真实直播间全通）、mpv 起播、命名管道 IPC（读 time-pos / 调音量 / quit）、Electron 面板启动。

**未验证（全部要在 Windows 目标机做）**：win32 窗口控制的一切、工具条跟随手感、NSIS 打包。

## Windows 机器首次 setup

```bash
git clone git@github.com:Rheron1848/headsup_active_zone_event_line.git
cd headsup_active_zone_event_line/livewall
npm install                        # 如果慢，加 --registry=https://registry.npmmirror.com
node scripts/fetch-binaries.mjs    # 下载 mpv.exe + yt-dlp.exe
npm run dev
```

## Windows 验收清单（按优先级）

1. **win32.ts 三个待实测点**（细节在该文件头注释）：uintptr_t 收 HWND 精度、SetWindowPos 的 intptr_t -1（HWND_TOPMOST）、GetWindowRect 传 Buffer。验证方法：`npm run dev` 起一路直播，看窗口是否被移动到布局位置且置顶。
2. **平铺**：面板点「平铺4」→ 前 4 窗均分屏幕。
3. **拖动记忆**：拖动某路窗口 → 500ms 后 `%APPDATA%/livewall/layout.json` 应更新；重启应用位置恢复。
4. **工具条**：贴在每个直播窗顶边，鼠标移入可交互、移出穿透；拖动直播窗时跟随（预期有 ~150ms 滞后，不可接受就降轮询间隔）。
5. **显隐**：`Ctrl+Alt+H` 全部隐藏（静音）/恢复；托盘菜单同样。
6. **音量**：滚轮、面板滑条、重启恢复三路径。
7. **登录+弹幕**：扫码 → 真房间发一条 → 直播间可见；3s 节流生效。
8. **笔记**：`Ctrl+Alt+1` 聚焦槽位 1 笔记框，回车后 `%APPDATA%/livewall/notes/` 有 Markdown。
9. **打包**：`npm run dist` 出 `dist/livewall Setup 0.1.0.exe`；干净机器安装即用。

## 已知设计决策（不要再翻案，除非实测出问题）

- 播放用外部 mpv 进程（非 webview）；窗口控制走 Win32（koffi），布局轮询 150ms + 500ms 防抖落盘
- YouTube 一期只播不发聊天；B 站单账号
- Linux 开发机上 win32 全部静默 no-op（`tryWin32`），这是刻意的

## 环境备注

- Linux 开发机的 node 在 `.tools/node/bin`（不进 git）；Windows 上自行装 Node LTS
- npm 慢就用 npmmirror 镜像；Electron 二进制可用 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`
