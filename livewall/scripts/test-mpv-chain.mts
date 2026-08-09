// 本机全链路验证：resolveBilibili → spawn mpv → MpvIpc 控制
// 用法: node scripts/test-mpv-chain.mts [房间号]
import { spawn } from 'node:child_process'
import { resolveBilibili } from '../src/core/resolver/bilibili.ts'
import { buildMpvArgs } from '../src/main/mpv-args.ts'
import { MpvIpc } from '../src/main/mpv-ipc.ts'

const room = process.argv[2] ?? '6'
const stream = await resolveBilibili(room)
console.log('[1] 取流 OK:', stream.title, '| roomId', stream.roomId)

const sock = '/tmp/livewall-mpv-0.sock'
const args = [
  ...buildMpvArgs(stream, 0, { x: 100, y: 100, w: 640, h: 360 }, 60, {
    inputConfPath: 'resources/wheel-volume.conf',
    platform: 'linux'
  }),
  '--vo=null',
  '--ao=null' // 自动化验证不弹窗、不出声
]
console.log('[2] 启动 mpv…')
const proc = spawn('flatpak', ['run', 'io.mpv.Mpv', ...args], { stdio: 'ignore' })
proc.on('exit', (c) => console.log('[mpv exit]', c))

const ipc = new MpvIpc(sock)
for (let i = 0; ; i++) {
  try {
    await ipc.connect()
    break
  } catch {
    if (i >= 50 || proc.exitCode !== null) throw new Error('IPC 连接失败')
    await new Promise((r) => setTimeout(r, 100))
  }
}
console.log('[3] IPC 已连接')

await new Promise((r) => setTimeout(r, 5000)) // 等起播
const timePos = await ipc.getProperty<number>('time-pos')
console.log('[4] time-pos =', timePos, timePos && timePos > 0 ? '（在播）' : '（异常）')

await ipc.setProperty('volume', 30)
const vol = await ipc.getProperty<number>('volume')
console.log('[5] 音量设置 30 → 实际', vol)

await ipc.command(['quit'])
ipc.close()
console.log('[6] quit 已发送，验证完成')
process.exit(0)
