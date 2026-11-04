import { logStoredReadFailure, type StoredReadPhase } from "@/lib/stored-read-diagnostics";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/symbol-detail?l18=نماد — دیتای جامع نماد (T5-1).
// معماری: Vercel به Liara دسترسی ندارد؛ رله دیتای نمادهای پرارزش را چرخشی در
// Supabase (جدول ir_market_snapshots، key='symbol_details') آپسرت می‌کند و
// اینجا فقط از Supabase خوانده می‌شود — همان الگوی اسنپ‌شات بازار.
// نمادی که هنوز در چرخه نیست ⇒ 404 صادق (کامپوننت حالت خالی صادق نشان می‌دهد).

type CachedQuote = {
  symbol: string; instrumentCode: string; unit: "rial";
  lastRial: number | null; closeRial: number | null;
  sourceDateRaw: string; sourceTimeRaw: string; sourceAtUtc: null;
  sourceDateCalendar: "gregorian"; freshness: "unknown";
};
function validQuote(q: CachedQuote | null | undefined, symbol: string): q is CachedQuote {
  if (!q || symbol !== "فملی" || q.symbol !== symbol || q.instrumentCode !== "35425587644337450"
    || q.unit !== "rial" || q.sourceDateCalendar !== "gregorian" || q.sourceAtUtc !== null || q.freshness !== "unknown") return false;
  if (typeof q.sourceDateRaw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(q.sourceDateRaw)
    || typeof q.sourceTimeRaw !== "string" || !/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(q.sourceTimeRaw)) return false;
  const day = new Date(q.sourceDateRaw + "T00:00:00Z");
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== q.sourceDateRaw) return false;
  return [q.lastRial, q.closeRial].every(value => value === null || (typeof value === "number" && Number.isFinite(value) && value > 0))
    && ((typeof q.lastRial === "number" && q.lastRial > 0) || (typeof q.closeRial === "number" && q.closeRial > 0));
}
type DetailsPayload = {
  schema?: string;
  quotes?: Record<string, CachedQuote>;
  at?: number;
  details?: Record<string, { at?: number; data?: unknown }>;
};

export async function GET(req: Request) {
  const l18 = new URL(req.url).searchParams.get("l18")?.trim();
  if (!l18) {
    return NextResponse.json({ error: "l18 required" }, { status: 400 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ error: "supabase not configured" }, { status: 503 });
  }
  const startedAt = Date.now();
  let phase: StoredReadPhase = "request";
  let upstreamStatus: number | undefined;
  try {
    const res = await fetch(
      `${url.replace(/\/+$/, "")}/rest/v1/ir_market_snapshots?key=in.(symbol_details,mcpfarsi_quotes)&select=key,payload&limit=2`,
      {
        headers: { apikey: anon, Authorization: `Bearer ${anon}`, Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      },
    );
    phase = "headers";
    upstreamStatus = res.status;
    if (!res.ok) {
      logStoredReadFailure({ route: "symbol-detail", phase, elapsedMs: Date.now() - startedAt, upstreamStatus });
      return NextResponse.json({ error: `supabase ${res.status}` }, { status: 502 });
    }
    phase = "body";
    const rows = (await res.json()) as Array<{ key?: string; payload?: DetailsPayload }>;
    const payload = Array.isArray(rows) ? rows.find(row => row.key === "symbol_details")?.payload : null;
    const quotes = Array.isArray(rows) ? rows.find(row => row.key === "mcpfarsi_quotes")?.payload : null;
    const candidate = quotes?.schema === "mcpfarsi-quotes.v1" ? quotes.quotes?.[l18] : null;
    const quote = validQuote(candidate, l18) ? candidate : null;
    const entry = payload?.details?.[l18];
    if ((!entry || !entry.data) && !quote) {
      // حالت خالی صادق — نماد هنوز وارد چرخهٔ به‌روزرسانی رله نشده است.
      return NextResponse.json({ error: "not in rotation" }, { status: 404 });
    }
    return NextResponse.json(
      // The batch clock cannot establish freshness for an individual retained row.
      { data: entry?.data ?? null, at: entry?.at ?? null, quote, quoteLive: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    logStoredReadFailure({ route: "symbol-detail", phase, elapsedMs: Date.now() - startedAt, upstreamStatus, error: e });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "fetch failed" },
      { status: 502 },
    );
  }
}
