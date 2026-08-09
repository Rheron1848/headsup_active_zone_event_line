import { resolveBilibili } from '../src/core/resolver/bilibili.ts'
const room = process.argv[2] ?? '6'
try {
  const s = await resolveBilibili(room)
  console.log('OK title=', s.title)
  console.log('roomId=', s.roomId)
  console.log('url=', s.url.slice(0, 120) + '...')
} catch (e) {
  console.log('ERR', (e as Error).message)
}
