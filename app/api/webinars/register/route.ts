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

  // با کلاینتِ **کاربر** صدا زده می‌شود، نه service-role. تابع SECURITY DEFINER
  // است و ثبت‌نام را به `auth.uid()` می‌بندد؛ با کلاینتِ service-role این مقدار
  // NULL می‌شد و تابع «دسترسی غیرمجاز» می‌داد — یعنی هر ثبت‌نام شکست می‌خورد.
  const { data, error } = await supabase.rpc("register_for_webinar", {
    p_webinar_id: webinar_id,
  });

  if (error) {
    // خطاهای کاربرپسند از RPC
    const msg = error.message || "خطا در ثبت‌نام.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // RPC مقدارِ `registration_id` برمی‌گرداند؛ مصرف‌کننده (مسیرِ پرداخت) با
  // `registration.id` کار می‌کند، پس همین‌جا نرمال می‌شود.
  const raw = (data ?? {}) as { registration_id?: string; already_registered?: boolean };
  return NextResponse.json({
    registration: {
      id: raw.registration_id ?? null,
      already_registered: raw.already_registered ?? false,
    },
  });
}
