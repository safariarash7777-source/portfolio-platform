// پراکسی توسعه: دریافت اکسل خام کدال از طریق رله (لیارا، داخل ایران).
// excel.codal.ir از IP خارجی در دسترس نیست؛ این مسیر برای اعتبارسنجی عددی
// پارسر بانک/بیمه (T5) لازم است: sandbox → Vercel → Liara → excel.codal.ir.
// محافظت: هدر Authorization باید با IR_MARKET_RELAY_TOKEN برابر باشد (فقط توسعه/ادمین).

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const relayBase = process.env.IR_MARKET_RELAY_URL;
  const token = process.env.IR_MARKET_RELAY_TOKEN;
  if (!relayBase || !token) {
    return NextResponse.json({ error: "relay not configured" }, { status: 503 });
  }
  // احراز: همان توکن رله — فقط دارندهٔ سکرت سرور می‌تواند استفاده کند.
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${token}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const target = req.nextUrl.searchParams.get("url") || "";
  if (!/^https:\/\/excel\.codal\.ir\//.test(target)) {
    return NextResponse.json({ error: "only excel.codal.ir urls" }, { status: 400 });
  }
  try {
    const res = await fetch(
      `${relayBase.replace(/\/+$/, "")}/codal-raw?url=${encodeURIComponent(target)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
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
