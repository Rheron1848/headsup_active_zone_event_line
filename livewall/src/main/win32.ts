// Win32 window control (user32.dll via koffi).
// Win32 窗口控制（user32.dll，经 koffi）。
//
// Lazy loading: koffi.load('user32.dll') is only executed on first function call,
// so importing this module on non-Windows platforms (e.g. Linux dev machines) does not throw.
// 惰性加载：koffi.load('user32.dll') 只在首次调用任一函数时执行，
// 保证在非 Windows 平台（如 Linux 开发机）import 本模块不会抛错。
//
// TODO(Windows 实测定稿): hwnd 统一用 uintptr_t 直接收发 JS Number，
// 避开了 koffi.address / void* 在不同 koffi 版本间的行为差异。
// 但仍需在 Windows 目标机上实测确认：
//   1. koffi 对 uintptr_t 的 Number 转换在 64 位 HWND 值下精度无损
//      （HWND 实际只有低位有效，理论上安全，但需实测）；
//   2. SetWindowPos 的 hWndInsertAfter 用 intptr_t 传 -1（HWND_TOPMOST）
//      是否被 koffi 正确按有符号 64 位整型封送；
//   3. GetWindowRect 的 void* 直接传 Node Buffer 是否稳定写入
//      （备选方案：签名改为 uint8_t* 或声明 koffi.pointer(RECT) 结构体）。
import koffi from 'koffi'
import type { Rect } from '../shared/types'
import { decodeRect, RECT_SIZE } from './win32-rect'

const HWND_TOPMOST = -1
const SWP_NOACTIVATE = 0x10
const SW_HIDE = 0
const SW_SHOW = 5

interface User32 {
  FindWindowW(lpClassName: string | null, lpWindowName: string): number
  SetWindowPos(
    hWnd: number,
    hWndInsertAfter: number,
    x: number,
    y: number,
    cx: number,
    cy: number,
    uFlags: number
  ): boolean
  ShowWindow(hWnd: number, nCmdShow: number): boolean
  GetWindowRect(hWnd: number, lpRect: Buffer): boolean
}

let user32: User32 | null = null

function load(): User32 {
  if (!user32) {
    const lib = koffi.load('user32.dll')
    user32 = {
      FindWindowW: lib.func('FindWindowW', 'uintptr_t', ['str16', 'str16']),
      SetWindowPos: lib.func('SetWindowPos', 'bool', [
        'uintptr_t',
        'intptr_t',
        'int',
        'int',
        'int',
        'int',
        'uint'
      ]),
      ShowWindow: lib.func('ShowWindow', 'bool', ['uintptr_t', 'int']),
      GetWindowRect: lib.func('GetWindowRect', 'bool', ['uintptr_t', 'void*'])
    }
  }
  return user32
}

/** 按窗口标题精确匹配查找，找不到返回 null。 */
export function findWindowByTitle(title: string): number | null {
  const hwnd = load().FindWindowW(null, title)
  return hwnd === 0 ? null : hwnd
}

/** 移动并改大小，置顶 + 不激活。 */
export function setWindowRect(hwnd: number, r: Rect): void {
  load().SetWindowPos(hwnd, HWND_TOPMOST, r.x, r.y, r.w, r.h, SWP_NOACTIVATE)
}

export function showWindow(hwnd: number, visible: boolean): void {
  load().ShowWindow(hwnd, visible ? SW_SHOW : SW_HIDE)
}

export function getWindowRect(hwnd: number): Rect | null {
  const buf = Buffer.alloc(RECT_SIZE)
  const ok = load().GetWindowRect(hwnd, buf)
  return ok ? decodeRect(buf) : null
}
