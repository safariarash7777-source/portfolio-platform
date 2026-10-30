import { NextResponse } from "next/server";
import { readStoredCodalFeed } from "@/lib/codal-feed-reader";

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
  const read = await readStoredCodalFeed(symbol);
  if (!read.ok) {
    return NextResponse.json({ error: read.error, codalSearchUrl }, { status: read.status });
  }
  return NextResponse.json(
    { ...read.result, codalSearchUrl, source: "codal_feed", coverage: "stored-announcements" },
    { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=300" } },
  );
}
