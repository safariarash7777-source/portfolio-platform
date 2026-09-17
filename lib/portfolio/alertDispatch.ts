/**
 * مسیرِ اجراییِ هشدارِ بازتوازن: از تصمیم تا ثبت تا رسیدن به گیرنده.
 *
 * ── چرا جدا از `alerts.ts` ──────────────────────────────────────────────────
 * `decideDeviationAlert` **تصمیم** می‌گیرد و خالص است. اینجا همان تصمیم به
 * دنیای واقعی وصل می‌شود: ذخیرهٔ پایدار، ادعای یکتا، ارسال، و ثبتِ نتیجهٔ هر
 * تلاش. موتورِ دومی ساخته نمی‌شود؛ همان تابع صدا زده می‌شود.
 *
 * ── چرا پورت، نه import مستقیم ──────────────────────────────────────────────
 * چیزهایی که باید اثبات شوند — اجرای هم‌زمان، پاسخِ گم‌شده، شکستِ ارسال،
 * تلاشِ دوباره، ری‌استارتِ پردازش — هیچ‌کدام با صدازدنِ مستقیمِ Supabase و
 * Resend آزمودنی نیستند. پس ذخیره‌گاه و گیرنده **پورت**‌اند و تست بدلِ آن‌ها
 * را می‌دهد. پیاده‌سازیِ واقعی در `alertStore.ts` و `alertSinks.ts` است.
 *
 * ── قاعدهٔ سختِ «شکست، موفقیت نیست» ─────────────────────────────────────────
 * هیچ مسیری در این فایل `sent = true` برنمی‌گرداند مگر یک کانال واقعاً `ok`
 * داده باشد. استثنا هم برای «احتمالاً رفت» وجود ندارد.
 */
import { decideDeviationAlert, type AlertOptions, type AlertState } from "./alerts";
import type { RebalanceResult } from "./contracts";

export type DeliveryStatus = "sent" | "failed" | "skipped";
export type AlertChannel = "log" | "email" | "telegram";

export interface AlertMessage {
  userId: string;
  title: string;
  body: string;
}

export interface AlertSinkPort {
  readonly channel: AlertChannel;
  deliver(message: AlertMessage): Promise<{ ok: boolean; error?: string }>;
}

export interface ClaimInput {
  userId: string;
  alertKey: string;
  holdingVersionId: string;
  targetVersionId: string;
  breachedClasses: readonly string[];
  maxDeviationPoints: number;
}

export interface ClaimResult {
  /** آیا **همین اجرا** رویداد را ساخت. */
  claimed: boolean;
  eventId: string | null;
  /**
   * آیا این رویداد از قبل ارسالِ موفق دارد.
   *
   * ⚠️ تفکیکِ این دو حالت مهم است: رویدادی که ادعا شده ولی ارسالش شکست خورده
   * باید **دوباره تلاش شود**، نه اینکه برای همیشه خاموش بماند. اگر فقط
   * «تکراری است یا نه» را می‌دانستیم، یک شکستِ شبکه هشدار را تا ابد می‌بلعید.
   */
  alreadyDelivered: boolean;
  /**
   * چند تلاشِ ارسال تا الان برای این رویداد **ثبت شده**.
   *
   * ⚠️ این عدد تفاوتِ «رقیبِ همین لحظه» و «تلاشِ شکست‌خوردهٔ قبلی» را می‌سازد و
   * بدونش یک حفرهٔ هم‌زمانی باز می‌ماند: اگر فقط می‌پرسیدیم «ارسالِ موفق دارد
   * یا نه»، دو اجرای هم‌زمان هر دو «نه» می‌دیدند و هر دو می‌فرستادند — یعنی
   * همان قابلیتِ تلاشِ دوباره، ضدتکرار را خنثی می‌کرد. اجرایی که هنوز چیزی
   * ثبت نکرده در حالِ اجراست؛ پس صفر یعنی «رقیب در راه است».
   */
  attemptsRecorded: number;
}

export interface AlertStorePort {
  /** وضعیتِ پایدار: آخرین هشداری که **واقعاً فرستاده شد**. */
  loadState(userId: string): Promise<AlertState>;
  claimEvent(input: ClaimInput): Promise<ClaimResult>;
  recordDelivery(input: {
    eventId: string;
    channel: AlertChannel;
    status: DeliveryStatus;
    attempt: number;
    error: string | null;
    sentAt: string | null;
  }): Promise<void>;
}

export type DispatchReason =
  | "not_definitive"
  | "below_threshold"
  | "duplicate"
  | "cooling_down"
  | "already_delivered"
  | "in_flight"
  | "no_sink"
  | "delivery_failed"
  | "sent";

export interface DispatchOutcome {
  sent: boolean;
  reason: DispatchReason;
  eventId: string | null;
  attempts: {
    channel: AlertChannel;
    attempt: number;
    status: DeliveryStatus;
    error: string | null;
  }[];
}

export interface DispatchOptions extends AlertOptions {
  /** حداکثر تلاش برای هر کانال. هر تلاش جداگانه ثبت می‌شود. */
  maxAttempts: number;
}

export async function dispatchRebalanceAlert(
  input: { userId: string; result: RebalanceResult },
  deps: { store: AlertStorePort; sinks: readonly AlertSinkPort[]; options: DispatchOptions }
): Promise<DispatchOutcome> {
  const { store, sinks, options } = deps;
  const none = (reason: DispatchReason, eventId: string | null = null): DispatchOutcome => ({
    sent: false,
    reason,
    eventId,
    attempts: [],
  });

  // ۱) وضعیت از دیتابیس خوانده می‌شود، نه از حافظهٔ پردازش. ری‌استارت چیزی را
  //    فراموش نمی‌کند.
  const state = await store.loadState(input.userId);
  const decision = decideDeviationAlert(input.result, state, options);
  if (!decision.send || decision.key === null) {
    return none(decision.reason === "send" ? "delivery_failed" : decision.reason);
  }

  const breached = input.result.rows
    .filter(
      (r) =>
        r.deltaPercentagePoints !== null &&
        Math.abs(r.deltaPercentagePoints) >= options.thresholdPoints
    );
  const maxDeviation = breached.reduce(
    (m, r) => Math.max(m, Math.abs(r.deltaPercentagePoints as number)),
    0
  );

  // ۲) ادعای یکتا. قفل در دیتابیس است (`UNIQUE (user_id, alert_key)`)، نه در
  //    یک `if` — وگرنه دو درخواستِ هم‌زمان هر دو «هنوز نفرستاده‌ایم» می‌بینند.
  const claim = await store.claimEvent({
    userId: input.userId,
    alertKey: decision.key,
    holdingVersionId: input.result.identity.holdingVersionId,
    targetVersionId: input.result.identity.targetVersionId,
    breachedClasses: breached.map((r) => r.assetClass),
    maxDeviationPoints: maxDeviation,
  });

  if (claim.eventId === null) return none("duplicate");
  // رویدادی که قبلاً ارسالِ موفق دارد، دوباره فرستاده نمی‌شود — این همان
  // محافظ در برابرِ «پاسخ گم شد و کاربر دوباره زد» است.
  if (claim.alreadyDelivered) return none("already_delivered", claim.eventId);
  // رویدادی که رقیبی همین الان ادعایش کرده و هنوز چیزی ثبت نکرده، دستِ اوست.
  // تلاشِ دوباره فقط وقتی مجاز است که شکستِ قبلی **ثبت شده** باشد.
  if (!claim.claimed && claim.attemptsRecorded === 0) return none("in_flight", claim.eventId);
  if (sinks.length === 0) return none("no_sink", claim.eventId);

  const message: AlertMessage = {
    userId: input.userId,
    title: "نیاز به بررسی بازتوازن سبد",
    body: decision.message ?? "ترکیب سبد شما از سبد هدف فاصله گرفته است.",
  };

  const attempts: DispatchOutcome["attempts"] = [];
  let anySent = false;

  for (const sink of sinks) {
    for (let attempt = 1; attempt <= Math.max(1, options.maxAttempts); attempt++) {
      let ok = false;
      let error: string | null = null;
      try {
        const res = await sink.deliver(message);
        ok = res.ok;
        // ⚠️ `ok=false` بدونِ دلیل هم یک شکست است؛ قیدِ دیتابیس دلیل می‌خواهد،
        // پس همین‌جا یک دلیلِ صادق ساخته می‌شود نه یک رشتهٔ خالی.
        error = ok ? null : (res.error?.trim() || "کانال بدون توضیح شکست خورد.");
      } catch (e) {
        ok = false;
        error = (e as Error).message || "استثنا در ارسال.";
      }

      const status: DeliveryStatus = ok ? "sent" : "failed";
      const sentAt = ok ? new Date(options.now).toISOString() : null;
      await store.recordDelivery({
        eventId: claim.eventId,
        channel: sink.channel,
        status,
        attempt,
        error,
        sentAt,
      });
      attempts.push({ channel: sink.channel, attempt, status, error });

      if (ok) {
        anySent = true;
        break; // تلاشِ بعدیِ همین کانال لازم نیست
      }
    }
  }

  return {
    sent: anySent,
    reason: anySent ? "sent" : "delivery_failed",
    eventId: claim.eventId,
    attempts,
  };
}
