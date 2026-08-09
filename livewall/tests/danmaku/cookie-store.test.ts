import { it, expect } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { CookieStore } from '../../src/main/cookie-store'

// 对称伪加密：字节反转
const encrypt = (s: string): Buffer => Buffer.from(s, 'utf8').reverse()
const decrypt = (b: Buffer): string => Buffer.from(b).reverse().toString('utf8')

const setup = () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'livewall-cookies-'))
  return { dir, file: path.join(dir, 'sub', 'cookies.bin') }
}

it('save 后 load 还原，自动建目录', () => {
  const { dir, file } = setup()
  const store = new CookieStore(file, encrypt, decrypt)
  const cookies = { SESSDATA: 's%2C1', bili_jct: 'j' }
  store.save(cookies)
  expect(new CookieStore(file, encrypt, decrypt).load()).toEqual(cookies)
  rmSync(dir, { recursive: true, force: true })
})

it('文件不存在返回 null', () => {
  const { dir, file } = setup()
  expect(new CookieStore(file, encrypt, decrypt).load()).toBeNull()
  rmSync(dir, { recursive: true, force: true })
})

it('文件损坏/解密失败返回 null', () => {
  const { dir, file } = setup()
  const store = new CookieStore(file, encrypt, decrypt)
  store.save({ a: '1' })
  // 写入非 base64/非 JSON 内容制造损坏
  writeFileSync(file, '!!!not-base64-json!!!')
  expect(store.load()).toBeNull()
  rmSync(dir, { recursive: true, force: true })
})
