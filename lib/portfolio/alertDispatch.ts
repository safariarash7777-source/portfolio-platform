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

export type DeliveryStatus = "pending" | "sent" | "failed" | "unknown";
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

export interface OpenAttempt {
  channel: AlertChannel;
  attempt: number;
  /** زمانِ نوشتنِ ردیفِ `pending` — مبنای تشخیصِ رهاشدگی. */
  startedAt: string;
}

export interface ClaimResult {
  /** آیا **همین اجرا** رویداد را ساخت. */
  claimed: boolean;
  eventId: string | null;
  /**
   * آیا این رویداد از قبل ارسالِ موفق دارد.
   *
   * ⚠️ رویدادی که ادعا شده ولی ارسالش شکست خورده باید **دوباره تلاش شود**، نه
   * اینکه برای همیشه خاموش بماند. اگر فقط «تکراری است یا نه» را می‌دانستیم،
   * یک شکستِ شبکه هشدار را تا ابد می‌بلعید.
   */
  alreadyDelivered: boolean;
  /**
   * تلاشی که ردیفِ `pending` دارد و هنوز ردیفِ پایانی نگرفته.
   *
   * ⚠️ این همان چیزی است که «رقیبِ در حالِ اجرا» را از «پردازشی که وسطِ کار
   * مُرد» جدا می‌کند — و تشخیصش **زمان‌محور** است، نه حدسی. نسخهٔ قبل فقط
   * تعدادِ تلاش‌های ثبت‌شده را می‌دید و اگر پردازش بینِ ارسالِ موفق و ثبتِ آن
   * می‌مرد، رویداد با صفر تلاش می‌ماند و برای همیشه `in_flight` می‌گرفت؛
   * یعنی هشدار **گم می‌شد**، نه اینکه تکرار نشود.
   */
  openAttempt: OpenAttempt | null;
  /** تلاش‌هایی که نتیجهٔ نهایی گرفته‌اند (`sent`/`failed`/`unknown`). */
  finishedAttempts: number;
}

export interface DeliveryRow {
  channel: string;
  status: string;
  attempt: number;
  created_at: string;
}

/**
 * تلاش‌ها را به وضعیتِ قابلِ تصمیم‌گیری خلاصه می‌کند.
 *
 * «تلاشِ باز» یعنی ردیفِ `pending` که هیچ ردیفِ پایانی با همان شمارهٔ تلاش
 * ندارد. همین تعریف است که پردازشِ مُرده را قابلِ تشخیص می‌کند.
 *
 * صادر می‌شود تا مستقیم آزموده شود؛ منطقش ظریف‌تر از آن است که فقط از راهِ
 * شبکه سنجیده شود.
 */
export function summariseDeliveries(rows: readonly DeliveryRow[]): {
  alreadyDelivered: boolean;
  openAttempt: { channel: AlertChannel; attempt: number; startedAt: string } | null;
  finishedAttempts: number;
} {
  const terminal = new Set(
    rows.filter((r) => r.status !== "pending").map((r) => `${r.channel}#${r.attempt}`)
  );
  const open = rows
    .filter((r) => r.status === "pending" && !terminal.has(`${r.channel}#${r.attempt}`))
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))[0];

  return {
    alreadyDelivered: rows.some((r) => r.status === "sent"),
    openAttempt: open
      ? { channel: open.channel as AlertChannel, attempt: open.attempt, startedAt: open.created_at }
      : null,
    finishedAttempts: terminal.size,
  };
}

export interface AlertStorePort {
  /** وضعیتِ پایدار: آخرین هشداری که **واقعاً فرستاده شد**. */
  loadState(userId: string): Promise<AlertState>;
  claimEvent(input: ClaimInput): Promise<ClaimResult>;
  /**
   * ردیفِ `pending` را **پیش از** تماس با کانال می‌نویسد.
   *
   * اگر این ردیف نوشته نشود و پردازش بمیرد، هیچ ردی نمی‌ماند که بگوید تماسی
   * آغاز شده بود. ترتیب عمداً «اول ثبت، بعد ارسال» است، حتی به قیمتِ اینکه
   * گاهی یک تلاشِ ثبت‌شده هرگز به کانال نرسد — آن حالت قابلِ تشخیص و
   * بازیابی است، ولی حالتِ عکسش نیست.
   */
  beginAttempt(input: { eventId: string; channel: AlertChannel; attempt: number }): Promise<void>;
  finishAttempt(input: {
    eventId: string;
    channel: AlertChannel;
    attempt: number;
    status: Exclude<DeliveryStatus, "pending">;
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
  | "exhausted"
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
    status: Exclude<DeliveryStatus, "pending">;
    error: string | null;
  }[];
}

export interface DispatchOptions extends AlertOptions {
  /** حداکثر تلاش در **یک اجرا** برای هر کانال. */
  maxAttempts: number;
  /**
   * سقفِ تلاش‌ها روی همهٔ اجراها. بعد از آن رویداد `exhausted` می‌شود و دیگر
   * تلاش نمی‌شود.
   *
   * ⚠️ بدونِ این سقف، رویدادی که کانالش دائماً می‌افتد هر اجرا دوباره تلاش
   * می‌شود و دفترِ append-only بی‌انتها رشد می‌کند. با سقف، همان رویداد یک
   * وضعیتِ پایانیِ **قابلِ دیدن** پیدا می‌کند.
   */
  maxTotalAttempts: number;
  /**
   * تلاشِ `pending` بعد از چند دقیقه «رهاشده» حساب می‌شود.
   *
   * ⚠️ این عدد تنها چیزی است که «رقیبِ در حالِ اجرا» را از «پردازشی که مُرد»
   * جدا می‌کند. کوچک‌بودنش یعنی دو پردازشِ کُند هم‌زمان می‌فرستند؛ بزرگ‌بودنش
   * یعنی بازیابیِ دیرهنگام. پیش‌فرض محافظه‌کارانه است.
   */
  attemptLeaseMinutes: number;
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
  const eventId = claim.eventId;

  // رویدادی که قبلاً ارسالِ موفق دارد، دوباره فرستاده نمی‌شود — محافظ در
  // برابرِ «پاسخ گم شد و کاربر دوباره زد».
  if (claim.alreadyDelivered) return none("already_delivered", eventId);

  const attempts: DispatchOutcome["attempts"] = [];

  /**
   * تلاشِ باز: یا رقیبی همین الان در حالِ ارسال است، یا پردازشی وسطِ کار مُرد.
   * تفکیک فقط با زمان ممکن است.
   */
  if (claim.openAttempt) {
    const ageMinutes =
      (options.now.getTime() - new Date(claim.openAttempt.startedAt).getTime()) / 60_000;

    if (!(ageMinutes >= options.attemptLeaseMinutes)) {
      // تازه است ⇒ دستِ رقیب. دست نمی‌زنیم.
      return none("in_flight", eventId);
    }

    // رها شده. ⚠️ اینجا نه `sent` می‌نویسیم نه `failed`: **نمی‌دانیم** آن تماس
    // به کجا رسید. جعلِ هرکدام یعنی یا هشدارِ گم‌شده یا پیامِ تکراریِ بی‌سبب.
    await deps.store.finishAttempt({
      eventId,
      channel: claim.openAttempt.channel,
      attempt: claim.openAttempt.attempt,
      status: "unknown",
      error:
        `تلاش پس از ${Math.floor(ageMinutes)} دقیقه بدون نتیجه رها شده بود؛ ` +
        "معلوم نیست پیام به کانال رسید یا نه.",
      sentAt: null,
    });
    attempts.push({
      channel: claim.openAttempt.channel,
      attempt: claim.openAttempt.attempt,
      status: "unknown",
      error: "تلاش رهاشده",
    });
  }

  const finishedBefore = claim.finishedAttempts + (claim.openAttempt ? 1 : 0);
  if (finishedBefore >= options.maxTotalAttempts) {
    return { sent: false, reason: "exhausted", eventId, attempts };
  }
  if (sinks.length === 0) return { sent: false, reason: "no_sink", eventId, attempts };

  const message: AlertMessage = {
    userId: input.userId,
    title: "نیاز به بررسی بازتوازن سبد",
    body: decision.message ?? "ترکیب سبد شما از سبد هدف فاصله گرفته است.",
  };

  let anySent = false;
  let attemptNo = finishedBefore;

  for (const sink of sinks) {
    for (let i = 0; i < Math.max(1, options.maxAttempts); i++) {
      if (attemptNo >= options.maxTotalAttempts) break;
      attemptNo += 1;

      // ⚠️ اول ثبت، بعد ارسال. اگر پردازش بینِ این دو بمیرد، یک ردیفِ `pending`
      // می‌ماند که اجرای بعدی می‌تواند ببیند و تصمیم بگیرد. ترتیبِ عکس یعنی
      // مرگِ بی‌رد، و رویدادی که هیچ‌کس دیگر سراغش نمی‌رود.
      //
      // ⚠️ و این نوشتن **خودش قفل است**: قیدِ `rad_attempt_once` اجازه نمی‌دهد
      // دو پردازش همان شمارهٔ تلاش را آغاز کنند. پس شکستِ اینجا یعنی رقیبی
      // زودتر مالکِ همین تلاش شده و ما باید عقب بکشیم — نه اینکه بفرستیم.
      // تکیه به «اول بخوان بعد بنویس» این تضمین را نمی‌داد.
      try {
        await deps.store.beginAttempt({ eventId, channel: sink.channel, attempt: attemptNo });
      } catch {
        return { sent: anySent, reason: anySent ? "sent" : "in_flight", eventId, attempts };
      }

      let ok = false;
      let error: string | null = null;
      try {
        const res = await sink.deliver(message);
        ok = res.ok;
        error = ok ? null : (res.error?.trim() || "کانال بدون توضیح شکست خورد.");
      } catch (e) {
        ok = false;
        error = (e as Error).message || "استثنا در ارسال.";
      }

      const status = ok ? "sent" : "failed";
      await deps.store.finishAttempt({
        eventId,
        channel: sink.channel,
        attempt: attemptNo,
        status,
        error,
        sentAt: ok ? new Date(options.now).toISOString() : null,
      });
      attempts.push({ channel: sink.channel, attempt: attemptNo, status, error });

      if (ok) {
        anySent = true;
        break;
      }
    }
  }

  return {
    sent: anySent,
    reason: anySent ? "sent" : "delivery_failed",
    eventId,
    attempts,
  };
}
