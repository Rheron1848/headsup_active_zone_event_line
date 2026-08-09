import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('livewallOverlay', {})
