/**
 * چرخهٔ عمرِ تحلیل و دفترِ تمرین — `G3-003`.
 *
 * این ماژول **موتور موازی نیست**؛ همان قواعدی را در TypeScript بیان می‌کند که
 * `sql/phase22_manual_intelligence_workflow.sql` در سطحِ Postgres اجرا می‌کند.
 * دو بیانِ مستقل از یک قاعده عمداً نگه داشته شده‌اند: UI باید بتواند دکمهٔ
 * غیرمجاز را از اول نشان ندهد، ولی **مرجعِ نهایی دیتابیس است**. اگر این دو از هم
 * دور شوند، `workflow.integration.test.ts` روی Postgresِ واقعی قرمز می‌شود.
 *
 * ── قاعدهٔ سختی که این فایل نگه می‌دارد ────────────────────────────────────
 * `approved_internal` با `published` یکی نیست. تأییدِ داخلیِ آرش به‌تنهایی
 * هرگز چیزی را عمومی نمی‌کند. مسیرِ انتشار فقط از `approved_internal` می‌گذرد و
 * در این مأموریت هیچ دکمهٔ انتشاری ساخته نمی‌شود.
 */

export const ANALYSIS_STATES = [
  "draft",
  "pending_approval",
  "approved_internal",
  "rejected",
  "published",
  "superseded",
] as const;
export type AnalysisState = (typeof ANALYSIS_STATES)[number];

export const ANALYSIS_STATE_LABEL: Record<AnalysisState, string> = {
  draft: "پیش‌نویس داخلی",
  pending_approval: "در انتظار بازبینی",
  approved_internal: "تأییدشدهٔ داخلی",
  rejected: "ردشده",
  published: "منتشرشده",
  superseded: "جایگزین‌شده",
};

/**
 * حالت‌هایی که **هرگز** نباید به بیرون درز کنند. سیاستِ عمومیِ `phase20` روی
 * `status = 'published'` است، پس این فهرست باید دقیقاً مکملِ آن بماند —
 * تستِ همین فایل این تکمیل‌بودن را می‌سنجد، نه صرفاً محتوای فهرست را.
 */
export const INTERNAL_ONLY_STATES: readonly AnalysisState[] = [
  "draft",
  "pending_approval",
  "approved_internal",
  "rejected",
] as const;

export const WORKFLOW_EVENTS = [
  "captured",
  "submitted",
  "approved_internal",
  "rejected",
  "returned_to_draft",
  "published",
  "superseded",
] as const;
export type WorkflowEvent = (typeof WORKFLOW_EVENTS)[number];

export const WORKFLOW_EVENT_LABEL: Record<WorkflowEvent, string> = {
  captured: "ثبت شد",
  submitted: "برای بازبینی ارسال شد",
  approved_internal: "تأیید داخلی شد",
  rejected: "رد شد",
  returned_to_draft: "به پیش‌نویس بازگردانده شد",
  published: "منتشر شد",
  superseded: "جایگزین شد",
};

/**
 * جدولِ گذارها. هر کلید حالتِ فعلی است و مقدار، حالت‌های مجاز بعدی.
 * توجه: `pending_approval → published` عمداً **وجود ندارد**؛ در `phase20`
 * وجود داشت و همین مأموریت آن را بست.
 */
const TRANSITIONS: Record<AnalysisState, readonly AnalysisState[]> = {
  draft: ["pending_approval"],
  pending_approval: ["approved_internal", "rejected", "draft"],
  approved_internal: ["published", "draft"],
  rejected: ["draft"],
  published: ["superseded"],
  superseded: [],
};

export function canTransition(from: AnalysisState, to: AnalysisState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function nextStates(from: AnalysisState): readonly AnalysisState[] {
  return TRANSITIONS[from];
}

/** محتوای تحلیل فقط در `draft` قابلِ ویرایش است — نه زیر دستِ بازبین. */
export function isEditable(state: AnalysisState): boolean {
  return state === "draft";
}

/** رویدادی که ورود به هر حالت در دفتر ثبت می‌کند. */
export function eventForState(state: AnalysisState): WorkflowEvent {
  switch (state) {
    case "pending_approval":
      return "submitted";
    case "draft":
      return "returned_to_draft";
    default:
      return state;
  }
}

// ── اعتبارسنجیِ ورودی ───────────────────────────────────────────────────────

/**
 * فقط `http`/`https`. `javascript:` و `data:` هم در UI خطرناک‌اند و هم به
 * عنوانِ «منبع» بی‌معنا. `new URL` به‌تنهایی کافی نیست — همهٔ این‌ها را
 * می‌پذیرد.
 */
export function isSafeSourceUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:";
}

/** ۰ تا ۱۰۰، عددِ صحیح. `"80"`, `80.5`, `NaN` و `Infinity` همه رد می‌شوند. */
export function isValidConfidence(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100;
}

export const EVENT_SCOPES = ["iran", "global", "sector", "company"] as const;
export type EventScope = (typeof EVENT_SCOPES)[number];

/** نماد فقط برای رخدادِ شرکتی معنا دارد؛ در بقیهٔ دامنه‌ها باید `null` باشد. */
export function isSymbolScopeValid(scope: EventScope, symbol: string | null): boolean {
  return symbol === null ? true : scope === "company";
}

export const CLAIM_KINDS = ["FACT", "INFERENCE", "SCENARIO"] as const;
export type ClaimKind = (typeof CLAIM_KINDS)[number];
export const SCENARIO_LABELS = ["base", "upside", "downside"] as const;
export type ScenarioLabel = (typeof SCENARIO_LABELS)[number];

export const SCENARIO_LABEL_FA: Record<ScenarioLabel, string> = {
  base: "سناریوی مبنا",
  upside: "سناریوی خوش‌بینانه",
  downside: "سناریوی بدبینانه",
};

/** برچسبِ سناریو دقیقاً وقتی لازم است که گزاره سناریو باشد — نه کمتر، نه بیشتر. */
export function isScenarioLabelValid(kind: ClaimKind, label: ScenarioLabel | null): boolean {
  return (kind === "SCENARIO") === (label !== null);
}

// ── سنجه‌های تمرین ──────────────────────────────────────────────────────────

export interface RehearsalDay {
  rehearsalDate: string;
  dayIndex: number;
  briefProduced: boolean;
  minutesToApproval: number | null;
  absentSources: readonly string[];
  staleSources: readonly string[];
  humanCorrections: number;
  rejectedConclusions: number;
  missedEvents: number;
}

export interface RehearsalSummary {
  daysRecorded: number;
  briefsProduced: number;
  /** `null` وقتی هیچ روزی ثبت نشده — نه صفر. */
  briefRate: number | null;
  /** `null` وقتی هیچ Briefی زمانِ اندازه‌گیری‌شده ندارد. */
  averageMinutes: number | null;
  totalCorrections: number;
  totalRejected: number;
  totalMissedEvents: number;
  absentSources: readonly string[];
  staleSources: readonly string[];
  /** ۱۰ روزِ **واقعی**؛ تا آن‌موقع Gate 3 پاس نمی‌شود. */
  readyForGateReview: boolean;
}

export const REQUIRED_REHEARSAL_DAYS = 10;

/**
 * تجمیعِ سنجه‌ها. قاعدهٔ سختِ محصول اینجا هم برقرار است: **دادهٔ ناموجود
 * `null` است، نه صفر.** «هیچ روزی ثبت نشده» و «هر ده روز صفر اصلاح داشت» دو
 * چیزِ کاملاً متفاوت‌اند و اگر هر دو `۰٪` نشان داده شوند، گزارش دروغ می‌گوید.
 */
export function summarizeRehearsal(days: readonly RehearsalDay[]): RehearsalSummary {
  const produced = days.filter((d) => d.briefProduced);
  const timed = produced.filter((d) => d.minutesToApproval !== null);
  const uniq = (xs: readonly string[]) => [...new Set(xs)].sort();

  return {
    daysRecorded: days.length,
    briefsProduced: produced.length,
    briefRate: days.length === 0 ? null : produced.length / days.length,
    averageMinutes:
      timed.length === 0
        ? null
        : Math.round(timed.reduce((s, d) => s + (d.minutesToApproval ?? 0), 0) / timed.length),
    totalCorrections: days.reduce((s, d) => s + d.humanCorrections, 0),
    totalRejected: days.reduce((s, d) => s + d.rejectedConclusions, 0),
    totalMissedEvents: days.reduce((s, d) => s + d.missedEvents, 0),
    absentSources: uniq(days.flatMap((d) => [...d.absentSources])),
    staleSources: uniq(days.flatMap((d) => [...d.staleSources])),
    readyForGateReview: days.length >= REQUIRED_REHEARSAL_DAYS,
  };
}
