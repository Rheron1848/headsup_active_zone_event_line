import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('livewall', {
  startStream: (slot: number, source: unknown, rect: unknown, volume: number) =>
    ipcRenderer.invoke('stream:start', slot, source, rect, volume),
  stopStream: (slot: number) => ipcRenderer.invoke('stream:stop', slot),
  setVolume: (slot: number, v: number) => ipcRenderer.invoke('stream:setVolume', slot, v),
  setVisible: (slot: number, visible: boolean) =>
    ipcRenderer.invoke('stream:setVisible', slot, visible),
  setAllVisible: (visible: boolean) => ipcRenderer.invoke('stream:setAllVisible', visible),
  getLayout: () => ipcRenderer.invoke('layout:get'),
  tile: (count: number) => ipcRenderer.invoke('layout:tile', count),
  sendDanmaku: (slot: number, msg: string) => ipcRenderer.invoke('danmaku:send', slot, msg),
  addNote: (slot: number, text: string) => ipcRenderer.invoke('note:add', slot, text),
  openNotesDir: () => ipcRenderer.invoke('note:openDir'),
  loginStart: () => ipcRenderer.invoke('auth:loginStart'),
  loginPoll: (qrcodeKey: string) => ipcRenderer.invoke('auth:loginPoll', qrcodeKey),
  authStatus: () => ipcRenderer.invoke('auth:status'),
  listPresets: () => ipcRenderer.invoke('presets:list'),
  addPreset: (p: unknown) => ipcRenderer.invoke('presets:add', p),
  updatePreset: (id: string, patch: unknown) => ipcRenderer.invoke('presets:update', id, patch),
  removePreset: (id: string) => ipcRenderer.invoke('presets:remove', id),
  onHotkeyNote: (cb: (slot: number) => void) => {
    const listener = (_e: unknown, slot: number): void => cb(slot)
    ipcRenderer.on('hotkey-note', listener)
    return () => ipcRenderer.removeListener('hotkey-note', listener)
  }
})
