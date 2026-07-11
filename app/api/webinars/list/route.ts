import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/webinars/list — لیست وبینارهای عمومی (published/live/ended)
export async function GET() {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("webinars")
    .select(
      "id, title, description, starts_at, ends_at, registration_open, max_capacity, price_toman, platform, platform_url, status, created_at"
    )
    .in("status", ["published", "live", "ended"])
    .order("starts_at", { ascending: false });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  // اضافه کردن تعداد ثبت‌نام‌ها (بدون نمایش اطلاعات شخصی)
  const webinarsWithCount = await Promise.all(
    (data ?? []).map(async (w) => {
      const { count } = await admin
        .from("webinar_registrations")
        .select("*", { count: "exact", head: true })
        .eq("webinar_id", w.id)
        .in("payment_status", ["paid", "free"]);
      return { ...w, registered_count: count ?? 0 };
    })
  );

  return NextResponse.json({ webinars: webinarsWithCount });
}
