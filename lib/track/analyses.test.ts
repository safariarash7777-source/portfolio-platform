// تست‌های ماژول کارنامه — توابع خالص: بازده، آمار، راستی‌آزمایی زنجیره.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { withDeadline } from "../deadline";
import { toPersianDigits } from "../format";
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

function actualTrackStrip(fetch: (signal: AbortSignal) => Promise<AnalysisRecord[]>) {
  const require = createRequire(import.meta.url);
  const source = readFileSync(new URL("../../components/landing/TrackRecordStrip.tsx", import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const component = { exports: {} as { default: () => Promise<React.ReactElement | null> } };
  const budgets: number[] = [], signals: AbortSignal[] = [];
  let reads = 0, computations = 0;
  const load = (name: string) => {
    if (name === "@/lib/track/analyses") return {
      fetchAnalyses: (limit: number, signal: AbortSignal) => {
        reads++; assert.equal(limit, 100); assert.equal(signal, signals[0]); return fetch(signal);
      },
      computeTrackStats: (records: AnalysisRecord[]) => { computations++; return computeTrackStats(records); },
    };
    if (name === "@/lib/deadline") return {
      withDeadline: (read: (signal: AbortSignal) => Promise<unknown>, ms: number) => {
        budgets.push(ms);
        assert.equal(ms, 4000);
        return withDeadline((signal) => { signals.push(signal); return read(signal); }, 20);
      },
    };
    if (name === "@/lib/format") return { toPersianDigits };
    if (name === "next/link") return { __esModule: true, default: (props: { href: string; children: React.ReactNode }) => React.createElement("a", { href: props.href }, props.children) };
    if (name === "lucide-react") return { ArrowLeft: () => null };
    return require(name);
  };
  vm.runInNewContext(code, { module: component, exports: component.exports, require: load });
  return { render: component.exports.default, budgets, signals, reads: () => reads, computations: () => computations };
}

test("actual home track strip settles ignored cancellation and observes late rejection without invented stats", async () => {
  let rejectLate!: (error: Error) => void;
  const pending = new Promise<AnalysisRecord[]>((_resolve, reject) => { rejectLate = reject; });
  const strip = actualTrackStrip(() => pending);
  assert.equal(await strip.render(), null);
  assert.deepEqual(strip.budgets, [4000]);
  assert.equal(strip.signals[0].aborted, true);
  assert.equal(strip.reads(), 1);
  assert.equal(strip.computations(), 0);
  rejectLate(new Error("late unavailable response"));
  await new Promise<void>((resolve) => setImmediate(resolve));
});

test("actual home track strip hides rejected or genuinely empty reads", async () => {
  for (const fetch of [async (): Promise<AnalysisRecord[]> => { throw new Error("unavailable"); }, async () => []]) {
    const strip = actualTrackStrip(fetch);
    assert.equal(await strip.render(), null);
    assert.equal(strip.reads(), 1);
    assert.deepEqual(strip.budgets, [4000]);
  }
});

test("actual home track strip preserves valid closed record statistics", async () => {
  const strip = actualTrackStrip(async () => [rec({
    outcome: {
      id: "closed", seq: 1, signal_id: "x", exit_price: 1200, exit_date: "2026-02-01",
      outcome: "manual_close", note: null, closed_at: "2026-02-01T00:00:00Z",
      prev_hash: "GENESIS", record_hash: "h",
    },
  }), rec({ id: "open", seq: 2 })]);
  const html = renderToStaticMarkup(await strip.render());
  assert.match(html, /تحلیل منتشرشده/);
  assert.match(html, /بسته‌شده با نتیجهٔ ثبت‌شده/);
  assert.match(html, /میانگین بازدهٔ محقق‌شده/);
  assert.match(html, /<dd[^>]*>۲<\/dd>/);
  assert.match(html, /<dd[^>]*>۱<\/dd>/);
  assert.ok(html.includes("+۲۰٪"));
  assert.ok(html.includes('href="/analyses"'));
  assert.equal(strip.computations(), 1);
  assert.equal(strip.reads(), 1);
  assert.deepEqual(strip.budgets, [4000]);
});

type AnalysisReply = { data: unknown[] | null; error: unknown };
function actualAnalysisReader(first: Promise<AnalysisReply>, outcomes: unknown[] = []) {
  const require = createRequire(import.meta.url);
  const source = readFileSync(new URL("./analyses.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const reader = { exports: {} as { fetchAnalyses: (limit?: number, signal?: AbortSignal) => Promise<AnalysisRecord[]> } };
  const tables: string[] = [], signals: AbortSignal[] = [];
  const from = (table: string) => {
    tables.push(table);
    assert.ok(table === "signals" || table === "signal_outcomes");
    const reply = table === "signals" ? first : Promise.resolve({ data: outcomes, error: null });
    const query = {
      select: () => query, order: () => query, limit: () => query, in: () => query,
      abortSignal: (signal: AbortSignal) => { signals.push(signal); return query; },
      then: (resolve: (value: AnalysisReply) => unknown, reject?: (reason: unknown) => unknown) => reply.then(resolve, reject),
    };
    return query;
  };
  vm.runInNewContext(code, {
    module: reader, exports: reader.exports,
    require: (name: string) => name === "@supabase/supabase-js" ? { createClient: () => ({ from }) } : require(name),
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: "https://synthetic.invalid", NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-public-fixture" } },
  });
  return { read: reader.exports.fetchAnalyses, tables, signals };
}

test("actual analysis reader forwards one optional cancellation signal to both reads and preserves results", async () => {
  const record = rec({});
  const outcome = {
    id: "outcome", seq: 1, signal_id: record.id, exit_price: 1200, exit_date: "2026-02-01",
    outcome: "manual_close", note: null, closed_at: "2026-02-01T00:00:00Z",
    prev_hash: "GENESIS", record_hash: "h",
  };
  for (const signal of [undefined, new AbortController().signal]) {
    const reader = actualAnalysisReader(Promise.resolve({ data: [record], error: null }), [outcome]);
    const result = await reader.read(100, signal);
    assert.deepEqual(reader.tables, ["signals", "signal_outcomes"]);
    assert.deepEqual(reader.signals, signal ? [signal, signal] : []);
    assert.equal(result.length, 1);
    assert.equal(result[0].outcome?.exit_price, 1200);
    assert.equal(computeTrackStats(result).avgReturnPct, 20);
  }
});

test("actual analysis reader never starts outcomes after a cancelled first read resolves late", async () => {
  let resolveFirst!: (value: AnalysisReply) => void;
  const reader = actualAnalysisReader(new Promise((resolve) => { resolveFirst = resolve; }));
  const controller = new AbortController();
  const pending = reader.read(100, controller.signal);
  controller.abort();
  resolveFirst({ data: [rec({})], error: null });
  assert.equal((await pending).length, 0);
  assert.deepEqual(reader.tables, ["signals"]);
  assert.deepEqual(reader.signals, [controller.signal]);
  await reader.read(100, controller.signal);
  assert.deepEqual(reader.tables, ["signals"], "an already-cancelled read never starts a query");
});

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
