import { createClient } from "@/lib/supabase/server";
import DraftsReview from "@/components/admin/DraftsReview";
import { PENDING, buildDraftQueue, type DraftRow } from "@/lib/drafts/contracts";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "نامزدهای موتور — پنل مدیریت",
  robots: { index: false, follow: false },
};

/**
 * صفِ بازبینیِ `signal_drafts`.
 *
 * دسترسی سه لایه است و هیچ‌کدام جای دیگری را نمی‌گیرد:
 *   ۱. `middleware.ts` مسیرهای `/admin` را گیت می‌کند.
 *   ۲. `app/(protected)/admin/layout.tsx` نقش را از `profiles` می‌خوانَد.
 *   ۳. RLSِ `terminal_t0` — چون اینجا **کلاینتِ نشستِ کاربر** است و نه
 *      service-role، سیاستِ «admin select signal_drafts» واقعاً اعمال می‌شود.
 *
 * ⚠️ لایهٔ سوم یک تلهٔ ظریف دارد: اگر کسی از گیتِ دوم رد شود ولی ادمین نباشد،
 * RLS **صفر ردیف** برمی‌گرداند و نه خطا — یعنی «صفِ خالی». به همین دلیل
 * لایهٔ دوم اجازه نمی‌دهد چنین کسی اصلاً به اینجا برسد، و شمارشِ صف در
 * `buildDraftQueue` خطا را از خالی جدا نگه می‌دارد.
 */
export default async function AdminDraftsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("signal_drafts")
    .select("id, symbol, direction, status, source, reasons, created_at")
    .eq("status", PENDING)
    .order("created_at", { ascending: false })
    .limit(200);

  // خطا → `null`، نه `[]`. صفِ خوانده‌نشده هرگز «۰ مورد» نمی‌شود.
  const queue = buildDraftQueue(
    error ? null : ((data ?? []) as DraftRow[]),
    error ? `خواندنِ صف مردود شد (${error.code ?? "بدونِ کد"}) — این با «صفِ خالی» یکی نیست` : undefined
  );

  return <DraftsReview queue={queue} />;
}
