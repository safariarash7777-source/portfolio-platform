/**
 * دفترِ اجرای jobهای زمان‌بندی‌شده — `G2-003` / `P2-G2-012`.
 *
 * ## چرا وجود دارد
 *
 * تا امروز «آخرین اجرای موفقِ cron» از دیتابیس **قابل دانستن نبود**. نمای سلامت
 * مجبور بود از روی نشانه‌های غیرمستقیم حدس بزند، و آن نشانه‌ها مبهم‌اند:
 *
 *   • `alerts` وقتی هیچ هشدارِ فعالی نباشد هیچ ردیفی نمی‌نویسد → یک اجرای
 *     کاملاً موفق هیچ اثری از خود باقی نمی‌گذارد.
 *   • `telegram-sync` فقط وقتی درج می‌کند که پستِ تازه‌ای باشد → «ردیفِ تازه
 *     نیست» یعنی «کانال ساکت بوده» **یا** «سه روز است اجرا نشده»، و این دو از
 *     بیرون یکسان به‌نظر می‌رسند.
 *
 * یعنی شاخصِ قبلی در عمل **حضورِ محصول** را می‌سنجید، نه **اجرای job** را. این
 * ماژول آن دو را جدا می‌کند: هر اجرا ردِ خودش را می‌گذارد، حتی اگر کارِ مفیدی
 * نکرده باشد و حتی اگر شکست خورده باشد.
 *
 * ## مرزِ این فایل
 *
 * اینجا فقط منطقِ خالص و قراردادِ ذخیره‌سازی است — هیچ وابستگی به Supabase یا
 * Next.js. روتِ cron پوسته است («یک موتور، چند نما»)، تا این منطق بدونِ شبکه
 * تست‌پذیر بماند.
 */

// ── قرارداد ────────────────────────────────────────────────────────────────

export const CRON_JOB_KEYS = ["alerts", "telegram-sync"] as const;
export type CronJobKey = (typeof CRON_JOB_KEYS)[number];

export const CRON_RUN_STATUSES = ["running", "succeeded", "failed"] as const;
export type CronRunStatus = (typeof CRON_RUN_STATUSES)[number];

export interface CronRun {
  id: string;
  jobKey: string;
  startedAt: string;
  finishedAt: string | null;
  status: CronRunStatus;
  processedCount: number | null;
  errorCode: string | null;
  safeErrorSummary: string | null;
  deploymentSha: string | null;
  durationMs: number | null;
}

/** فقط چیزی که برای شروع لازم است. */
export interface StartRunInput {
  jobKey: string;
  deploymentSha: string | null;
}

export interface FinishRunInput {
  status: Extract<CronRunStatus, "succeeded" | "failed">;
  processedCount: number | null;
  errorCode: string | null;
  safeErrorSummary: string | null;
  durationMs: number;
}

/** لایهٔ ذخیره‌سازیِ تزریق‌شونده، تا موتور به دیتابیس گره نخورد. */
export interface CronLedgerStore {
  startRun(input: StartRunInput): Promise<{ id: string | null; error?: unknown }>;
  finishRun(id: string, input: FinishRunInput): Promise<{ error?: unknown }>;
  /** اجراهای `running` که خیلی وقت است تمام نشده‌اند. */
  countStaleRunning(jobKey: string, olderThanIso: string): Promise<{ count: number; error?: unknown }>;
}

// ── پاک‌سازیِ خطا ───────────────────────────────────────────────────────────

/**
 * سقفِ خلاصهٔ خطا — با `CHECK` در `sql/phase21_cron_runs.sql` یکی است.
 * اگر یکی را عوض کردی آن یکی را هم عوض کن؛ تست هر دو را می‌خوانَد.
 */
export const SAFE_ERROR_SUMMARY_MAX = 300;
export const ERROR_CODE_MAX = 64;

/**
 * الگوهایی که **هرگز** نباید در دفتر بنشینند.
 *
 * پیامِ خامِ استثنا مرتباً چیزهایی را با خود می‌آورد که ما اجازهٔ نگه‌داشتنشان
 * را نداریم: URLِ کامل (که می‌تواند توکنِ مسیر داشته باشد — همان دلیلی که نمای
 * سلامت هم URLِ وبهوکِ تلگرام را برنمی‌گرداند)، رشته‌های JWT‌شکل، و
 * `key=value`های شبیهِ سکرت. پس به‌جای «امیدوارم چیزی نباشد»، صریح پاک می‌کنیم.
 */
const REDACTIONS: ReadonlyArray<[RegExp, string]> = [
  [/https?:\/\/[^\s"'<>]+/gi, "[url]"],
  [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.?[A-Za-z0-9_-]*/g, "[jwt]"],
  [/\b(sb_[a-z]+_[A-Za-z0-9_-]{8,}|sbp_[A-Za-z0-9]{16,}|vcp_[A-Za-z0-9]{16,}|gh[pousr]_[A-Za-z0-9]{20,})\b/g, "[token]"],
  [/\b(secret|token|key|password|passwd|authorization|apikey|api_key)\s*[=:]\s*\S+/gi, "$1=[redacted]"],
  // شمارهٔ موبایلِ ایران — دادهٔ شخصی، حتی اگر تصادفی در پیام افتاده باشد.
  [/\b0?9\d{9}\b/g, "[phone]"],
];

/**
 * پیامِ خام → خلاصهٔ بی‌خطرِ کران‌دار.
 *
 * ترتیبِ کارها مهم است: اول پاک‌سازی، بعد کوتاه‌سازی. برعکسش می‌تواند یک توکن
 * را وسط ببرد و نیمه‌اش را باقی بگذارد.
 */
export function sanitizeErrorSummary(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const text = raw instanceof Error ? raw.message : String(raw);
  if (text.trim().length === 0) return null;

  let out = text;
  for (const [pattern, replacement] of REDACTIONS) out = out.replace(pattern, replacement);
  out = out.replace(/\s+/g, " ").trim();
  if (out.length === 0) return null;

  return out.length > SAFE_ERROR_SUMMARY_MAX ? `${out.slice(0, SAFE_ERROR_SUMMARY_MAX - 1)}…` : out;
}

/** کدِ خطا باید ماشین‌خوان و کوتاه بماند؛ هرچیزِ دیگری `unknown` است. */
export function normalizeErrorCode(code: unknown): string {
  if (typeof code !== "string") return "unknown";
  const trimmed = code.trim();
  if (trimmed.length === 0 || trimmed.length > ERROR_CODE_MAX) return "unknown";
  return /^[a-z0-9_.-]+$/i.test(trimmed) ? trimmed : "unknown";
}

// ── گذارها ─────────────────────────────────────────────────────────────────

/**
 * آیا این گذار مجاز است؟ عیناً همان قاعده‌ای که تریگرِ دیتابیس اجرا می‌کند.
 *
 * دو جا پیاده شده چون دو کارِ متفاوت می‌کنند: اینجا جلوی فراخوانیِ اشتباه را
 * زودتر و با پیامِ بهتر می‌گیرد، آنجا جلوی هر نویسنده‌ای را می‌گیرد — حتی
 * نویسنده‌ای که این کد را دور بزند.
 */
export function isValidTransition(from: CronRunStatus, to: CronRunStatus): boolean {
  return from === "running" && (to === "succeeded" || to === "failed");
}

// ── اجرای یک job، با ثبتِ دفتری ─────────────────────────────────────────────

export interface RunOutcome {
  ok: boolean;
  processedCount: number | null;
  errorCode: string | null;
  rawError: unknown;
}

export interface RunWithLedgerResult<T> {
  /** خروجیِ خودِ job — دست‌نخورده. */
  result: T;
  /** آیا دفتر توانست ثبت کند؟ شکستِ ثبت **نباید** jobِ سالم را خراب کند. */
  ledgerRecorded: boolean;
  runId: string | null;
  durationMs: number;
}

/**
 * jobِ واقعی را اجرا می‌کند و شروع/پایانش را در دفتر می‌نویسد.
 *
 * قاعدهٔ سخت: **دفتر هرگز jobِ سالم را نمی‌شکند.** اگر ثبت شکست بخورد، خروجیِ
 * job همان است که بود و فقط `ledgerRecorded=false` می‌شود. یک ابزارِ رصد که
 * بتواند کارِ اصلی را از کار بیندازد، از نبودنش بدتر است.
 */
export async function runWithLedger<T>(args: {
  store: CronLedgerStore;
  jobKey: string;
  deploymentSha: string | null;
  now?: () => number;
  job: () => Promise<{ outcome: RunOutcome; value: T }>;
}): Promise<RunWithLedgerResult<T>> {
  const clock = args.now ?? (() => Date.now());
  const startedMs = clock();

  let runId: string | null = null;
  try {
    const started = await args.store.startRun({ jobKey: args.jobKey, deploymentSha: args.deploymentSha });
    runId = started.id;
  } catch {
    runId = null;
  }

  let outcome: RunOutcome;
  let value: T;
  try {
    const r = await args.job();
    outcome = r.outcome;
    value = r.value;
  } catch (e) {
    // استثنای مهارنشدهٔ خودِ job هم باید در دفتر بنشیند، وگرنه بدترین حالت
    // (کرشِ کامل) دقیقاً همان حالتی می‌شود که هیچ ردی ندارد.
    outcome = { ok: false, processedCount: null, errorCode: "unhandled_exception", rawError: e };
    value = undefined as T;
  }

  const durationMs = Math.max(0, clock() - startedMs);

  let ledgerRecorded = false;
  if (runId) {
    try {
      const { error } = await args.store.finishRun(runId, {
        status: outcome.ok ? "succeeded" : "failed",
        processedCount: outcome.processedCount,
        errorCode: outcome.ok ? null : normalizeErrorCode(outcome.errorCode),
        safeErrorSummary: outcome.ok ? null : sanitizeErrorSummary(outcome.rawError),
        durationMs,
      });
      ledgerRecorded = !error;
    } catch {
      ledgerRecorded = false;
    }
  }

  return { result: value, ledgerRecorded, runId, durationMs };
}
