import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/symbol-detail?l18=نماد — پروکسی سمت سرور به /symbol.json رله (T5-1).
// توکن رله فقط سمت سرور می‌ماند؛ کلاینت هیچ سکرتی نمی‌بیند.
// رله خودش کش ۳دقیقه‌ای و سقف روزانه دارد؛ اینجا فقط عبور امن + خطای صادق.
export async function GET(req: Request) {
  const l18 = new URL(req.url).searchParams.get("l18")?.trim();
  if (!l18) {
    return NextResponse.json({ error: "l18 required" }, { status: 400 });
  }
  const base = process.env.IR_MARKET_RELAY_URL;
  if (!base) {
    // حالت خالی صادق — رله پیکربندی نشده
    return NextResponse.json({ error: "relay not configured" }, { status: 503 });
  }
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = process.env.IR_MARKET_RELAY_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetch(
      `${base.replace(/\/+$/, "")}/symbol.json?l18=${encodeURIComponent(l18)}`,
      { headers, cache: "no-store", signal: AbortSignal.timeout(20000) },
    );
    if (!res.ok) {
      return NextResponse.json({ error: `relay ${res.status}` }, { status: 502 });
    }
    const j = (await res.json()) as unknown;
    return NextResponse.json(j, {
      headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=120" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "fetch failed" },
      { status: 502 },
    );
  }
}
