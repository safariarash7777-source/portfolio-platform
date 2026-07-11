import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSingleUseInvite, sendMessage } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Helpers ──────────────────────────────────────────────────────────────────
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
  return { user };
}

// ── GET: لیست وبینارها (ادمین) ────────────────────────────────────────────────
export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth)
    return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = createAdminClient();
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

  const body = await req.json();
  const {
    title,
    description,
    starts_at,
    ends_at,
    registration_open,
    max_capacity,
    price_toman,
    platform,
    platform_url,
    status,
  } = body;

  if (!title || !starts_at) {
    return NextResponse.json(
      { error: "title و starts_at الزامی هستند." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("webinars")
    .insert({
      title,
      description: description || null,
      starts_at,
      ends_at: ends_at || null,
      registration_open: registration_open ?? false,
      max_capacity: max_capacity || null,
      price_toman: price_toman ?? 0,
      platform: platform || "link",
      platform_url: platform_url || null,
      status: status || "draft",
    })
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

  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) {
    return NextResponse.json({ error: "id الزامی است." }, { status: 400 });
  }

  const admin = createAdminClient();

  // اگر action = send_invites → ارسال دعوت کانال به شرکت‌کنندگان
  if (updates.action === "send_invites") {
    return await handleSendInvites(admin, id);
  }

  const { data, error } = await admin
    .from("webinars")
    .update(updates)
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

  const admin = createAdminClient();
  const { error } = await admin.from("webinars").delete().eq("id", id);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// ── ارسال دعوت کانال به شرکت‌کنندگان ─────────────────────────────────────────
async function handleSendInvites(
  admin: ReturnType<typeof createAdminClient>,
  webinarId: string
) {
  const channelId = process.env.TELEGRAM_CHANNEL_ID;
  if (!channelId) {
    return NextResponse.json(
      { error: "TELEGRAM_CHANNEL_ID تنظیم نشده." },
      { status: 500 }
    );
  }

  // دریافت ثبت‌نام‌های پرداخت‌شده/رایگان که حضور داشتند و دعوت نگرفتند
  const { data: regs, error } = await admin
    .from("webinar_registrations")
    .select("id, user_id")
    .eq("webinar_id", webinarId)
    .eq("attended", true)
    .eq("invite_sent", false)
    .in("payment_status", ["paid", "free"]);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  if (!regs || regs.length === 0) {
    return NextResponse.json({
      ok: true,
      message: "هیچ شرکت‌کننده واجد شرایطی یافت نشد.",
      sent: 0,
    });
  }

  let sent = 0;
  for (const reg of regs) {
    // یافتن telegram_user_id از telegram_links
    const { data: link } = await admin
      .from("telegram_links")
      .select("telegram_user_id")
      .eq("user_id", reg.user_id)
      .maybeSingle();

    if (!link?.telegram_user_id) continue;

    // ساخت لینک دعوت تک‌نفره
    const inviteLink = await createSingleUseInvite();
    if (!inviteLink) continue;

    // ارسال پیام به کاربر
    await sendMessage(
      link.telegram_user_id,
      `🎉 تبریک! شما در وبینار شرکت کردید.\n\nلینک دعوت اختصاصی کانال خصوصی:\n${inviteLink}\n\n⚠️ این لینک تک‌بار مصرف است و فقط برای شما معتبر است.`
    );

    // آپدیت رکورد
    await admin
      .from("webinar_registrations")
      .update({ invite_sent: true, invite_link: inviteLink })
      .eq("id", reg.id);

    sent++;
  }

  // علامت‌گذاری وبینار
  await admin
    .from("webinars")
    .update({ invites_sent: true })
    .eq("id", webinarId);

  return NextResponse.json({ ok: true, sent });
}
