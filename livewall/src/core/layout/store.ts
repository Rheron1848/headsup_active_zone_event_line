import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import type { Layout, SlotState } from '../../shared/types'

export function defaultLayout(): Layout {
  const slots: SlotState[] = Array.from({ length: 6 }, (_, i) => ({
    index: i,
    source: null,
    rect: { x: 0, y: 0, w: 640, h: 360 },
    volume: 60,
    muted: false,
    visible: true
  }))
  return { slots }
}

export class LayoutStore {
  private cache: Layout | null = null
  constructor(private filePath: string) {}

  load(): Layout {
    if (this.cache) return this.cache
    try {
      const j = JSON.parse(readFileSync(this.filePath, 'utf8'))
      this.cache = normalize(j)
    } catch {
      this.cache = defaultLayout()
    }
    return this.cache
  }

  save(l: Layout): void {
    this.cache = l
    mkdirSync(path.dirname(this.filePath), { recursive: true })
    writeFileSync(this.filePath, JSON.stringify(l, null, 2), 'utf8')
  }

  updateSlot(index: number, patch: Partial<SlotState>): Layout {
    const l = this.load()
    const i = l.slots.findIndex(s => s.index === index)
    if (i < 0) throw new Error(`slot ${index} 不存在`)
    l.slots[i] = { ...l.slots[i], ...patch, index }
    this.save(l)
    return l
  }
}

function normalize(j: any): Layout {
  const d = defaultLayout()
  if (!Array.isArray(j?.slots)) return d
  for (const s of j.slots) {
    const t = d.slots.find(x => x.index === s?.index)
    if (t) Object.assign(t, s, { index: t.index })
  }
  return d
}
