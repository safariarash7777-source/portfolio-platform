import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/codal-list?symbol=نماد — پروکسی سمت سرور به /codal-list رله (T5-2).
// فهرست زندهٔ اطلاعیه‌های کدال یک نماد؛ رله کش ۱۰دقیقه‌ای دارد.
export async function GET(req: Request) {
  const symbol = new URL(req.url).searchParams.get("symbol")?.trim();
  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }
  const base = process.env.IR_MARKET_RELAY_URL;
  if (!base) {
    return NextResponse.json({ error: "relay not configured" }, { status: 503 });
  }
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = process.env.IR_MARKET_RELAY_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetch(
      `${base.replace(/\/+$/, "")}/codal-list?symbol=${encodeURIComponent(symbol)}`,
      { headers, cache: "no-store", signal: AbortSignal.timeout(25000) },
    );
    if (!res.ok) {
      return NextResponse.json({ error: `relay ${res.status}` }, { status: 502 });
    }
    const j = (await res.json()) as unknown;
    return NextResponse.json(j, {
      headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=300" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "fetch failed" },
      { status: 502 },
    );
  }
}
