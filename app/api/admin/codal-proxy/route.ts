// پراکسی توسعه: دریافت اکسل خام کدال از طریق رله (لیارا، داخل ایران).
// excel.codal.ir از IP خارجی در دسترس نیست؛ این مسیر برای اعتبارسنجی عددی
// پارسر بانک/بیمه (T5) لازم است: sandbox → Vercel → Liara → excel.codal.ir.
// احراز: Bearer باید با SUPABASE_SERVICE_ROLE_KEY برابر باشد (سکرت فقط-سرور).
// توکن رله از env یا پارامتر امن گرفته می‌شود؛ نشانی رله فقط دامنهٔ لیارای خودمان.

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RELAY_BASE =
  process.env.IR_MARKET_RELAY_URL?.replace(/\/+$/, "") || "https://arsadata.liara.run";

export async function GET(req: NextRequest) {
  // احراز به عهدهٔ خود رله است: Bearer ورودی عیناً به رله فوروارد می‌شود و
  // رله بدون RELAY_TOKEN معتبر 401 می‌دهد. این مسیر سکرتی نگه نمی‌دارد و
  // فقط دامنهٔ excel.codal.ir را از طریق رلهٔ خودمان عبور می‌دهد (بدون SSRF باز).
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const target = req.nextUrl.searchParams.get("url") || "";
  if (!/^https:\/\/excel\.codal\.ir\//.test(target)) {
    return NextResponse.json({ error: "only excel.codal.ir urls" }, { status: 400 });
  }
  try {
    const res = await fetch(
      `${RELAY_BASE}/codal-raw?url=${encodeURIComponent(target)}`,
      {
        headers: { Authorization: auth },
        cache: "no-store",
        signal: AbortSignal.timeout(55000),
      }
    );
    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
