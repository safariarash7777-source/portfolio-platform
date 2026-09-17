/**
 * دامنهٔ واقعیِ «لغو انتشار» — در یک جا، تا UI و API یک چیز بگویند.
 *
 * این متن‌ها تزئین نیستند. اگر کاربر فکر کند ایمیلِ رفته پس گرفته شده، ما یک
 * ادعای نادرست به او فروخته‌ایم. `announcement_deliveries` روی Production
 * ستونی برای شناسهٔ پیامِ تلگرام یا ایمیل **ندارد** (ستون‌ها: id,
 * announcement_id, user_id, channel, status, sent_at, created_at)، پس حتی
 * اگر بخواهیم هم چیزی برای حذف‌کردن در دست نیست.
 */
export interface RevocationScope {
  /** کانال‌هایی که لغو واقعاً رویشان اثر دارد. */
  removed: string[];
  /** کانال‌هایی که پیام در آن‌ها باقی می‌ماند. */
  kept: string[];
  note: string;
}

export function describeRevocationScope(): RevocationScope {
  return {
    removed: ["داشبورد عضو", "دستور /announcements بات"],
    kept: ["ایمیلِ ارسال‌شده", "پیامِ تلگرامِ ارسال‌شده"],
    note:
      "لغو انتشار اعلامیه را از داشبورد و بات برمی‌دارد. ایمیل و پیام تلگرامی که " +
      "قبلاً ارسال شده‌اند پس گرفته نمی‌شوند؛ سابقهٔ اعلامیه و تحویل‌ها هم برای مدیر باقی می‌ماند.",
  };
}

/** متنِ تأییدِ حذف — نامِ اعلامیه را می‌آورد تا کاربر اشتباهی دیگری را لغو نکند. */
export function revocationConfirmText(title: string): string {
  const scope = describeRevocationScope();
  return (
    `«${title}» از ${scope.removed.join(" و ")} برداشته می‌شود.\n\n` +
    `${scope.kept.join(" و ")} پس گرفته نمی‌شوند.\n\n` +
    `سابقه برای مدیر باقی می‌ماند. ادامه می‌دهید؟`
  );
}
