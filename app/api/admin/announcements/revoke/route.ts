import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { describeRevocationScope } from "@/lib/announcements/revocation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/announcements/revoke — برداشتنِ اعلان از دیدِ کاربران.
 *
 * ── چرا کلاینتِ نشست و نه service-role ─────────────────────────────────────
 * `revoke_announcement` خودش `SECURITY DEFINER` است و `is_admin()` را چک
 * می‌کند — دقیقاً مثلِ `publish_announcement`. پس مجوز در **دیتابیس** اعمال
 * می‌شود، نه فقط در این فایل. چکِ نقش اینجا هم هست تا خطای ۴۰۳ تمیز بدهیم،
 * ولی اگر کسی این مسیر را دور بزند، دیتابیس همچنان جلویش را می‌گیرد.
 *
 * ── چه چیزی واقعاً لغو می‌شود ──────────────────────────────────────────────
 * فقط نمایشِ درونِ محصول: داشبورد، REST و `/announcements` بات. ایمیل و پیامِ
 * تلگرامی که رفته‌اند **پس گرفته نمی‌شوند** — `announcement_deliveries` اصلاً
 * شناسهٔ پیام ندارد که بشود حذفشان کرد. پاسخ همین را صریح برمی‌گرداند.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "دسترسی غیرمجاز." }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "دسترسی غیرمجاز." }, { status: 403 });
  }

  let body: { id?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "درخواست نامعتبر." }, { status: 400 });
  }

  const id = (body.id ?? "").trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
    return NextResponse.json({ error: "شناسهٔ اعلامیه نامعتبر است." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("revoke_announcement", {
    p_announcement_id: id,
    p_reason: (body.reason ?? "").trim() || null,
  });

  // خطای دیتابیس هرگز «موفق» گزارش نمی‌شود.
  if (error) {
    console.error("revoke_announcement error:", error.message);
    const forbidden = /دسترسی غیرمجاز/.test(error.message);
    return NextResponse.json(
      { error: forbidden ? "دسترسی غیرمجاز." : "لغو انتشار انجام نشد." },
      { status: forbidden ? 403 : 500 },
    );
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return NextResponse.json({ error: "لغو انتشار انجام نشد." }, { status: 500 });

  return NextResponse.json({
    id,
    revoked_at: row.revoked_at ?? null,
    already_revoked: row.already_revoked === true,
    scope: describeRevocationScope(),
  });
}
