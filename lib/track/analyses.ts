// کارنامهٔ قابل راستی‌آزمایی — لایهٔ دادهٔ سروری «تحلیل‌های آرش» + چشم‌انداز هفتگی.
//
// اصول (تخطی‌ناپذیر):
//  - جدول‌های signals / signal_outcomes / weekly_outlooks append-only با هش زنجیره‌ای
//    هستند (تریگر دیتابیس). این ماژول فقط «می‌خواند» و زنجیره را مستقلاً بازمحاسبه می‌کند.
//  - هیچ عدد ساختگی؛ دادهٔ ناموجود = null (در UI «—»).
//  - واژگان عمومی: «تحلیل» و «چشم‌انداز» — نه سیگنال/خرید/فروش/توصیه.

import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

// ── انواع ─────────────────────────────────────────────────────────────

export interface AnalysisReasons {
  /** بازهٔ ارزش‌گذاری با فروض — هرگز «قیمت هدف» نیست */
  band?: { low: number | null; high: number | null } | null;
  assumptions?: string[];
  text?: string;
}

export interface AnalysisRecord {
  id: string;
  seq: number;
  symbol: string;
  direction: "buy" | "sell";
  entry_price: number | null;
  entry_date: string;
  horizon: string | null;
  reasons: AnalysisReasons;
  published_at: string;
  prev_hash: string;
  record_hash: string;
  outcome: OutcomeRecord | null;
}

export interface OutcomeRecord {
  id: string;
  seq: number;
  signal_id: string;
  exit_price: number | null;
  exit_date: string;
  outcome: "target" | "stop" | "manual_close" | "expired";
  note: string | null;
  closed_at: string;
  prev_hash: string;
  record_hash: string;
}

export interface WeeklyOutlookRecord {
  id: string;
  seq: number;
  week_start: string;
  label: "سازنده" | "خنثی" | "فرسایشی";
  score: number | null;
  drivers: Array<{ label: string; value: string; effect: string }>;
  assumptions: string[];
  note_md: string | null;
  published_at: string;
  prev_hash: string;
  record_hash: string;
  result: {
    realized_label: string;
    realized_score: number | null;
    correct: boolean;
    closed_at: string;
    record_hash: string;
  } | null;
}

export interface TrackStats {
  total: number;
  open: number;
  closed: number;
  /** درصد تحلیل‌های بسته‌شده با بازده مثبت (در جهت اعلام‌شده) */
  winRatePct: number | null;
  /** میانگین بازده تحلیل‌های بسته‌شده (٪) — در جهت اعلام‌شده */
  avgReturnPct: number | null;
  /** بهترین/بدترین نتیجهٔ بسته‌شده (٪) */
  bestPct: number | null;
  worstPct: number | null;
}

export interface WeeklyStats {
  total: number;
  closed: number;
  correct: number;
  accuracyPct: number | null;
}

export interface ChainCheck {
  ok: boolean;
  length: number;
  brokenAtSeq: number | null;
}

// ── بازده یک تحلیل بسته‌شده در جهت اعلام‌شده ──────────────────────────

export function realizedReturnPct(
  direction: "buy" | "sell",
  entry: number | null,
  exit: number | null
): number | null {
  if (entry == null || exit == null || entry <= 0) return null;
  const raw = ((exit - entry) / entry) * 100;
  const signed = direction === "sell" ? -raw : raw;
  return Math.round(signed * 100) / 100;
}

// ── آمار کارنامه (تابع خالص — تست‌پذیر) ───────────────────────────────

export function computeTrackStats(records: AnalysisRecord[]): TrackStats {
  const closed = records.filter((r) => r.outcome != null);
  const open = records.length - closed.length;
  const rets = closed
    .map((r) => realizedReturnPct(r.direction, r.entry_price, r.outcome!.exit_price))
    .filter((x): x is number => x != null);
  const winRatePct =
    rets.length > 0
      ? Math.round((rets.filter((x) => x > 0).length / rets.length) * 1000) / 10
      : null;
  const avgReturnPct =
    rets.length > 0
      ? Math.round((rets.reduce((a, b) => a + b, 0) / rets.length) * 100) / 100
      : null;
  return {
    total: records.length,
    open,
    closed: closed.length,
    winRatePct,
    avgReturnPct,
    bestPct: rets.length > 0 ? Math.max(...rets) : null,
    worstPct: rets.length > 0 ? Math.min(...rets) : null,
  };
}

export function computeWeeklyStats(rows: WeeklyOutlookRecord[]): WeeklyStats {
  const closed = rows.filter((r) => r.result != null);
  const correct = closed.filter((r) => r.result!.correct).length;
  return {
    total: rows.length,
    closed: closed.length,
    correct,
    accuracyPct:
      closed.length > 0 ? Math.round((correct / closed.length) * 1000) / 10 : null,
  };
}

// ── راستی‌آزمایی مستقل زنجیرهٔ هش (همان فرمول تریگر دیتابیس) ─────────
// فرمول signals: sha256(prev|symbol|direction|entry_price|entry_date|reasons|published_at)
// نکته: reasons باید *عین* متن jsonb ذخیره‌شده باشد؛ چون PostgREST json را
// بازچینش می‌کند، این تابع روی رکوردهای خام «متنی» کار می‌کند (verify API).

export interface RawChainRow {
  seq: number;
  prev_hash: string;
  record_hash: string;
  /** متن ورودی هش (بدون prev_hash) — از ستون‌های رکورد ساخته می‌شود */
  payload: string;
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * زنجیره را از GENESIS بازمحاسبه می‌کند. هر رکورد باید:
 *  ۱) prev_hash == record_hash رکورد قبلی (یا GENESIS برای اولین)
 *  ۲) record_hash == sha256(prev_hash || '|' || payload)
 */
export function verifyChain(rows: RawChainRow[]): ChainCheck {
  const sorted = [...rows].sort((a, b) => a.seq - b.seq);
  let prev = "GENESIS";
  for (const row of sorted) {
    if (row.prev_hash !== prev) return { ok: false, length: sorted.length, brokenAtSeq: row.seq };
    const expect = sha256Hex(row.prev_hash + "|" + row.payload);
    if (row.record_hash !== expect)
      return { ok: false, length: sorted.length, brokenAtSeq: row.seq };
    prev = row.record_hash;
  }
  return { ok: true, length: sorted.length, brokenAtSeq: null };
}

/** پیوستگی زنجیره (بدون بازمحاسبهٔ hash — مستقل از سریال‌سازی jsonb):
 *  فقط چک می‌کند prev_hash هر رکورد به record_hash قبلی زنجیر است. */
export function verifyLinkage(
  rows: Array<{ seq: number; prev_hash: string; record_hash: string }>
): ChainCheck {
  const sorted = [...rows].sort((a, b) => a.seq - b.seq);
  let prev = "GENESIS";
  for (const row of sorted) {
    if (row.prev_hash !== prev) return { ok: false, length: sorted.length, brokenAtSeq: row.seq };
    if (!/^[0-9a-f]{64}$/.test(row.record_hash))
      return { ok: false, length: sorted.length, brokenAtSeq: row.seq };
    prev = row.record_hash;
  }
  return { ok: true, length: sorted.length, brokenAtSeq: null };
}

// ── خواندن از Supabase (anon — RLS خواندن عمومی) ─────────────────────

function anonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return createClient(url, anon, { auth: { persistSession: false } });
}

export async function fetchAnalyses(limit = 100): Promise<AnalysisRecord[]> {
  const sb = anonClient();
  if (!sb) return [];
  const { data: sigs, error } = await sb
    .from("signals")
    .select(
      "id, seq, symbol, direction, entry_price, entry_date, horizon, reasons, published_at, prev_hash, record_hash"
    )
    .order("seq", { ascending: false })
    .limit(limit);
  if (error || !sigs) return [];
  const ids = sigs.map((s) => s.id);
  let outcomes: OutcomeRecord[] = [];
  if (ids.length > 0) {
    const { data: outs } = await sb
      .from("signal_outcomes")
      .select(
        "id, seq, signal_id, exit_price, exit_date, outcome, note, closed_at, prev_hash, record_hash"
      )
      .in("signal_id", ids);
    outcomes = (outs ?? []) as OutcomeRecord[];
  }
  const byId = new Map(outcomes.map((o) => [o.signal_id, o]));
  return sigs.map((s) => ({
    ...(s as Omit<AnalysisRecord, "outcome" | "reasons">),
    reasons: (s.reasons ?? {}) as AnalysisReasons,
    outcome: byId.get(s.id) ?? null,
  }));
}

export async function fetchWeeklyOutlooks(limit = 60): Promise<WeeklyOutlookRecord[]> {
  const sb = anonClient();
  if (!sb) return [];
  const { data, error } = await sb
    .from("weekly_outlooks")
    .select(
      "id, seq, week_start, label, score, drivers, assumptions, note_md, published_at, prev_hash, record_hash"
    )
    .order("seq", { ascending: false })
    .limit(limit);
  // جدول ممکن است هنوز ساخته نشده باشد (phase12 اجرا نشده) — حالت خالی صادقانه.
  if (error || !data) return [];
  const ids = data.map((d) => d.id);
  let results: Array<{
    outlook_id: string;
    realized_label: string;
    realized_score: number | null;
    correct: boolean;
    closed_at: string;
    record_hash: string;
  }> = [];
  if (ids.length > 0) {
    const { data: res } = await sb
      .from("weekly_outlook_results")
      .select("outlook_id, realized_label, realized_score, correct, closed_at, record_hash")
      .in("outlook_id", ids);
    results = res ?? [];
  }
  const byId = new Map(results.map((r) => [r.outlook_id, r]));
  return data.map((d) => ({
    ...(d as Omit<WeeklyOutlookRecord, "result" | "drivers" | "assumptions">),
    drivers: (d.drivers ?? []) as WeeklyOutlookRecord["drivers"],
    assumptions: (d.assumptions ?? []) as string[],
    result: byId.get(d.id) ?? null,
  }));
}
