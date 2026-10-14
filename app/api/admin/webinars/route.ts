import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { record, uuid, webinarFields, webinarInput } from "@/lib/webinars/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


// ── Helpers ──────────────────────────────────────────────────────────────────
/**
 * گیتِ نقش — و **همان کلاینتی که پرس‌وجوها با آن انجام می‌شوند** را برمی‌گرداند.
 *
 * ── چرا کلاینت را پس می‌دهد ────────────────────────────────────────────
 * نسخهٔ اول اینجا نقش را با کلاینتِ نشست می‌سنجید و بعد آن را دور می‌انداخت
 * تا با کلاینتِ service-role کار کند. نتیجه دو چیزِ بد بود: مسیر به
 * `SUPABASE_SERVICE_ROLE_KEY` گره خورد (و بدونش ۵۰۰ با بدنهٔ خالی می‌داد)، و
 * RLS از مدار خارج شد، پس تنها گیتِ واقعی همین چند خط بالا بود.
 *
 * هر سه جدولِ این مسیر برای admin از طریقِ RLS باز است — `webinars` و
 * `webinar_registrations` با سیاستِ `ALL … is_admin()` و `telegram_links` با
 * `SELECT … (own OR is_admin())`. پس دورزدنِ RLS هیچ‌چیزِ تازه‌ای باز نمی‌کرد
 * و فقط شبکهٔ ایمنی را برمی‌داشت.
 */
async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "unauthorized", status: 401 };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") return { error: "forbidden", status: 403 };
  return { user, supabase };
}

// ── GET: لیست وبینارها (ادمین) ────────────────────────────────────────────────
export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth)
    return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = auth.supabase;
  const { data, error } = await admin
    .from("webinars")
    .select(
      "*, webinar_registrations(count)"
    )
    .order("starts_at", { ascending: false });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ webinars: data });
}

// ── POST: ساخت وبینار جدید ────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth)
    return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body: unknown = await req.json().catch(() => null);
  const values = webinarInput(body);
  if (!values || !record(body) || Object.keys(body).some(key => !webinarFields.includes(key as typeof webinarFields[number]))) {
    return NextResponse.json(
      { error: "قیمت و زمان رویداد را مشخص کنید؛ فعال‌سازی دسترسی به بازه و لینک معتبر نیاز دارد." },
      { status: 400 }
    );
  }

  const admin = auth.supabase;
  const { data, error } = await admin
    .from("webinars")
    .insert(values)
    .select()
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ webinar: data }, { status: 201 });
}

// ── PATCH: ویرایش وبینار ──────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth)
    return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body: unknown = await req.json().catch(() => null);
  if (!record(body)) return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 400 });
  const { id, ...updates } = body;
  if (!uuid(id)) {
    return NextResponse.json({ error: "id الزامی است." }, { status: 400 });
  }

  const admin = auth.supabase;

  // اگر action = send_invites → ارسال دعوت کانال به شرکت‌کنندگان
  if (updates.action === "send_invites") {
    return NextResponse.json({ error: "دعوت کانال تا تعیین سیاست جداگانه غیرفعال است. دسترسی این بسته فقط برای همان وبینار است." }, { status: 503 });
  }

  if (Object.keys(updates).some(key => !webinarFields.includes(key as typeof webinarFields[number]))) {
    return NextResponse.json({ error: "فیلد ویرایش نامعتبر است." }, { status: 400 });
  }
  const { data: existing, error: readError } = await admin.from("webinars").select("*").eq("id", id).maybeSingle();
  if (readError || !existing) return NextResponse.json({ error: "وبینار یافت نشد." }, { status: 404 });
  const values = webinarInput({ ...existing, ...updates });
  if (!values) return NextResponse.json({ error: "قیمت، بازه یا لینک دسترسی نامعتبر است." }, { status: 400 });

  const { data, error } = await admin
    .from("webinars")
    .update(values)
    .eq("id", id)
    .select()
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ webinar: data });
}

// ── DELETE: حذف وبینار ────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth)
    return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await req.json();
  if (!id) {
    return NextResponse.json({ error: "id الزامی است." }, { status: 400 });
  }

  const admin = auth.supabase;
  const { error } = await admin.from("webinars").delete().eq("id", id);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
