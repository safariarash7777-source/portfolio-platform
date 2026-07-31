import type { HealthSignal, HealthState } from "@/lib/health/status";
import { ageMinutes } from "@/lib/health/status";
import type { CronRunStatus } from "@/lib/cron/ledger";

/**
 * تبدیلِ آخرین ردیفِ دفتر به یک شاخصِ سلامت — `P2-G2-012`.
 *
 * چهار حالتِ متفاوت که مدام با هم اشتباه می‌شوند و همین اشتباه بود که شاخصِ
 * قبلی را بی‌فایده می‌کرد:
 *
 *   ۱. **هرگز اجرا نشده** — دفتر خالی است. این `unknown` است، نه `failed`:
 *      شاید cron تازه اضافه شده. ولی `ok` هم نیست.
 *   ۲. **آخرین اجرا موفق و تازه** → `ok`.
 *   ۳. **آخرین اجرا موفق ولی قدیمی** → `stale`. jobی که دیروز موفق بود ولی
 *      امروز اجرا نشده، «سالم» نیست.
 *   ۴. **آخرین اجرا شکست خورده** → `failed`، حتی اگر همین یک دقیقه پیش باشد.
 *      تازگی، شکست را جبران نمی‌کند.
 *
 * حالتِ پنجم هم هست: اجرایی که `running` مانده و تمام نشده — نشانهٔ کرش یا
 * اجرای موازی. آن هم پنهان نمی‌شود.
 */

export interface LastRun {
  status: CronRunStatus;
  startedAt: string;
  finishedAt: string | null;
  processedCount: number | null;
  errorCode: string | null;
  durationMs: number | null;
}

export interface CronJobHealthInput {
  jobKey: string;
  label: string;
  /** `null` یعنی دفتر برای این job خالی است. */
  lastRun: LastRun | null;
  /** تا این سن، اجرای موفق «تازه» است. */
  okWithinMinutes: number;
  /** بیش از این، حتی موفقِ قدیمی هم دیگر قابل اتکا نیست. */
  staleWithinMinutes: number;
  /** اجرای `running` که از این بیشتر طول کشیده، گیر کرده حساب می‌شود. */
  stuckAfterMinutes: number;
  staleRunningCount?: number;
}

export function classifyCronRun(input: CronJobHealthInput, now: Date): HealthSignal {
  const { jobKey, label, lastRun } = input;
  const key = `cron:${jobKey}`;

  if (!lastRun) {
    return {
      key,
      label,
      state: "unknown",
      detail:
        "هیچ اجرایی ثبت نشده — یا این job هنوز یک‌بار هم اجرا نشده، یا دفتر تازه فعال شده. «نامعلوم» است، نه «سالم»",
    };
  }

  const reference = lastRun.finishedAt ?? lastRun.startedAt;
  const age = ageMinutes(reference, now);

  // اجرای گیرکرده — نه موفق، نه رسماً شکست‌خورده، ولی حتماً غیرعادی.
  if (lastRun.status === "running") {
    const stuck = age !== null && age > input.stuckAfterMinutes;
    return {
      key,
      label,
      state: stuck ? "failed" : "unknown",
      detail: stuck
        ? `اجرا ${age} دقیقه است در حالتِ running مانده — احتمالاً کرش کرده یا هم‌زمان اجرا شده`
        : "اجرایی در همین لحظه در جریان است",
      lastAt: reference,
      ageMinutes: age,
    };
  }

  if (lastRun.status === "failed") {
    // تازگی شکست را جبران نمی‌کند.
    return {
      key,
      label,
      state: "failed",
      detail: `آخرین اجرا ${age ?? "?"} دقیقه پیش **ناموفق** بود (${lastRun.errorCode ?? "بدونِ کد"})`,
      lastAt: reference,
      ageMinutes: age,
    };
  }

  const state: HealthState =
    age === null ? "unknown" : age <= input.okWithinMinutes ? "ok" : age <= input.staleWithinMinutes ? "stale" : "failed";

  const processed =
    lastRun.processedCount === null ? "" : ` · ${lastRun.processedCount.toLocaleString("fa-IR")} مورد`;

  const extra = (input.staleRunningCount ?? 0) > 0 ? " ⚠️ اجرای ناتمامِ قبلی هم وجود دارد" : "";

  return {
    key,
    label,
    state,
    detail: `آخرین اجرای موفق ${age} دقیقه پیش${processed}${extra}`,
    lastAt: reference,
    ageMinutes: age,
  };
}
