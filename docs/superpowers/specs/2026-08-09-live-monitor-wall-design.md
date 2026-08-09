# 多平台直播监控墙 — 设计 Spec

日期：2026-08-09
状态：待用户确认

## 1. 产品概述

Windows 桌面应用：同时悬浮播放多路（≤6）Bilibili / YouTube 直播，每路独立控制音量、尺寸、位置；支持预设源列表、B 站扫码登录快捷发弹幕、每路快捷笔记（时间戳 + 文本，存本地 Markdown）。

### 已确认的决策（与用户讨论结论）

| # | 决策点 | 结论 |
|---|--------|------|
| 1 | 窗口形态 | 每路直播 = 独立悬浮系统窗口（mpv 画面 + 跟随的透明工具条覆盖窗）；另有一个控制面板主窗口 |
| 2 | 播放内核 | 外部 mpv 进程取流播放（非 webview 内嵌网页播放器） |
| 3 | 聊天发送 | 一期：B 站支持发弹幕；YouTube 只播不发（二期再做） |
| 4 | 路数 | 最多 6 路 |
| 5 | 账号 | 单账号（B 站）即可 |
| 6 | 笔记 | 本地 Markdown 文件即可，无需应用内浏览/搜索 |
| 7 | 快捷操作 | **必须有可视化工具条**（见 3.8），热键作为补充 |
| 8 | 分发 | 一期必须产出可安装包（electron-builder NSIS），mpv/yt-dlp 随包分发 |

## 2. 核心架构决策：mpv 独立窗口 + 控制面板

**播放窗口不用 Electron BrowserWindow 内嵌，而是直接驱动 mpv 自己的窗口。**

- 每路直播 spawn 一个 `mpv.exe` 子进程，启动参数：`--ontop --no-border --keep-open --input-ipc-server=\\.\pipe\livewall-N`，标题设为槽位名。
- Electron 侧通过 **Windows 命名管道 JSON IPC** 控制 mpv：音量、暂停、取 `time-pos` 等。
- 窗口移动/缩放/显隐通过 Win32 API（`SetWindowPos` / `ShowWindow`），Node 侧用 `koffi` 调用，无需原生编译模块。
- 不选 `--wid` 嵌入 Electron 窗口的原因：mpv 直接渲染到 HWND 上，HTML 工具条无法叠加在其上方，需要额外透明覆盖窗同步位置，复杂度高一倍，一期不划算。

### 每窗口的快捷操作：覆盖工具条为主，热键为辅

每路直播 = 两个窗口的组合：
- **mpv 窗口**：无边框、置顶，只渲染画面。
- **工具条覆盖窗**：Electron 无边框透明 BrowserWindow（高约 36px），贴在 mpv 窗口顶边，内含：音量滑条 + 静音、发弹幕输入框、记笔记按钮、换源、隐藏/关闭该路。透明区域点击穿透（`setIgnoreMouseEvents` 按区域切换），不遮挡画面交互。

同步机制：主进程一个 ~150ms 轮询循环（`GetWindowRect`），同时干两件事——把工具条位置对齐到 mpv 窗口、把 mpv 窗口实际位置防抖落盘（布局持久化）。mpv 窗口隐藏/关闭时工具条同步隐藏/销毁。置顶层级：工具条 `alwaysOnTop` 设为比 mpv 更高的 level，轮询时校验并重新 assert。

**热键作为补充**（成本低，保留）：音量滚轮（mpv `input.conf`）、`Ctrl+Alt+H` 全局显隐、`Ctrl+Alt+1..6` 唤起对应槽位的弹幕输入。

- **全局显隐**：托盘菜单 + 热键，对所有 mpv 窗口 `ShowWindow(SW_HIDE/SW_SHOW)`；隐藏时自动静音、显示时恢复原音量（可在设置里关）。

## 3. 功能模块

### 3.1 取流（resolver）
- **Bilibili**：房间号 → 真实 room_id（`room_init`）→ 播放地址（`/xlive/web-room/v2/index/getRoomPlayInfo`，qn 可调）。需要的 `Referer`/`User-Agent` 头通过 mpv `--http-header-fields` / `--referrer` 传入。取流逻辑收敛在独立适配器模块，接口失效时只改这里。
- **YouTube**：直接把 `watch?v=` URL 交给 mpv 内置 ytdl hook（依赖随应用分发的 `yt-dlp.exe`），零自研。
- 失败处理：解析失败/主播未开播 → 控制面板槽位标红显示原因，mpv 进程不启动。

### 3.2 播放管理（player）
- mpv 进程生命周期：spawn、崩溃重启（指数退避，最多 3 次）、关闭清理。
- JSON IPC 客户端（命名管道）：`set_property volume`、`get_property time-pos`、`get_property pause` 等。
- 随应用分发 mpv.exe + yt-dlp.exe（`resources/bin/`），首启校验存在与版本。

### 3.3 布局（layout）
- 6 个槽位模型：`{ source, rect:{x,y,w,h}, volume, muted }`，JSON 持久化（`%APPDATA%/livewall/layout.json`），窗口拖动/缩放结束后自动保存（轮询 Win32 `GetWindowRect`，防抖落盘）。
- 平铺预设：1、2（横排）、4（2×2）、6（3×2）四种网格，一键均分到主显示器工作区；之后用户手动微调。

### 3.4 弹幕与登录（danmaku，一期仅 B 站）
- 扫码登录：`/x/passport-login/qrcode/generate` 拿二维码 → 面板弹窗展示 → 轮询 `qrcode/poll` 拿 cookie。
- Cookie 存 `safeStorage` 加密后的本地文件；每次发弹幕取 `bili_jct` 作 csrf。
- 发送：`POST api.live.bilibili.com/msg/send`（`msg`、`roomid`、`csrf`、`color=16777215`、`fontsize=25`）。频率限制：同房间 1 条/3s，UI 侧节流。
- 风控提示：Cookie 失效（接口返回未登录）→ 面板提示重新扫码。

### 3.5 笔记（notes）
- 触发：槽位热键/面板按钮 → 弹输入框 → 回车追加到 `notes/YYYYMMDD-{主播名或房间号}.md`。
- 每条格式：`- [HH:MM:SS]（流内 01:23:45）笔记内容` —— 墙钟时间 + mpv `time-pos`。
- 面板提供"打开笔记目录"按钮。

### 3.6 预设源（presets）
- 来源库：`{ name, platform: 'bilibili'|'youtube', roomId 或 videoUrl, tags[] }`，JSON 存本地，面板 CRUD。
- 槽位"换源"弹出预设选择；也支持"把当前源存为预设"。

### 3.7 控制面板（ui）
- Electron 单窗口（React）：6 槽位卡片（缩略状态、音量条、换源、显隐、弹幕、笔记按钮）、平铺按钮、全部显隐、登录状态、预设管理页、设置页。
- 系统托盘：显示/隐藏全部、打开面板、退出。

### 3.8 工具条覆盖窗（overlay）
- 每槽位一个：无边框、透明、置顶（level 高于 mpv 窗口）、不抢焦点（`focusable: false`，输入框激活时临时放开）、任务栏不显示。
- UI 控件：音量滑条 + 静音按钮、弹幕输入框（回车发送，发送中/失败态提示）、笔记按钮（展开小输入框）、换源下拉、隐藏该路按钮。
- 位置跟随：主进程轮询循环统一驱动（见 §2 同步机制）；mpv 窗口最小化/隐藏/退出时覆盖窗同步隐藏。
- 点击穿透：默认 `setIgnoreMouseEvents(true, { forward: true })`，鼠标进入工具条区域时（`mousemove` 命中检测）切换为可交互，离开后恢复穿透。

## 4. 技术栈

- Electron + electron-vite + TypeScript + React（仅面板/弹窗 UI）
- 播放器：外部 `mpv.exe`（随包分发）+ JSON IPC（命名管道）
- Win32 调用：`koffi`（纯 JS FFI，免 node-gyp）
- 网络：Node 内置 `fetch`（undici），不引 axios
- 持久化：JSON 文件 + Electron `safeStorage`
- 测试：vitest（纯逻辑：resolver/danmaku/layout/notes 单测，网络与 IPC 打 mock）
- 打包：electron-builder（NSIS 安装包，二期；一期 `npm run dev` 可用即可）

## 5. 里程碑

| 里程碑 | 内容 | 验收 |
|--------|------|------|
| M0 | 工程脚手架（electron-vite + React + vitest） | dev 起空面板 |
| M1 | 单路播放：B 站取流 + mpv 起播；YouTube 直投 mpv | 手测两平台各播一路 |
| M2 | 6 槽位多开、布局持久化、平铺、全局显隐 | 6 路同开，重启恢复布局 |
| M3 | 每路音量（IPC + 滚轮 + 面板滑条） | 各路音量互不影响并持久化 |
| M4 | B 站扫码登录 + 发弹幕 | 真号真房间发弹幕成功 |
| M5 | 快捷笔记 | 热键/工具条弹出、落盘格式正确 |
| M5.5 | 工具条覆盖窗：跟随、置顶、点击穿透、音量/弹幕/笔记控件 | 每路窗上有可用工具条，不遮挡画面交互 |
| M6 | 打磨 + **打包分发**：错误提示、托盘、开机自启（可选）、electron-builder NSIS 安装包（内置 mpv.exe/yt-dlp.exe）、yt-dlp 一键更新 | 干净 Windows 机器装包即用 |

> 说明：工具条覆盖窗（M5.5）依赖 M2 的窗口管理与 M3 的音量 IPC，排在笔记之后实施，但属于一期必交付项。

## 6. 明确不做（一期）

- YouTube 发聊天、送礼/礼物、B 站弹幕接收展示、多账号、应用内笔记浏览、非 Windows 平台

## 7. 主要风险

- **B 站取流/弹幕接口变动**：靠 resolver/danmaku 模块隔离 + 可更新适配。
- **YouTube 取流受 yt-dlp 维护节奏影响**：随包分发但提供"更新 yt-dlp"按钮（下载最新 exe）。
- **mpv 窗口管理在个别 Windows 版本/多 DPI 下的坐标问题**：M2 里程碑在目标机器实测；轮询循环内统一做 DPI 换算（mpv Win32 坐标是物理像素，Electron 同理，需确认 `SetProcessDpiAwareness` 一致性）。
- **覆盖窗跟随的体感延迟**：~150ms 轮询下拖动会有轻微"跟手滞后"；若不可接受，降到 50ms 或改用 Win32 事件钩子（`SetWinEventHook` 需要原生 addon，列为备选升级路径）。
- **发弹幕风控**：频率限制 + 明确提示，不做绕过。
