// رادارِ تغییر — ساختِ رویداد از دادهٔ خام. محاسبهٔ خالص، بدونِ I/O.
//
// ── سه رویدادِ متفاوت، نه یک «هشدار» ────────────────────────────────────────
// `new_report` (اطلاعیهٔ تازه) · `amendment` (نسخهٔ اصلاحی) ·
// `performance_change` (تکانِ معنادارِ عدد). واکنشِ هرکدام فرق دارد، پس ادغام
// نمی‌شوند.
//
// ── ایده‌مپوتنسی ───────────────────────────────────────────────────────────
// رادار بارها روی همان داده اجرا می‌شود. `dedupKey` از **هویتِ طبیعیِ** رویداد
// ساخته می‌شود — نه از زمانِ اجرا، نه از شمارنده — پس اجرای دوباره دقیقاً همان
// کلید را می‌دهد و ایندکسِ یکتای دیتابیس ردیفِ تکراری را رد می‌کند.
// **هیچ‌جای این فایل `Date.now()` یا تصادف وجود ندارد**؛ اگر روزی اضافه شود،
// ایده‌مپوتنسی بی‌صدا می‌شکند.

export type RadarKind = "new_report" | "amendment" | "performance_change";

export interface RadarEvent {
  kind: RadarKind;
  symbol: string;
  dedupKey: string;
  /** مبنا: در برابرِ چه چیزی سنجیده شد. بدونِ آن «۳۰٪ رشد» بی‌معناست. */
  basis: Record<string, unknown>;
  /** null برای `new_report` — که با «صفر تغییر» یکی نیست. */
  changeValue: number | null;
  changeUnit: string | null;
  eventDate: string;
  sourceUrl: string | null;
  significance: string;
}

/** نرمال‌سازیِ جزءِ کلید تا فاصله و حروفِ بزرگ کلیدِ متفاوت نسازند. */
function part(x: string | number | null | undefined): string {
  return String(x ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function dedupKey(kind: RadarKind, parts: readonly (string | number | null | undefined)[]): string {
  return [kind, ...parts.map(part)].join("|");
}

/* ── اطلاعیهٔ تازه ─────────────────────────────────────────────────────────── */

export interface ReportInput {
  symbol: string;
  reportKind: string;
  periodEnd: string | null;
  publishDate: string;
  sourceUrl: string | null;
  /** نسخهٔ اصلاحی؟ کدال اصلاحیه را با همان دوره و انتشارِ متأخر می‌دهد. */
  isAmendment: boolean;
  /** کلیدِ رویدادِ قبلی که این اصلاحیه باطلش می‌کند — اگر شناخته شده باشد. */
  supersedesKey: string | null;
}

export function reportEvent(r: ReportInput): RadarEvent | null {
  if (!r.symbol?.trim() || !r.reportKind?.trim() || !r.publishDate?.trim()) return null;

  // هویتِ طبیعیِ یک اطلاعیه: نماد + نوع + دوره. **تاریخِ انتشار در کلید نیست**
  // برای اطلاعیهٔ عادی، چون همان اطلاعیه ممکن است با زمانِ متفاوت دوباره دیده
  // شود. برای اصلاحیه هست، چون اصلاحیه واقعاً رویدادِ تازه‌ای است.
  const key =
    r.isAmendment
      ? dedupKey("amendment", [r.symbol, r.reportKind, r.periodEnd, r.publishDate])
      : dedupKey("new_report", [r.symbol, r.reportKind, r.periodEnd]);

  return {
    kind: r.isAmendment ? "amendment" : "new_report",
    symbol: r.symbol.trim(),
    dedupKey: key,
    basis: {
      report_kind: r.reportKind,
      period_end: r.periodEnd,
      supersedes_key: r.isAmendment ? r.supersedesKey : null,
    },
    changeValue: null,
    changeUnit: null,
    eventDate: r.publishDate,
    sourceUrl: r.sourceUrl,
    significance: r.isAmendment
      ? "نسخهٔ اصلاحیِ یک گزارشِ منتشرشده — محاسبه‌های ساخته‌شده روی نسخهٔ قبلی باید بازبینی شوند."
      : "گزارشِ تازه برای این نماد ثبت شد و هنوز در تحلیل‌ها لحاظ نشده است.",
  };
}

/* ── تغییرِ معنادارِ عملکرد ────────────────────────────────────────────────── */

export interface PerformanceInput {
  symbol: string;
  /** چه چیزی سنجیده می‌شود: 'monthly_sales' | 'per_capita_buy' | … */
  metric: string;
  /** دورهٔ فعلی — بخشی از هویتِ رویداد */
  period: string;
  current: number | null;
  baseline: number | null;
  baselineLabel: string;
  unit: string;
  eventDate: string;
  sourceUrl: string | null;
  /** آستانهٔ درصدی؛ کمتر از آن رویداد ساخته نمی‌شود */
  thresholdPercent: number;
}

export type PerformanceSkip =
  | "missing_current"
  | "missing_baseline"
  | "zero_baseline"
  | "below_threshold";

export interface PerformanceResult {
  event: RadarEvent | null;
  skipped: PerformanceSkip | null;
}

/**
 * رویدادِ تغییرِ عملکرد.
 *
 * چهار حالتِ «رویداد نساز» از هم تفکیک می‌شوند و **علتشان برگردانده می‌شود**؛
 * یک `null`ِ خاموش یعنی بعداً نمی‌فهمیم رویداد نبود یا داده نبود.
 *
 * مبنای صفر: درصدِ تغییر نسبت به صفر تعریف نشده است (بی‌نهایت). این حالت
 * **رویدادِ خیلی بزرگ نیست، رویدادِ نامعلوم است** و باید کنار برود — وگرنه هر
 * نمادی که ماه قبل فروش نداشته، «رشدِ بی‌نهایت» می‌گیرد.
 */
export function performanceEvent(p: PerformanceInput): PerformanceResult {
  const cur = p.current;
  const base = p.baseline;
  if (typeof cur !== "number" || !isFinite(cur)) return { event: null, skipped: "missing_current" };
  if (typeof base !== "number" || !isFinite(base)) return { event: null, skipped: "missing_baseline" };
  if (base === 0) return { event: null, skipped: "zero_baseline" };

  const changePct = ((cur - base) / Math.abs(base)) * 100;
  if (Math.abs(changePct) < p.thresholdPercent) return { event: null, skipped: "below_threshold" };

  const rounded = Math.round(changePct * 10) / 10;
  return {
    event: {
      kind: "performance_change",
      symbol: p.symbol.trim(),
      // هویت: نماد + سنجه + دوره. مقدار در کلید نیست — وگرنه هر بازمحاسبهٔ
      // جزئی رویدادِ تازه می‌ساخت، که همان تکرارِ ممنوع است.
      dedupKey: dedupKey("performance_change", [p.symbol, p.metric, p.period]),
      basis: {
        metric: p.metric,
        period: p.period,
        current: cur,
        baseline: base,
        baseline_label: p.baselineLabel,
        threshold_percent: p.thresholdPercent,
        unit: p.unit,
      },
      changeValue: rounded,
      changeUnit: "percent",
      eventDate: p.eventDate,
      sourceUrl: p.sourceUrl,
      significance: `تغییرِ ${rounded}٪ نسبت به ${p.baselineLabel} — از آستانهٔ ${p.thresholdPercent}٪ عبور کرد.`,
    },
    skipped: null,
  };
}

/* ── وابسته‌هایی که یک اصلاحیه مشکوکشان می‌کند ──────────────────────────────── */

export interface ReviewFlag {
  dependentKind: string;
  dependentRef: string;
}

/**
 * کدام محاسبه‌ها با اصلاحیهٔ یک گزارش مشکوک می‌شوند.
 *
 * این تابع **نمی‌داند** کدام تحلیل واقعاً غلط شده؛ می‌داند کدام‌ها **از این
 * ورودی ساخته شده‌اند**. تفاوتش مهم است: هدف پرچمِ بازبینیِ انسانی است، نه
 * ادعای بطلانِ خودکار.
 */
export function dependentsOf(reportKind: string, symbol: string, periodEnd: string | null): ReviewFlag[] {
  const ref = `${symbol}|${periodEnd ?? "-"}`;
  if (reportKind === "ن-۱۰") {
    return [
      { dependentKind: "quarterly", dependentRef: ref },
      { dependentKind: "margins", dependentRef: ref },
      { dependentKind: "pe_ttm", dependentRef: symbol },
    ];
  }
  if (reportKind === "ن-۳۰") {
    return [
      { dependentKind: "monthly_sales", dependentRef: ref },
      { dependentKind: "monthly_rate", dependentRef: ref },
      { dependentKind: "fundamental_card", dependentRef: symbol },
    ];
  }
  return [];
}
