import { describe, it, expect } from 'vitest'
import { encodeCommand, parseIpcLine } from '../../src/main/mpv-ipc'

it('encodeCommand 输出单行 JSON + 换行', () => {
  expect(encodeCommand(['set_property', 'volume', 60], 7)).toBe(
    '{"command":["set_property","volume",60],"request_id":7}\n'
  )
})

describe('parseIpcLine', () => {
  it('解析 reply', () => {
    expect(parseIpcLine('{"data":66.0,"request_id":7,"error":"success"}')).toEqual({
      kind: 'reply',
      requestId: 7,
      error: 'success',
      data: 66
    })
  })
  it('解析 event', () => {
    expect(parseIpcLine('{"event":"property-change","name":"pause","data":true}')).toEqual({
      kind: 'event',
      event: 'property-change',
      data: { event: 'property-change', name: 'pause', data: true }
    })
  })
})
