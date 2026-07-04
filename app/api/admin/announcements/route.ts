import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendAnnouncementEmail } from "@/lib/resend";
import { sendMessage } from "@/lib/telegram";
import { markdownToPlain } from "@/lib/markdown";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/announcements — انتشار اعلامیه + صف‌کردن و ارسالِ تحویل‌ها.
// batch و مقاوم به خطا: شکستِ یک گیرنده بقیه را متوقف نمی‌کند و status هر
// تحویل ثبت می‌شود.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "دسترسی غیرمجاز." }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "دسترسی غیرمجاز." }, { status: 403 });
  }

  let body: { title?: string; body_md?: string; target?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "درخواست نامعتبر." }, { status: 400 });
  }

  const title = (body.title ?? "").trim();
  const bodyMd = (body.body_md ?? "").trim();
  const target = (body.target ?? "").trim();
  if (!title || !bodyMd || !target) {
    return NextResponse.json({ error: "عنوان، متن و هدف الزامی است." }, { status: 400 });
  }

  // انتشار (تابع SECURITY DEFINER، خودش admin را چک می‌کند) + audit.
  const { data: annId, error: pubErr } = await supabase.rpc("publish_announcement", {
    p_title: title,
    p_body_md: bodyMd,
    p_target: target,
  });
  if (pubErr || !annId) {
    console.error("publish_announcement error:", pubErr?.message);
    return NextResponse.json({ error: pubErr?.message ?? "خطا در انتشار." }, { status: 500 });
  }

  // از اینجا با service_role: حلِ گیرنده‌ها + ارسال + ثبتِ تحویل‌ها.
  const admin = createAdminClient();
  const recipients = await resolveRecipients(admin, target);

  const tgMap = await telegramMap(admin, recipients.map((r) => r.id));
  const plain = markdownToPlain(bodyMd);

  type DeliveryRow = {
    announcement_id: string;
    user_id: string;
    channel: "email" | "telegram" | "in_app";
    status: string;
    sent_at: string | null;
  };
  const rows: DeliveryRow[] = [];
  const now = () => new Date().toISOString();
  let emailSent = 0;
  let tgSent = 0;

  for (const r of recipients) {
    // in_app — همیشه
    rows.push({ announcement_id: annId, user_id: r.id, channel: "in_app", status: "delivered", sent_at: now() });

    // email
    if (r.email) {
      let status: string;
      try {
        status = await sendAnnouncementEmail(r.email, title, bodyMd);
      } catch {
        status = "failed";
      }
      if (status === "sent") emailSent++;
      rows.push({ announcement_id: annId, user_id: r.id, channel: "email", status, sent_at: status === "sent" ? now() : null });
    }

    // telegram
    const tgId = tgMap.get(r.id);
    if (tgId) {
      let ok = false;
      try {
        ok = await sendMessage(tgId, `📢 <b>${escapeTg(title)}</b>\n\n${escapeTg(plain)}`);
      } catch {
        ok = false;
      }
      if (ok) tgSent++;
      rows.push({ announcement_id: annId, user_id: r.id, channel: "telegram", status: ok ? "sent" : "failed", sent_at: ok ? now() : null });
    }
  }

  if (rows.length > 0) {
    const { error: delErr } = await admin
      .from("announcement_deliveries")
      .upsert(rows, { onConflict: "announcement_id,user_id,channel" });
    if (delErr) console.error("delivery insert error:", delErr.message);
  }

  return NextResponse.json({
    id: annId,
    recipients: recipients.length,
    email_sent: emailSent,
    telegram_sent: tgSent,
  });
}

interface Recipient {
  id: string;
  email: string | null;
}

async function resolveRecipients(
  admin: ReturnType<typeof createAdminClient>,
  target: string
): Promise<Recipient[]> {
  if (target === "all") {
    const { data } = await admin.from("profiles").select("id, email");
    return (data ?? []).map((p) => ({ id: p.id, email: p.email }));
  }

  if (target.startsWith("user:")) {
    const uid = target.slice(5);
    const { data } = await admin.from("profiles").select("id, email").eq("id", uid).maybeSingle();
    return data ? [{ id: data.id, email: data.email }] : [];
  }

  if (target.startsWith("risk:")) {
    const cat = target.slice(5);
    // آخرین دستهٔ ریسکِ هر کاربر
    const { data: assessments } = await admin
      .from("risk_assessments")
      .select("user_id, risk_category, created_at")
      .order("created_at", { ascending: false });
    const latest = new Map<string, string>();
    for (const a of assessments ?? []) {
      if (!latest.has(a.user_id)) latest.set(a.user_id, a.risk_category);
    }
    const matchIds = [...latest.entries()].filter(([, c]) => c === cat).map(([id]) => id);
    if (matchIds.length === 0) return [];
    const { data } = await admin.from("profiles").select("id, email").in("id", matchIds);
    return (data ?? []).map((p) => ({ id: p.id, email: p.email }));
  }

  return [];
}

async function telegramMap(
  admin: ReturnType<typeof createAdminClient>,
  userIds: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (userIds.length === 0) return map;
  const { data } = await admin
    .from("telegram_links")
    .select("user_id, telegram_user_id")
    .in("user_id", userIds);
  for (const l of data ?? []) map.set(l.user_id, l.telegram_user_id);
  return map;
}

function escapeTg(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
