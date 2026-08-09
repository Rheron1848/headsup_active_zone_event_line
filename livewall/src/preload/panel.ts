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
  onHotkeyNote: (cb: (slot: number) => void) => {
    ipcRenderer.on('hotkey-note', (_e, slot: number) => cb(slot))
  }
})
