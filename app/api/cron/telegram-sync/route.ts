import { NextRequest, NextResponse } from "next/server";
import { runTelegramFeedSync } from "@/lib/telegram-sync";
import { runWithLedger } from "@/lib/cron/ledger";
import { createCronLedgerStore, currentDeploymentSha } from "@/lib/cron/store";

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

  // `P2-G2-012`: هر اجرا ثبت می‌شود — حتی وقتی `inserted=0`.
  // چرا لازم بود: این job فقط وقتی در `content_hub` درج می‌کند که پستِ تازه‌ای
  // باشد. پس «ردیفِ تازه نیست» یعنی «کانال ساکت بوده» **یا** «سه روز است اجرا
  // نشده» — و آن دو از بیرون یکسان به‌نظر می‌رسیدند.
  const { result } = await runWithLedger({
    store: createCronLedgerStore(),
    jobKey: "telegram-sync",
    deploymentSha: currentDeploymentSha(),
    job: async () => {
      const r = await runTelegramFeedSync();
      return {
        outcome: {
          ok: r.ok,
          processedCount: r.inserted,
          errorCode: r.ok ? null : (r.reason ?? "sync_failed"),
          // پیامِ خامِ این job می‌تواند URLِ فید داشته باشد؛ `sanitizeErrorSummary`
          // آن را پاک می‌کند. اینجا فقط کدِ کوتاه پاس داده می‌شود.
          rawError: r.ok ? null : (r.reason ?? null),
        },
        value: r,
      };
    },
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
