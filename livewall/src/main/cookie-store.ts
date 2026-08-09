import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export class CookieStore {
  constructor(
    private filePath: string,
    private encrypt: (s: string) => Buffer,
    private decrypt: (b: Buffer) => string
  ) {}

  save(cookies: Record<string, string>): void {
    mkdirSync(path.dirname(this.filePath), { recursive: true })
    writeFileSync(this.filePath, this.encrypt(JSON.stringify(cookies)).toString('base64'), 'utf8')
  }

  load(): Record<string, string> | null {
    try {
      if (!existsSync(this.filePath)) return null
      const raw = readFileSync(this.filePath, 'utf8')
      return JSON.parse(this.decrypt(Buffer.from(raw, 'base64'))) as Record<string, string>
    } catch {
      return null
    }
  }
}
