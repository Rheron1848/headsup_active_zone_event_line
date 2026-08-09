// 可视化多开预览：5 路真实直播窗口平铺在桌面上（Linux 本机验证用）
import { spawn, type ChildProcess } from 'node:child_process'
import { resolveBilibili } from '../src/core/resolver/bilibili.ts'
import { buildMpvArgs } from '../src/main/mpv-args.ts'

const rooms = ['1967216004', '21457197', '510', '21452505', '8747153']
const procs: ChildProcess[] = []

// 3x2 网格，480x270 每格
const geo = (i: number) => ({ x: 60 + (i % 3) * 490, y: 60 + Math.floor(i / 3) * 280, w: 480, h: 270 })

for (let i = 0; i < rooms.length; i++) {
  try {
    const stream = await resolveBilibili(rooms[i])
    const args = buildMpvArgs(stream, i, geo(i), 0, {
      inputConfPath: 'resources/wheel-volume.conf',
      platform: 'linux'
    })
    procs.push(spawn('flatpak', ['run', 'io.mpv.Mpv', ...args], { stdio: 'ignore' }))
    console.log(`[${i + 1}] 《${stream.title}》已起播（静音，窗口上滚轮调音量）`)
  } catch (e) {
    console.log(`[${i + 1}] ${rooms[i]} 失败: ${(e as Error).message}`)
  }
}

console.log('\n按 Ctrl+C 关闭全部窗口')
setInterval(() => {}, 60000) // 保活：子进程不引用事件循环
process.on('SIGINT', () => {
  // flatpak/bwrap 会逃逸直接 kill，按标题特征整批清理
  spawn('pkill', ['-f', 'mpv-bin.*livewall-slot-'], { stdio: 'ignore' })
  setTimeout(() => process.exit(0), 500)
})
