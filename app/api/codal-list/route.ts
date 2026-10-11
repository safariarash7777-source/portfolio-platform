import { NextResponse } from "next/server";
import { codalFeedItems, codalFeedQuery } from "@/lib/codal-feed";

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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ error: "supabase not configured", codalSearchUrl }, { status: 503 });
  }
  try {
    const qs = codalFeedQuery(symbol);
    const res = await fetch(`${url.replace(/\/+$/, "")}/rest/v1/codal_feed?${qs}`, {
      headers: { apikey: anon, Authorization: `Bearer ${anon}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      return NextResponse.json({ error: `supabase ${res.status}`, codalSearchUrl }, { status: 502 });
    }
    const data = codalFeedItems(await res.json());
    return NextResponse.json(
      { data, codalSearchUrl, source: "codal_feed", coverage: "stored-announcements" },
      { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=300" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "fetch failed", codalSearchUrl },
      { status: 502 },
    );
  }
}
