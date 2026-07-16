// تست‌های ماژول کارنامه — توابع خالص: بازده، آمار، راستی‌آزمایی زنجیره.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  realizedReturnPct,
  computeTrackStats,
  computeWeeklyStats,
  sha256Hex,
  verifyChain,
  verifyLinkage,
  type AnalysisRecord,
  type WeeklyOutlookRecord,
  type RawChainRow,
} from "./analyses";

// ── realizedReturnPct ────────────────────────────────────────────────

test("بازده تحلیل خرید: ورود ۱۰۰۰ خروج ۱۲۰۰ → ۲۰٪", () => {
  assert.equal(realizedReturnPct("buy", 1000, 1200), 20);
});

test("بازده تحلیل فروش (جهت معکوس): ورود ۱۰۰۰ خروج ۸۰۰ → +۲۰٪", () => {
  assert.equal(realizedReturnPct("sell", 1000, 800), 20);
});

test("بازده با دادهٔ ناقص → null (نه صفر ساختگی)", () => {
  assert.equal(realizedReturnPct("buy", null, 1200), null);
  assert.equal(realizedReturnPct("buy", 1000, null), null);
  assert.equal(realizedReturnPct("buy", 0, 1200), null);
});

// ── computeTrackStats ────────────────────────────────────────────────

function rec(partial: Partial<AnalysisRecord>): AnalysisRecord {
  return {
    id: partial.id ?? "x",
    seq: partial.seq ?? 1,
    symbol: partial.symbol ?? "فولاد",
    direction: partial.direction ?? "buy",
    entry_price: partial.entry_price ?? 1000,
    entry_date: partial.entry_date ?? "2026-01-01",
    horizon: partial.horizon ?? null,
    reasons: partial.reasons ?? {},
    published_at: partial.published_at ?? "2026-01-01T00:00:00Z",
    prev_hash: partial.prev_hash ?? "GENESIS",
    record_hash: partial.record_hash ?? "h",
    outcome: partial.outcome ?? null,
  };
}

test("آمار کارنامه: دو بسته (یک برد یک باخت) و یک باز", () => {
  const records: AnalysisRecord[] = [
    rec({
      seq: 1,
      entry_price: 1000,
      outcome: {
        id: "o1", seq: 1, signal_id: "x", exit_price: 1300, exit_date: "2026-02-01",
        outcome: "manual_close", note: null, closed_at: "2026-02-01T00:00:00Z",
        prev_hash: "GENESIS", record_hash: "h1",
      },
    }),
    rec({
      seq: 2,
      entry_price: 2000,
      outcome: {
        id: "o2", seq: 2, signal_id: "y", exit_price: 1800, exit_date: "2026-02-01",
        outcome: "stop", note: null, closed_at: "2026-02-01T00:00:00Z",
        prev_hash: "h1", record_hash: "h2",
      },
    }),
    rec({ seq: 3, outcome: null }),
  ];
  const s = computeTrackStats(records);
  assert.equal(s.total, 3);
  assert.equal(s.open, 1);
  assert.equal(s.closed, 2);
  assert.equal(s.winRatePct, 50);
  // بازده‌ها: +۳۰ و −۱۰ → میانگین +۱۰
  assert.equal(s.avgReturnPct, 10);
  assert.equal(s.bestPct, 30);
  assert.equal(s.worstPct, -10);
});

test("آمار کارنامهٔ خالی: winRate و avg باید null باشند نه صفر", () => {
  const s = computeTrackStats([]);
  assert.equal(s.total, 0);
  assert.equal(s.winRatePct, null);
  assert.equal(s.avgReturnPct, null);
});

// ── computeWeeklyStats ───────────────────────────────────────────────

function wk(partial: Partial<WeeklyOutlookRecord>): WeeklyOutlookRecord {
  return {
    id: partial.id ?? "w",
    seq: partial.seq ?? 1,
    week_start: partial.week_start ?? "2026-01-03",
    label: partial.label ?? "خنثی",
    score: partial.score ?? 50,
    drivers: partial.drivers ?? [],
    assumptions: partial.assumptions ?? [],
    note_md: partial.note_md ?? null,
    published_at: partial.published_at ?? "2026-01-03T00:00:00Z",
    prev_hash: partial.prev_hash ?? "GENESIS",
    record_hash: partial.record_hash ?? "h",
    result: partial.result ?? null,
  };
}

test("دقت چشم‌انداز هفتگی: ۲ از ۳ بسته درست → ۶۶.۷٪", () => {
  const rows = [
    wk({ seq: 1, result: { realized_label: "سازنده", realized_score: 70, correct: true, closed_at: "", record_hash: "" } }),
    wk({ seq: 2, result: { realized_label: "فرسایشی", realized_score: 30, correct: false, closed_at: "", record_hash: "" } }),
    wk({ seq: 3, result: { realized_label: "خنثی", realized_score: 50, correct: true, closed_at: "", record_hash: "" } }),
    wk({ seq: 4, result: null }),
  ];
  const s = computeWeeklyStats(rows);
  assert.equal(s.total, 4);
  assert.equal(s.closed, 3);
  assert.equal(s.correct, 2);
  assert.equal(s.accuracyPct, 66.7);
});

// ── verifyChain / verifyLinkage ──────────────────────────────────────

function buildChain(payloads: string[]): RawChainRow[] {
  const rows: RawChainRow[] = [];
  let prev = "GENESIS";
  payloads.forEach((p, i) => {
    const record_hash = sha256Hex(prev + "|" + p);
    rows.push({ seq: i + 1, prev_hash: prev, record_hash, payload: p });
    prev = record_hash;
  });
  return rows;
}

test("زنجیرهٔ سالم سه‌رکوردی تأیید می‌شود", () => {
  const rows = buildChain(["a", "b", "c"]);
  const check = verifyChain(rows);
  assert.equal(check.ok, true);
  assert.equal(check.length, 3);
  assert.equal(check.brokenAtSeq, null);
});

test("دستکاری payload رکورد وسط → زنجیره در همان seq می‌شکند", () => {
  const rows = buildChain(["a", "b", "c"]);
  rows[1].payload = "B-TAMPERED";
  const check = verifyChain(rows);
  assert.equal(check.ok, false);
  assert.equal(check.brokenAtSeq, 2);
});

test("دستکاری record_hash آخرین رکورد → شکست", () => {
  const rows = buildChain(["a", "b"]);
  rows[1].record_hash = "f".repeat(64);
  const check = verifyChain(rows);
  assert.equal(check.ok, false);
  assert.equal(check.brokenAtSeq, 2);
});

test("verifyLinkage: پیوستگی prev→record بدون بازمحاسبه", () => {
  const rows = buildChain(["a", "b", "c"]).map(({ seq, prev_hash, record_hash }) => ({
    seq, prev_hash, record_hash,
  }));
  assert.equal(verifyLinkage(rows).ok, true);
  // حذف رکورد وسط → شکست پیوستگی
  const gappy = [rows[0], rows[2]];
  const check = verifyLinkage(gappy);
  assert.equal(check.ok, false);
  assert.equal(check.brokenAtSeq, 3);
});

test("زنجیرهٔ خالی معتبر است (حالت شروع)", () => {
  assert.equal(verifyChain([]).ok, true);
  assert.equal(verifyLinkage([]).ok, true);
});
