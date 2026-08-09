export class Throttler {
  private last = -Infinity
  constructor(private intervalMs: number, private now: () => number = Date.now) {}
  tryAcquire(): boolean {
    const t = this.now()
    if (t - this.last < this.intervalMs) return false
    this.last = t
    return true
  }
  retryAfterMs(): number {
    return Math.max(0, this.intervalMs - (this.now() - this.last))
  }
}
