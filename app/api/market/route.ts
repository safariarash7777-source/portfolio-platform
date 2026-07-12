import { NextResponse } from "next/server";
import { getMarketData } from "@/lib/market";
import { getIrMarket, getLastIrDiag } from "@/lib/market-ir";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/market — دادهٔ بازار (کشِ ۵دقیقه). هر refresh هشدارها را ارزیابی می‌کند.
// ir: دادهٔ بازارِ ایران از رلهٔ داخلی (اختیاری؛ بدون IR_MARKET_RELAY_URL → null).
// ?diag=1 → فیلدِ irDiag با خلاصهٔ عیب‌یابیِ اتصالِ رله (بدونِ سکرت) اضافه می‌شود؛
//           برای فهمیدنِ اینکه چرا ir=null است (env؟ توکن؟ رلهٔ خاموش؟ منبعِ خالی؟).
export async function GET(req: Request) {
  const [data, ir] = await Promise.all([getMarketData(), getIrMarket()]);
  const body: Record<string, unknown> = { ...data, ir };
  if (new URL(req.url).searchParams.get("diag") === "1") {
    body.irDiag = getLastIrDiag();
  }
  return NextResponse.json(body);
}
