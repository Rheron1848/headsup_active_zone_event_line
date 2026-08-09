import { app, globalShortcut } from 'electron'

export interface ShortcutActions {
  onToggleAll: () => void
  onNoteSlot: (slot: number) => void
}

export function registerShortcuts(actions: ShortcutActions): void {
  globalShortcut.register('Ctrl+Alt+H', actions.onToggleAll)
  for (let i = 0; i < 6; i++) {
    globalShortcut.register(`Ctrl+Alt+${i + 1}`, () => actions.onNoteSlot(i))
  }
}

export function unregisterShortcuts(): void {
  globalShortcut.unregisterAll()
}

// app 退出时自动注销（在 index.ts 的 will-quit 里调用）
export function bindShortcutCleanup(): void {
  app.on('will-quit', () => globalShortcut.unregisterAll())
}
