import { NextRequest, NextResponse } from "next/server";
import { runTelegramFeedSync } from "@/lib/telegram-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/cron/telegram-sync — همگام‌سازیِ هابِ محتوا با فیدِ عمومیِ کانال.
// با CRON_SECRET محافظت می‌شود (اعتبارسنجی پیش از هر خواندن/نوشتن). منطقِ واقعی
// در lib/telegram-sync است تا با دکمهٔ دستیِ ادمین مشترک باشد. append-only.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const result = await runTelegramFeedSync();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
