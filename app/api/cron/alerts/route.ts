import { NextRequest, NextResponse } from "next/server";
import { getMarketData, evaluateAlerts } from "@/lib/market";
import { runWithLedger } from "@/lib/cron/ledger";
import { createCronLedgerStore, currentDeploymentSha } from "@/lib/cron/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/cron/alerts — ارزیابیِ تضمینیِ هشدارها، **روزانه** (Vercel Cron).
// زمان‌بندیِ مرجع در `vercel.json` است: `0 6 * * *`. کامنتِ قبلی «هر ۵ دقیقه»
// می‌گفت که با هیچ اجرایی مطابقت نداشت.
// با CRON_SECRET محافظت می‌شود؛ اعتبارسنجی پیش از هر خواندن/نوشتنِ داده انجام
// می‌شود. منطقِ ارزیابی از lib/market (همان مسیرِ ترافیک) reuse می‌شود، نه
// duplicate؛ غیرفعال‌سازیِ اتمیک قبل از DM تضمین می‌کند هشدار دوبار ارسال نشود.
//
// `P2-G2-012`: هر اجرا در `public.cron_runs` ثبت می‌شود. چرا لازم بود — این job
// وقتی هیچ هشدارِ فعالی نباشد **هیچ ردیفِ ماندگاری نمی‌نویسد**، پس یک اجرای
// کاملاً موفق از بیرون با «اصلاً اجرا نشد» یکسان به‌نظر می‌رسید.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    // احرازِ ناموفق **ثبت نمی‌شود**: دفتر برای اجراهای واقعی است، نه برای اینکه
    // هر کاوشگرِ اینترنتی بتواند با درخواستِ ۴۰۱ آن را پر کند.
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const { result } = await runWithLedger({
    store: createCronLedgerStore(),
    jobKey: "alerts",
    deploymentSha: currentDeploymentSha(),
    job: async () => {
      // قیمتِ تازه از همان کشِ موجود؛ سپس ارزیابیِ صریحِ هشدارهای active.
      const data = await getMarketData();
      if (!data.ok) {
        return {
          outcome: { ok: false, processedCount: 0, errorCode: "market_data_unavailable", rawError: null },
          value: { ok: true, evaluated: false, at: data.fetchedAt },
        };
      }
      await evaluateAlerts(data.crypto);
      return {
        outcome: { ok: true, processedCount: null, errorCode: null, rawError: null },
        value: { ok: true, evaluated: true, at: data.fetchedAt },
      };
    },
  });

  return NextResponse.json(result);
}
