import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const { webinar_id } = await req.json();
  if (!webinar_id) {
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

  // اگر وبینار پولی باشد، needs_payment = true → فرانت باید به صفحه پرداخت هدایت کند
  return NextResponse.json({ registration: data });
}
