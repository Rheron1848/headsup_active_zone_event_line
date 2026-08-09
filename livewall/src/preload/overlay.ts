import { contextBridge, ipcRenderer } from 'electron'

const slot = Number(new URLSearchParams(location.search).get('slot') ?? '-1')

contextBridge.exposeInMainWorld('livewallOverlay', {
  setInteractive: (b: boolean) => ipcRenderer.send('overlay:interactive', slot, b),
  setVolume: (slot: number, v: number) => ipcRenderer.invoke('stream:setVolume', slot, v),
  sendDanmaku: (slot: number, msg: string) => ipcRenderer.invoke('danmaku:send', slot, msg),
  addNote: (slot: number, text: string) => ipcRenderer.invoke('note:add', slot, text),
  setVisible: (slot: number, visible: boolean) =>
    ipcRenderer.invoke('stream:setVisible', slot, visible)
})
