/**
 * کدام اعلامیه‌ها در بات دیده می‌شوند — تصمیمِ خالص و آزمون‌پذیر.
 *
 * ── چرا جدا از مسیرِ وبهوک ──────────────────────────────────────────────────
 * بات با service-role می‌خوانَد و **RLS را کامل دور می‌زند**، پس سیاستِ
 * `ann_target_read` اینجا هیچ کاری نمی‌کند و تنها گیت، همین تابع است. چیزی
 * که تنها گیت است باید مستقیم آزمون شود، نه از پشتِ یک وبهوکِ شبکه‌ای.
 */

export interface BotAnnouncement {
  id: string;
  title: string;
  body_md: string;
  target: string;
  published_at: string | null;
}

export type BotVisibility =
  | { kind: "ok"; announcements: readonly BotAnnouncement[] }
  /** فهرستِ لغوشده‌ها خوانده نشد — هیچ محتوایی نباید بیرون برود. */
  | { kind: "unavailable"; message: string };

export const REVOCATION_UNAVAILABLE_MESSAGE =
  "فهرست اعلامیه‌ها موقتاً در دسترس نیست. کمی بعد دوباره تلاش کنید.";

export function selectVisibleAnnouncements(input: {
  announcements: readonly BotAnnouncement[] | null;
  revokedIds: readonly string[] | null;
  /** هر خطایی در خواندنِ جدولِ لغو. */
  revocationReadFailed: boolean;
  userId: string;
  riskCategory: string | null;
  limit?: number;
}): BotVisibility {
  // ⚠️ fail-closed و این نکتهٔ اصلیِ کلِ فایل است.
  //
  // اگر خطای خواندن را «هیچ لغوی نیست» معنا کنیم، بات دقیقاً همان اعلامیه‌ای
  // را پس می‌دهد که مدیر عمداً برداشته — و چون RLS اینجا بی‌اثر است، هیچ
  // لایهٔ دیگری جلویش را نمی‌گیرد. نبودِ داده با «خالی» پر نمی‌شود.
  if (input.revocationReadFailed || input.revokedIds === null) {
    return { kind: "unavailable", message: REVOCATION_UNAVAILABLE_MESSAGE };
  }

  const revoked = new Set(input.revokedIds);
  const announcements = (input.announcements ?? [])
    .filter((a) => a.published_at !== null)
    .filter((a) => !revoked.has(a.id))
    .filter((a) => {
      if (a.target === "all") return true;
      if (a.target === `user:${input.userId}`) return true;
      if (input.riskCategory && a.target === `risk:${input.riskCategory}`) return true;
      return false;
    })
    .slice(0, input.limit ?? 3);

  return { kind: "ok", announcements };
}
