/** File-backed synthetic rehearsal. No live provider or production ledger installation. */
import { createHash } from 'node:crypto';
import { appendFileSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type BudgetPolicy = {
  version: string; window: string; startsAt: number; endsAt: number;
  totalTokens: number | null; subjectTokens: number | null;
  concurrency: number | null; subjectConcurrency: number | null;
};
export type Reservation = {
  key: string; subjectRef: string; reservedTokens: number;
  state: 'reserved' | 'dispatched' | 'settled' | 'cancelled'; actualTokens: number | null;
};
type Entry = { policy: string; seq: number; previous: string; row: Reservation; hash: string };
const digest = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const positive = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n > 0;
const nonnegative = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class FixtureBudgetLedger {
  private journal: string;
  private lock: string;
  private marker: string;
  constructor(private directory: string, private policy: BudgetPolicy | null, private now: () => number = Date.now) {
    this.journal = join(directory, 'budget.jsonl'); this.lock = join(directory, 'budget.lock');
    this.marker = join(directory, 'budget.initialized');
  }
  private policyHash(requireActive: boolean): string {
    const p = this.policy;
    if (!p || !p.version || !p.window || !Number.isSafeInteger(p.startsAt) || !Number.isSafeInteger(p.endsAt)
      || p.startsAt >= p.endsAt || ![p.totalTokens,p.subjectTokens,p.concurrency,p.subjectConcurrency].every(positive)) throw Error('policy-unknown');
    if (requireActive && (this.now() < p.startsAt || this.now() >= p.endsAt)) throw Error('outside-window');
    return digest([p.version,p.window,p.startsAt,p.endsAt,p.totalTokens,p.subjectTokens,p.concurrency,p.subjectConcurrency]);
  }
  private async locked<T>(operation: (hash: string) => T, requireActive = true): Promise<T> {
    const hash = this.policyHash(requireActive); // Unknown budget never creates files or grants.
    mkdirSync(this.directory, { recursive: true });
    const end = performance.now() + 2000;
    let fd: number;
    while (true) {
      try { fd = openSync(this.lock, 'wx'); break; }
      catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
        if (performance.now() >= end) throw Error('ledger-lock-unavailable');
        await new Promise(resolve => setTimeout(resolve, 5));
      }
    }
    try { return operation(hash); }
    finally { closeSync(fd); unlinkSync(this.lock); }
  }
  private replay(policy: string): { rows: Map<string, Reservation>; entries: Entry[] } {
    const rows = new Map<string, Reservation>();
    const entries: Entry[] = [];
    if (!existsSync(this.marker) || !existsSync(this.journal)) throw Error('ledger-missing');
    if (readFileSync(this.marker,'utf8') !== policy) throw Error('policy-changed');
    const raw = readFileSync(this.journal, 'utf8');
    if (raw && !raw.endsWith('\n')) throw Error('ledger-corrupt');
    for (const line of raw.split('\n').filter(Boolean)) {
      const e = JSON.parse(line) as Entry;
      const { hash, ...body } = e;
      if (e.policy !== policy) throw Error('policy-changed');
      if (e.seq !== entries.length + 1 || e.previous !== (entries.at(-1)?.hash ?? 'genesis') || digest(body) !== hash) throw Error('ledger-corrupt');
      const r = e.row; const prior = rows.get(r.key);
      if (!uuid.test(r.key) || !/^[a-f0-9]{64}$/.test(r.subjectRef) || !positive(r.reservedTokens)) throw Error('ledger-corrupt');
      if (!prior) { if (r.state !== 'reserved' || r.actualTokens !== null) throw Error('ledger-corrupt'); }
      else {
        if (r.subjectRef !== prior.subjectRef || r.reservedTokens !== prior.reservedTokens) throw Error('ledger-corrupt');
        const allowed = prior.state === 'reserved' ? ['dispatched','cancelled'] : prior.state === 'dispatched' ? ['settled'] : [];
        if (!allowed.includes(r.state) || (r.state === 'settled' ? !nonnegative(r.actualTokens) : r.actualTokens !== null)) throw Error('ledger-corrupt');
      }
      entries.push(e); rows.set(r.key,r);
    }
    return { rows, entries };
  }
  /** Explicit fixture setup only. Reopen/runtime methods NEVER initialize a missing ledger. */
  async initialize(): Promise<void> {
    return this.locked(hash => {
      if (existsSync(this.marker) || existsSync(this.journal)) throw Error('already-initialized');
      const markerFd=openSync(this.marker,'wx');
      try { writeFileSync(markerFd,hash); fsyncSync(markerFd); } finally {closeSync(markerFd);}
      const journalFd=openSync(this.journal,'wx');
      try {fsyncSync(journalFd);} finally {closeSync(journalFd);}
    });
  }
  private append(policy: string, entries: Entry[], row: Reservation): Reservation {
    const body = { policy, seq: entries.length + 1, previous: entries.at(-1)?.hash ?? 'genesis', row };
    const fd = openSync(this.journal, 'a');
    try { appendFileSync(fd, JSON.stringify({ ...body, hash: digest(body) }) + '\n'); fsyncSync(fd); }
    finally { closeSync(fd); }
    return { ...row };
  }
  async reserve(key: string, subjectRef: string, tokens: number): Promise<Reservation> {
    if (!uuid.test(key) || !/^[a-f0-9]{64}$/.test(subjectRef) || !positive(tokens)) throw Error('invalid-reservation');
    return this.locked(hash => {
      const {rows,entries} = this.replay(hash); const existing = rows.get(key);
      if (existing) {
        if (existing.subjectRef !== subjectRef || existing.reservedTokens !== tokens) throw Error('idempotency-conflict');
        return { ...existing }; // Caller must still atomically claim dispatch; replay is never send permission.
      }
      const all = [...rows.values()]; const own = all.filter(r => r.subjectRef === subjectRef);
      const used = (rs: Reservation[]) => rs.reduce((n,r) => n + (r.state === 'cancelled' ? 0 : r.actualTokens ?? r.reservedTokens),0);
      const active = (rs: Reservation[]) => rs.filter(r => r.state === 'reserved' || r.state === 'dispatched').length;
      if (all.some(r => r.actualTokens !== null && r.actualTokens > r.reservedTokens)) throw Error('reconciliation-required');
      if (used(all)+tokens > this.policy!.totalTokens! || used(own)+tokens > this.policy!.subjectTokens!) throw Error('budget-exhausted');
      if (active(all) >= this.policy!.concurrency! || active(own) >= this.policy!.subjectConcurrency!) throw Error('concurrency-exhausted');
      return this.append(hash,entries,{key,subjectRef,reservedTokens:tokens,state:'reserved',actualTokens:null});
    });
  }
  async claimDispatch(key: string): Promise<boolean> {
    return this.locked(hash => {
      const {rows,entries} = this.replay(hash); const row = rows.get(key);
      if (!row) throw Error('reservation-missing');
      if (row.state !== 'reserved') return false;
      this.append(hash,entries,{...row,state:'dispatched'}); return true;
    });
  }
  async settle(key: string, actualTokens: number): Promise<Reservation> {
    if (!nonnegative(actualTokens)) throw Error('usage-unknown');
    return this.locked(hash => {
      const {rows,entries} = this.replay(hash); const row = rows.get(key);
      if (!row) throw Error('reservation-missing');
      if (row.state === 'settled' && row.actualTokens === actualTokens) return {...row};
      if (row.state !== 'dispatched') throw Error('settlement-conflict');
      // Truthful actual usage is recorded even above the reservation; future calls then fail closed.
      return this.append(hash,entries,{...row,state:'settled',actualTokens});
    }, false); // Late measured usage belongs to its original window, never a fresh budget.
  }
  async cancelBeforeDispatch(key: string): Promise<Reservation> {
    return this.locked(hash => {
      const {rows,entries} = this.replay(hash); const row = rows.get(key);
      if (!row) throw Error('reservation-missing');
      if (row.state === 'cancelled') return {...row};
      if (row.state !== 'reserved') throw Error('dispatch-uncertain-reservation-held');
      return this.append(hash,entries,{...row,state:'cancelled'});
    }, false);
  }
}
