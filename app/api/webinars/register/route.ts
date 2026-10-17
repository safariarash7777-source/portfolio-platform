import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { record, uuid } from "@/lib/webinars/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/webinars/register — ثبت‌نام کاربر در وبینار
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "ابتدا وارد شوید." }, { status: 401 });
  }

  const body: unknown = await req.json().catch(() => null);
  const webinar_id = record(body) ? body.webinar_id : null;
  if (!uuid(webinar_id)) {
    return NextResponse.json(
      { error: "webinar_id الزامی است." },
      { status: 400 }
    );
  }

  // ⚠️ این RPC **باید** با کلاینتِ نشست صدا زده شود.
  //
  // `register_for_webinar` یک تابعِ SECURITY DEFINER است که اولین کارش
  // `v_user_id := auth.uid()` است و اگر NULL باشد `دسترسی غیرمجاز.` پرتاب
  // می‌کند. کلاینتِ service-role هیچ نشستی حمل نمی‌کند، پس `auth.uid()` همیشه
  // NULL بود و این مسیر **همیشه** شکست می‌خورد — حتی وقتی کلیدِ سرویس‌رول
  // موجود بود. کاربرِ واردشده پیامِ «دسترسی غیرمجاز.» می‌گرفت.
  //
  // با نشستِ خودِ کاربر، تابع همان کاری را می‌کند که برایش نوشته شده: ظرفیت،
  // ثبت‌نامِ تکراری و وضعیتِ وبینار را می‌سنجد و `audit_log` را با actorِ درست
  // پر می‌کند.
  const { data, error } = await supabase.rpc("register_for_webinar", {
    p_webinar_id: webinar_id,
  });

  if (error) {
    // خطاهای کاربرپسند از RPC
    const msg = error.message || "خطا در ثبت‌نام.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // An old/incomplete response cannot authorize UI guesses about free access or another payment.
  if (!record(data) || !uuid(data.registration_id) || data.webinar_id !== webinar_id ||
      typeof data.needs_payment !== "boolean" || typeof data.already_registered !== "boolean" ||
      !["pending", "paid", "free"].includes(String(data.payment_status)) ||
      data.needs_payment !== (data.payment_status === "pending")) {
    return NextResponse.json({ error: "قرارداد ثبت‌نام هنوز آماده نیست." }, { status: 503 });
  }
  if (data.fulfillment_state === "paid_pending_resolution" &&
      (data.payment_status !== "paid" || data.needs_payment || data.resolution_kind !== "refund_due")) {
    return NextResponse.json({ error: "وضعیت پرداخت نیازمند بررسی معتبر است." }, { status: 503 });
  }
  return NextResponse.json({ registration: data });
}
