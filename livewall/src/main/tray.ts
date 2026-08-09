import { app, Menu, Tray, nativeImage } from 'electron'
import path from 'node:path'

export function createTray(onToggleAll: () => void, onOpenPanel: () => void): Tray {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(app.getAppPath(), 'resources', 'icon.png')
  const tray = new Tray(nativeImage.createFromPath(iconPath))
  tray.setToolTip('livewall')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示/隐藏全部', click: onToggleAll },
      { label: '打开面板', click: onOpenPanel },
      { type: 'separator' },
      { label: '退出', click: () => app.exit(0) }
    ])
  )
  return tray
}
