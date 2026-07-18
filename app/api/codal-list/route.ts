import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/codal-list?symbol=نماد — فهرست اطلاعیه‌های کدال یک نماد (T5-2).
// معماری: Vercel به Liara دسترسی ندارد؛ به‌جای فراخوانی زندهٔ رله، فهرست از
// جدول codal_reports در Supabase خوانده می‌شود (رله آن را پر می‌کند) و
// لینک جست‌وجوی رسمی codal.ir همیشه همراه پاسخ برمی‌گردد — بدون دادهٔ ساختگی.

type CodalRow = {
  id: number;
  report_kind: string | null;
  title: string | null;
  source_url: string | null;
  raw: {
    announcement_link?: string | null;
    date_publish?: string | null;
    period_end_jalali?: string | null;
  } | null;
  data: { period_end?: string } | null;
};

function cleanUrl(row: CodalRow): string | null {
  const link = row.raw?.announcement_link ?? row.source_url;
  return link ? link.replace(/#pv\d+$/, "") : null;
}

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
    const qs = new URLSearchParams({
      select: "id,report_kind,title,source_url,raw,data",
      symbol: `eq.${symbol}`,
      order: "id.desc",
      limit: "60",
    });
    const res = await fetch(`${url.replace(/\/+$/, "")}/rest/v1/codal_reports?${qs}`, {
      headers: { apikey: anon, Authorization: `Bearer ${anon}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      return NextResponse.json({ error: `supabase ${res.status}`, codalSearchUrl }, { status: 502 });
    }
    const rows = (await res.json()) as CodalRow[];
    // dedup روی لینک اطلاعیه (جدول append-only است و نسخه‌های #pvN دارد)
    const seen = new Set<string>();
    const data: Array<{ title: string; kind: string | null; date: string | null; url: string | null }> = [];
    for (const r of rows) {
      if (!r.title) continue;
      const u = cleanUrl(r);
      const key = u ?? `${r.title}|${r.data?.period_end ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      data.push({
        title: r.title,
        kind: r.report_kind,
        date: r.raw?.date_publish ?? r.raw?.period_end_jalali ?? null,
        url: u,
      });
      if (data.length >= 30) break;
    }
    return NextResponse.json(
      { data, codalSearchUrl },
      { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=300" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "fetch failed", codalSearchUrl },
      { status: 502 },
    );
  }
}
