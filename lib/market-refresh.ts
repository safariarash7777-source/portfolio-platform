export const MARKET_REFRESH_MS = 5 * 60 * 1000;

/** Visibility and in-flight gating, independent of browser clocks for verification. */
export class MarketRefreshCadence {
  private dueAt: number;
  private running = false;
  constructor(now: number) { this.dueAt = now + MARKET_REFRESH_MS; }
  begin(now: number, visible: boolean): boolean {
    if (!visible || this.running || now < this.dueAt) return false;
    this.running = true;
    return true;
  }
  finish(now: number) { this.running = false; this.dueAt = now + MARKET_REFRESH_MS; }
}

/** No empty/cold failed read can replace a valid board already on screen. */
export function retainValidBoard<T>(previous: T, incoming: T, valid: boolean): T {
  return valid ? incoming : previous;
}
