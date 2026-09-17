/**
 * ذخیره‌گاهِ پایدارِ هشدار روی Supabase — پیاده‌سازیِ واقعیِ `AlertStorePort`.
 *
 * ⚠️ چرا `service_role`: جدول‌های phase33 عمداً هیچ سیاستِ INSERT برای
 * `authenticated` ندارند و حقِ نوشتنشان پس گرفته شده. اگر عضو می‌توانست
 * مستقیم بنویسد، می‌توانست رویدادِ هشدار برای کاربرِ دیگری جعل کند. نوشتن فقط
 * از سرور و با نقشِ سرویس انجام می‌شود؛ `user_id` هم از نشستِ سرور می‌آید نه
 * از بدنهٔ درخواست.
 *
 * ⚠️ کلاینت **تزریق** می‌شود و اینجا ساخته نمی‌شود. گاردِ
 * `lib/supabase/service-role.test.ts` همین را گرفت: اگر `createAdminClient()`
 * را خودِ این ماژول صدا بزند، نبودِ سکرت به‌صورت استثنا از دلِ کتابخانه بیرون
 * می‌زند و فراخوان را با ۵۰۰ خالی می‌خواباند. تصمیم دربارهٔ «سکرت هست یا نه»
 * کارِ لایهٔ route است که می‌تواند پاسخِ صادق بدهد.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AlertState } from "./alerts";
import type { AlertStorePort, ClaimInput, ClaimResult } from "./alertDispatch";

export class SupabaseAlertStore implements AlertStorePort {
  constructor(private readonly db: SupabaseClient) {}

  /**
   * وضعیت = آخرین رویدادی که **ارسالِ موفق** دارد.
   *
   * ⚠️ عمداً «آخرین رویداد» نیست. رویدادی که تصمیمش گرفته شد ولی ارسالش شکست
   * خورد، نباید فاصلهٔ خاموشی بسازد — وگرنه یک شکستِ شبکه، هشدارِ بعدی را هم
   * می‌بلعد.
   */
  async loadState(userId: string): Promise<AlertState> {
    const res = await this.db
      .from("rebalance_alert_events")
      .select("alert_key, rebalance_alert_deliveries!inner(status, sent_at)")
      .eq("user_id", userId)
      .eq("rebalance_alert_deliveries.status", "sent")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (res.error || !res.data) return { lastKey: null, lastSentAt: null };

    const deliveries = (res.data as { rebalance_alert_deliveries?: { sent_at: string | null }[] })
      .rebalance_alert_deliveries ?? [];
    const sentAt = deliveries
      .map((d) => d.sent_at)
      .filter((v): v is string => Boolean(v))
      .sort()
      .pop() ?? null;

    return { lastKey: (res.data as { alert_key: string }).alert_key, lastSentAt: sentAt };
  }

  /**
   * ادعای رویداد با قفلِ دیتابیس.
   *
   * `ON CONFLICT DO NOTHING` یعنی در برخوردِ هم‌زمان فقط یکی ردیف می‌گیرد.
   * بازندهٔ مسابقه ردیفِ موجود را می‌خواند تا بفهمد باید سکوت کند (ارسالِ موفق
   * دارد) یا تلاشِ ارسال را تکرار کند (ندارد).
   */
  async claimEvent(input: ClaimInput): Promise<ClaimResult> {
    const inserted = await this.db
      .from("rebalance_alert_events")
      .insert({
        user_id: input.userId,
        alert_key: input.alertKey,
        holding_version_id: input.holdingVersionId,
        target_version_id: input.targetVersionId,
        breached_classes: input.breachedClasses,
        max_deviation_points: input.maxDeviationPoints,
      })
      .select("id")
      .maybeSingle();

    if (!inserted.error && inserted.data) {
      return {
        claimed: true,
        eventId: (inserted.data as { id: string }).id,
        alreadyDelivered: false,
        attemptsRecorded: 0,
      };
    }

    const existing = await this.db
      .from("rebalance_alert_events")
      .select("id, rebalance_alert_deliveries(status)")
      .eq("user_id", input.userId)
      .eq("alert_key", input.alertKey)
      .maybeSingle();

    if (existing.error || !existing.data) {
      return { claimed: false, eventId: null, alreadyDelivered: false, attemptsRecorded: 0 };
    }
    const row = existing.data as { id: string; rebalance_alert_deliveries?: { status: string }[] };
    const deliveries = row.rebalance_alert_deliveries ?? [];
    return {
      claimed: false,
      eventId: row.id,
      alreadyDelivered: deliveries.some((d) => d.status === "sent"),
      attemptsRecorded: deliveries.length,
    };
  }

  async recordDelivery(input: {
    eventId: string;
    channel: string;
    status: string;
    attempt: number;
    error: string | null;
    sentAt: string | null;
  }): Promise<void> {
    const res = await this.db.from("rebalance_alert_deliveries").insert({
      event_id: input.eventId,
      channel: input.channel,
      status: input.status,
      attempt: input.attempt,
      error: input.error,
      sent_at: input.sentAt,
    });
    // ثبت‌نشدنِ دفتر نباید ارسالِ انجام‌شده را پنهان کند، ولی باید دیده شود.
    if (res.error) console.error("rebalance alert delivery log failed:", res.error.message);
  }
}
