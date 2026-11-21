import type { MonthlySalesScreen } from "./monthly-sales-screen";
import { MONTHLY_SCREEN_FRESH_MS, MONTHLY_SCREEN_RETAIN_MS } from "./monthly-sales-clocks";

export class MonthlySourceFailure extends Error {
  constructor(readonly transient: boolean) { super("Monthly source read failed"); }
}
export function applySalesThreshold(screen: MonthlySalesScreen, minGrowth: number): MonthlySalesScreen {
  let passed = 0;
  const rows = screen.rows.map(row => {
    const pass = row.growth === null ? null : row.growth >= minGrowth;
    if (pass) passed++;
    return row.passed === pass ? row : { ...row, passed: pass };
  });
  return { ...screen, minGrowth, rows, coverage: { ...screen.coverage, passed } };
}
type Completed = { checkedAt: string };
export type SnapshotRead<T> = { snapshot:T; readState:"fresh"|"retained" };
export function createMonthlyCache<T extends Completed>(now = Date.now, capacity = 32) {
  const complete = new Map<string,T>();
  const running = new Map<string,Promise<SnapshotRead<T>>>();
  function state(snapshot:T): SnapshotRead<T> | null {
    const age = now() - Date.parse(snapshot.checkedAt);
    if (!Number.isFinite(age) || age < -1000 || age > MONTHLY_SCREEN_RETAIN_MS) return null;
    return { snapshot, readState: age <= MONTHLY_SCREEN_FRESH_MS ? "fresh" : "retained" };
  }
  return async function read(key:string, load:()=>Promise<T>, reloadExpired?:()=>Promise<T>):Promise<SnapshotRead<T>> {
    const old = complete.get(key);
    const saved = old && state(old);
    if (saved?.readState === "fresh") return saved;
    const pending = running.get(key);
    if (pending) return pending;
    const request = Promise.resolve().then(load).then(async value => {
      // A cold worker can receive yesterday's value while Next revalidates in
      // the background. Read the database once before reporting unavailability.
      if (reloadExpired && now() - Date.parse(value.checkedAt) > MONTHLY_SCREEN_RETAIN_MS) {
        value = await reloadExpired();
      }
      const read = state(value);
      if (!read) throw new MonthlySourceFailure(true);
      complete.delete(key);
      if (complete.size >= capacity) complete.delete(complete.keys().next().value!);
      complete.set(key, value);
      return read;
    }).catch(error => {
      const prior = old && state(old);
      if (error instanceof MonthlySourceFailure && error.transient && prior) {
        return { snapshot:prior.snapshot, readState:"retained" as const };
      }
      if (!(error instanceof MonthlySourceFailure) || !error.transient) complete.delete(key);
      throw error;
    }).finally(() => {running.delete(key);});
    running.set(key, request);
    return request;
  };
}
