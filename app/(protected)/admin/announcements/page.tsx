import { createClient } from "@/lib/supabase/server";
import AnnouncementsManager from "@/components/admin/AnnouncementsManager";

export const metadata = {
  title: "اعلامیه‌ها",
};

export default async function AdminAnnouncementsPage() {
  const supabase = await createClient();

  const [profilesRes, annRes, delivRes, revokeRes] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email").order("created_at", { ascending: false }),
    supabase
      .from("announcements")
      .select("id, title, body_md, target, published_at, created_at")
      .order("published_at", { ascending: false, nullsFirst: false }),
    supabase.from("announcement_deliveries").select("announcement_id, channel, status"),
    // ⚠️ این جدول با migrationِ phase31 می‌آید و پشتِ دروازهٔ بکاپ است. تا وقتی
    // اجرا نشده، این پرس‌وجو خطا می‌دهد — که **نباید** کلِ صفحه را بیندازد. پس
    // خطا را می‌گیریم و به‌جای دکمهٔ لغوی که کار نمی‌کند، صریح می‌گوییم قابلیت
    // روی این محیط فعال نیست. دکمه‌ای که بزنی و ۵۰۰ بدهد، بدتر از نبودنش است.
    supabase.from("announcement_revocations").select("announcement_id, revoked_at, reason"),
  ]);

  const revocationReady = !revokeRes.error;
  const revoked = new Map<string, { revoked_at: string; reason: string | null }>();
  for (const r of revokeRes.data ?? []) {
    revoked.set(r.announcement_id, { revoked_at: r.revoked_at, reason: r.reason ?? null });
  }

  // شمار تحویل به تفکیک کانال برای هر اعلامیه
  const counts = new Map<string, { email: number; telegram: number; in_app: number; seen: number }>();
  for (const d of delivRes.data ?? []) {
    const c = counts.get(d.announcement_id) ?? { email: 0, telegram: 0, in_app: 0, seen: 0 };
    if (d.channel === "email" && d.status === "sent") c.email++;
    if (d.channel === "telegram" && d.status === "sent") c.telegram++;
    if (d.channel === "in_app") c.in_app++;
    if (d.channel === "in_app" && d.status === "seen") c.seen++;
    counts.set(d.announcement_id, c);
  }

  const announcements = (annRes.data ?? []).map((a) => ({
    ...a,
    counts: counts.get(a.id) ?? { email: 0, telegram: 0, in_app: 0, seen: 0 },
    revoked_at: revoked.get(a.id)?.revoked_at ?? null,
    revoked_reason: revoked.get(a.id)?.reason ?? null,
  }));

  return (
    <AnnouncementsManager
      users={(profilesRes.data ?? []).map((p) => ({
        id: p.id,
        name: p.full_name ?? null,
        email: p.email ?? null,
      }))}
      announcements={announcements}
      revocationReady={revocationReady}
    />
  );
}
