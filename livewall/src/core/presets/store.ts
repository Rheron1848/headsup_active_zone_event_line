import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type { Preset } from '../../shared/types'

export class PresetStore {
  constructor(private filePath: string) {}

  list(): Preset[] {
    try {
      const j = JSON.parse(readFileSync(this.filePath, 'utf8'))
      return Array.isArray(j) ? j : []
    } catch {
      return []
    }
  }

  add(p: Omit<Preset, 'id'>): Preset {
    const preset: Preset = { ...p, id: randomUUID() }
    this.save([...this.list(), preset])
    return preset
  }

  update(id: string, patch: Partial<Omit<Preset, 'id'>>): Preset {
    const presets = this.list()
    const i = presets.findIndex(x => x.id === id)
    if (i < 0) throw new Error(`预设 ${id} 不存在`)
    presets[i] = { ...presets[i], ...patch, id }
    this.save(presets)
    return presets[i]
  }

  remove(id: string): void {
    const presets = this.list()
    const next = presets.filter(x => x.id !== id)
    if (next.length === presets.length) throw new Error(`预设 ${id} 不存在`)
    this.save(next)
  }

  private save(presets: Preset[]): void {
    mkdirSync(path.dirname(this.filePath), { recursive: true })
    writeFileSync(this.filePath, JSON.stringify(presets, null, 2), 'utf8')
  }
}
