import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { finalizePaidAccess } from "@/lib/payments/finalize";
import { createSupabaseFinalizePorts } from "@/lib/payments/adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/webinars/payment/callback — بازگشت از زرین‌پال برای ثبت‌نامِ وبینار.
//
// این مسیر **ماشینِ حالتِ خودش را ندارد**. دقیقاً همان `finalizePaidAccess` را
// صدا می‌زند که callbackِ دوره/مشاوره صدا می‌زند؛ تنها تفاوت `product` است.
//
// پیش‌تر اینجا مستقیماً روی `payments` مقدار نوشته می‌شد (`status:'verified'`،
// ستون‌های `amount_toman`/`description`) — وضعیت و ستون‌هایی که در اسکیما وجود
// ندارند. علاوه بر نادرستی، همان ساختار یعنی هر گاردِ جدید باید دو بار نوشته
// می‌شد.
function webinarsUrl(base: string, params: Record<string, string>): string {
  const url = new URL("/webinars", base);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }
  return url.toString();
}

export async function GET(req: NextRequest) {
  const authority = req.nextUrl.searchParams.get("Authority") ?? "";
  const gatewayStatus = req.nextUrl.searchParams.get("Status") ?? "";

  const base = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    req.nextUrl.origin
  ).replace(/\/$/, "");

  const admin = createAdminClient();
  const ports = createSupabaseFinalizePorts(admin);

  const outcome = await finalizePaidAccess({
    authority,
    gatewayStatus,
    product: "webinar",
    ports,
  });

  if (outcome.status === "failed") {
    return NextResponse.redirect(
      webinarsUrl(base, {
        status: "failed",
        webinar_id: outcome.webinarId ?? "",
      })
    );
  }

  if (outcome.status === "access_pending") {
    return NextResponse.redirect(
      webinarsUrl(base, {
        status: "success",
        webinar_id: outcome.webinarId ?? "",
        access: "pending",
      })
    );
  }

  return NextResponse.redirect(
    webinarsUrl(base, {
      status: "success",
      webinar_id: outcome.webinarId ?? "",
    })
  );
}
