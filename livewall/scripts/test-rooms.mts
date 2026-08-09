// 批量验证多个 B 站直播间：取流 + mpv 起播（无声无画面）+ 确认在播
import { spawn } from 'node:child_process'
import { resolveBilibili } from '../src/core/resolver/bilibili.ts'
import { buildMpvArgs } from '../src/main/mpv-args.ts'
import { MpvIpc } from '../src/main/mpv-ipc.ts'

const rooms = process.argv.slice(2)

for (const room of rooms) {
  const tag = `[${room}]`
  try {
    const stream = await resolveBilibili(room)
    const sock = `/tmp/livewall-mpv-0.sock` // buildMpvArgs(slot=0) 生成的套接字路径
    const args = [
      ...buildMpvArgs(stream, 0, { x: 0, y: 0, w: 320, h: 180 }, 0, {
        inputConfPath: 'resources/wheel-volume.conf',
        platform: 'linux'
      }),
      '--vo=null',
      '--ao=null'
    ]
    const proc = spawn('flatpak', ['run', 'io.mpv.Mpv', ...args], { stdio: 'ignore' })
    const ipc = new MpvIpc(sock)
    let connected = false
    for (let i = 0; i < 50 && proc.exitCode === null; i++) {
      try {
        await ipc.connect()
        connected = true
        break
      } catch {
        await new Promise((r) => setTimeout(r, 100))
      }
    }
    if (!connected) {
      console.log(`${tag} 取流 OK《${stream.title}》但 mpv 启动失败`)
      proc.kill()
      continue
    }
    await new Promise((r) => setTimeout(r, 6000))
    const t = await ipc.getProperty<number>('time-pos').catch(() => null)
    console.log(`${tag} 《${stream.title}》 time-pos=${t?.toFixed(1)}s ${t && t > 0 ? '✅ 在播' : '❌ 无画面'}`)
    await ipc.command(['quit']).catch(() => {})
    ipc.close()
    proc.kill()
  } catch (e) {
    console.log(`${tag} ❌ ${(e as Error).message}`)
  }
}
process.exit(0)
