// Shared types used across main, renderer and core modules.
// 全局共享类型，供主进程、渲染进程与 core 模块使用。

export type Platform = 'bilibili' | 'youtube'

export interface Source {
  platform: Platform
  label: string
  roomId?: string // bilibili 直播间 / bilibili live room
  videoUrl?: string // youtube watch URL / YouTube 视频页 URL
}

export interface Preset extends Source {
  id: string
  tags: string[]
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface SlotState {
  index: number // 0..5
  source: Source | null
  rect: Rect
  volume: number // 0..100
  muted: boolean
  visible: boolean
}

export interface Layout {
  slots: SlotState[]
}

export interface ResolvedStream {
  url: string
  headers: Record<string, string>
  title: string
  platform: Platform
  roomId?: string
  /**
   * Whether this stream should be resolved by yt-dlp
   * (e.g. YouTube pages, Bilibili video pages).
   * 该流是否要走 yt-dlp 解析（如 YouTube 页面、B 站视频页）。
   */
  needsYtdl?: boolean
}
