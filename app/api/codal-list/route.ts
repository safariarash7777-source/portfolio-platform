import { logStoredReadFailure, type StoredReadPhase } from "@/lib/stored-read-diagnostics";
import { NextResponse } from "next/server";
import { codalFeedItems, codalFeedQuery } from "@/lib/codal-feed";
import { fundamentalReadPair } from "@/lib/fundamental/read-config.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/codal-list?symbol=نماد — فهرست اطلاعیه‌های کدال یک نماد (T5-2).
// فهرست فقط از جدول اطلاعیه‌های ذخیره‌شدهٔ codal_feed خوانده می‌شود و
// لینک جست‌وجوی رسمی codal.ir همیشه همراه پاسخ برمی‌گردد — بدون دادهٔ ساختگی.

export async function GET(req: Request) {
  const symbol = new URL(req.url).searchParams.get("symbol")?.trim();
  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }
  const codalSearchUrl = `https://codal.ir/ReportList.aspx?search&Symbol=${encodeURIComponent(symbol)}`;
  const pair = Object.freeze({
    FUNDAMENTAL_READ_URL: process.env.FUNDAMENTAL_READ_URL,
    FUNDAMENTAL_READ_ANON_KEY: process.env.FUNDAMENTAL_READ_ANON_KEY,
  });
  const override = pair.FUNDAMENTAL_READ_URL !== undefined || pair.FUNDAMENTAL_READ_ANON_KEY !== undefined;
  const selected = override ? fundamentalReadPair(pair) : {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
  const url = selected?.url;
  const anon = selected?.anon;
  if (!url || !anon) {
    return NextResponse.json({ error: "supabase not configured", codalSearchUrl }, { status: 503 });
  }
  const startedAt = Date.now();
  let phase: StoredReadPhase = "request";
  let upstreamStatus: number | undefined;
  try {
    const qs = codalFeedQuery(symbol);
    const target = `${url.replace(/\/+$/, "")}/rest/v1/codal_feed?${qs}`;
    const signal = AbortSignal.timeout(15000);
    const options: RequestInit = {
      method: "GET", redirect: "error", credentials: "omit",
      headers: { apikey: anon, Authorization: `Bearer ${anon}`, Accept: "application/json" },
      cache: "no-store",
      signal,
    };
    let res: Response;
    try { res = await fetch(target, options); }
    catch (error) {
      const code = (error as { cause?: { code?: unknown } } | null)?.cause?.code;
      // A read-only connection timeout can recover on a new connection. Reuse
      // the same destination, credentials and overall deadline; never retry an
      // HTTP, body, TLS or authorization failure, and never reset the timer.
      if (code !== "UND_ERR_CONNECT_TIMEOUT" || signal.aborted || Date.now() - startedAt >= 15000) throw error;
      res = await fetch(target, options);
      if (res.ok) {
        try { console.warn("stored_read_recovered", { route: "codal-list", attempts: 2, elapsedMs: Date.now() - startedAt }); }
        catch { /* Logging cannot change a successful read. */ }
      }
    }
    phase = "headers";
    upstreamStatus = res.status;
    if (!res.ok) {
      logStoredReadFailure({ route: "codal-list", phase, elapsedMs: Date.now() - startedAt, upstreamStatus });
      return NextResponse.json({ error: `supabase ${res.status}`, codalSearchUrl }, { status: 502 });
    }
    phase = "body";
    const data = codalFeedItems(await res.json());
    return NextResponse.json(
      { data, codalSearchUrl, source: "codal_feed", coverage: "stored-announcements" },
      { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=300" } },
    );
  } catch (e) {
    logStoredReadFailure({ route: "codal-list", phase, elapsedMs: Date.now() - startedAt, upstreamStatus, error: e });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "fetch failed", codalSearchUrl },
      { status: 502 },
    );
  }
}
