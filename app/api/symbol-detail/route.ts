import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/symbol-detail?l18=نماد — دیتای جامع نماد (T5-1).
// معماری: Vercel به Liara دسترسی ندارد؛ رله دیتای نمادهای پرارزش را چرخشی در
// Supabase (جدول ir_market_snapshots، key='symbol_details') آپسرت می‌کند و
// اینجا فقط از Supabase خوانده می‌شود — همان الگوی اسنپ‌شات بازار.
// نمادی که هنوز در چرخه نیست ⇒ 404 صادق (کامپوننت حالت خالی صادق نشان می‌دهد).

type DetailsPayload = {
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
  try {
    const res = await fetch(
      `${url.replace(/\/+$/, "")}/rest/v1/ir_market_snapshots?key=eq.symbol_details&select=payload&limit=1`,
      {
        headers: { apikey: anon, Authorization: `Bearer ${anon}`, Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!res.ok) {
      return NextResponse.json({ error: `supabase ${res.status}` }, { status: 502 });
    }
    const rows = (await res.json()) as Array<{ payload?: DetailsPayload }>;
    const payload = Array.isArray(rows) && rows[0] ? rows[0].payload : null;
    const entry = payload?.details?.[l18];
    if (!entry || !entry.data) {
      // حالت خالی صادق — نماد هنوز وارد چرخهٔ به‌روزرسانی رله نشده است.
      return NextResponse.json({ error: "not in rotation" }, { status: 404 });
    }
    return NextResponse.json(
      { data: entry.data, at: entry.at ?? payload?.at ?? null },
      { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=120" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "fetch failed" },
      { status: 502 },
    );
  }
}
