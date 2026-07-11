import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

  const admin = createAdminClient();

  // استفاده از RPC امن
  const { data, error } = await admin.rpc("register_for_webinar", {
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
