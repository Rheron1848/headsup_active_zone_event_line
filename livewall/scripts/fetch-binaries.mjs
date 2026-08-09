// 用法: node scripts/fetch-binaries.mjs
// 下载 yt-dlp 与 mpv 到 resources/bin/（按当前平台）。
// - yt-dlp: GitHub releases 最新版
// - mpv (win): shinchiro/mpv-winbuild-cmake 最新 64bit 7z，用 7zip-bin 解压取 mpv.exe
// - mpv (linux): 本机验证用，提示自行提供（正式目标平台是 Windows）
import { createWriteStream, mkdirSync, existsSync, chmodSync } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const BIN = 'resources/bin'
mkdirSync(BIN, { recursive: true })

const GH_PROXY = (process.env.GH_PROXY || '').replace(/\/$/, '')
function proxy(url) {
  return GH_PROXY ? `${GH_PROXY}/${url}` : url
}

async function download(url, dest) {
  console.log(`下载 ${url}`)
  const resp = await fetch(url, { redirect: 'follow' })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${url}`)
  await pipeline(resp.body, createWriteStream(dest))
}

async function fetchYtDlp() {
  const name = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
  const dest = path.join(BIN, name)
  await download(proxy(`https://github.com/yt-dlp/yt-dlp/releases/latest/download/${name}`), dest)
  if (process.platform !== 'win32') chmodSync(dest, 0o755)
  console.log(`yt-dlp -> ${dest}`)
}

async function fetchMpvWindows() {
  const api = proxy('https://api.github.com/repos/shinchiro/mpv-winbuild-cmake/releases/latest')
  const rel = await (await fetch(api, { headers: { 'User-Agent': 'livewall' } })).json()
  const asset = rel.assets.find((a) => /mpv-x86_64-.*\.7z$/.test(a.name))
  if (!asset) throw new Error('未找到 mpv 64bit 构建资产')
  const archive = path.join(BIN, asset.name)
  await download(proxy(asset.browser_download_url), archive)
  const sevenZip = (await import('7zip-bin')).path7za
  execFileSync(sevenZip, ['e', archive, 'mpv.exe', `-o${BIN}`, '-y'], { stdio: 'inherit' })
  console.log(`mpv.exe -> ${path.join(BIN, 'mpv.exe')}`)
}

await fetchYtDlp()
if (process.platform === 'win32') {
  await fetchMpvWindows()
} else if (!existsSync(path.join(BIN, 'mpv'))) {
  console.log('Linux 平台：请将 mpv 二进制放到 resources/bin/mpv（仅本机调试用；正式分发目标为 Windows）')
}
console.log('done')
