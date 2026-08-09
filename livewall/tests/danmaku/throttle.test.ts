import { it, expect } from 'vitest'
import { Throttler } from '../../src/core/danmaku/throttle'

it('窗口期内拒绝并给出剩余毫秒', () => {
  let t = 1000
  const th = new Throttler(3000, () => t)
  expect(th.tryAcquire()).toBe(true)
  t += 1000
  expect(th.tryAcquire()).toBe(false)
  expect(th.retryAfterMs()).toBe(2000)
  t += 2000
  expect(th.tryAcquire()).toBe(true)
})
