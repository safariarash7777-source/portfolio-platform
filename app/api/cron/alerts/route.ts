import { NextRequest, NextResponse } from "next/server";
import { getMarketData, evaluateAlerts } from "@/lib/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/cron/alerts — ارزیابیِ تضمینیِ هشدارها هر ۵ دقیقه (Vercel Cron).
// با CRON_SECRET محافظت می‌شود؛ اعتبارسنجی پیش از هر خواندن/نوشتنِ داده انجام
// می‌شود. منطقِ ارزیابی از lib/market (همان مسیرِ ترافیک) reuse می‌شود، نه
// duplicate؛ غیرفعال‌سازیِ اتمیک قبل از DM تضمین می‌کند هشدار دوبار ارسال نشود.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // قیمتِ تازه از همان کشِ موجود؛ سپس ارزیابیِ صریحِ هشدارهای active.
  const data = await getMarketData();
  if (data.ok) {
    await evaluateAlerts(data.crypto);
  }

  return NextResponse.json({ ok: true, evaluated: data.ok, at: data.fetchedAt });
}
