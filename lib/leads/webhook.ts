import { createHash, timingSafeEqual } from "node:crypto";
import { toLatinDigits } from "@/lib/format";

/**
 * موتورِ وبهوکِ لید — تمامِ منطق اینجاست و route handler فقط پوسته است.
 * (اصلِ «یک موتور، دو نما»: منطق تست‌پذیر بماند و به Next.js گره نخورد.)
 *
 * مسیرِ لید: Mini App (تلگرام) → POST /api/leads/webhook → public.leads
 */

// ── قراردادِ سکرت ────────────────────────────────────────────────────────────
/** نامِ متعارف. هر دو سمتِ مسیر (سایت و Mini App) همین را می‌خوانند. */
export const CANONICAL_SECRET_ENV = "PLATFORM_WEBHOOK_SECRET";
/**
 * نامِ قدیمی که فقط در `.env.example` سایت مستند شده بود و هرگز توسط کدی خوانده
 * نمی‌شد. چون معلوم نیست اپراتور روی Vercel کدام نام را ست کرده، موقتاً پذیرفته
 * می‌شود تا مسیرِ لید به یک تغییرِ دستیِ هماهنگ گره نخورد. حذف: ADR-003.
 */
export const LEGACY_SECRET_ENV = "LEADS_WEBHOOK_SECRET";

export type SecretSource = "canonical" | "legacy";

export function resolveWebhookSecret(
  env: Record<string, string | undefined>
): { secret: string; source: SecretSource } | null {
  const canonical = env[CANONICAL_SECRET_ENV]?.trim();
  if (canonical) return { secret: canonical, source: "canonical" };
  const legacy = env[LEGACY_SECRET_ENV]?.trim();
  if (legacy) return { secret: legacy, source: "legacy" };
  return null;
}

/**
 * مقایسهٔ زمان‌ثابت. دو طرف اول هش می‌شوند تا طولِ سکرت هم از راهِ زمان لو نرود
 * (`timingSafeEqual` روی طول‌های نابرابر استثنا می‌دهد).
 */
export function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = createHash("sha256").update(provided, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

// ── قراردادِ payload ─────────────────────────────────────────────────────────
export const LEAD_STATUS_VALUES = ["new", "contacted", "converted", "archived"] as const;
export type LeadStatus = (typeof LEAD_STATUS_VALUES)[number];

/** سقفِ طولِ هر فیلد — با CHECKهای `sql/phase8b_leads.sql` یکی است. */
export const LEAD_LIMITS = {
  source: 32,
  name: 200,
  phone: 32,
  topic: 64,
  message: 4000,
  preferred_date: 32,
  preferred_time: 32,
  telegram_username: 64,
  telegram_id: 64,
} as const;

export const DEFAULT_SOURCE = "miniapp";
/** حداقلِ رقمِ یک شمارهٔ قابل‌استفاده (فراخواننده خودش `min(10)` می‌گذارد). */
const MIN_PHONE_DIGITS = 7;
/** پنجرهٔ تشخیصِ ارسالِ تکراری. */
export const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

export type LeadRecord = {
  source: string;
  name: string;
  phone: string | null;
  topic: string | null;
  message: string | null;
  preferred_date: string | null;
  preferred_time: string | null;
  telegram_username: string | null;
  telegram_id: string | null;
  status: LeadStatus;
};

export type ParseFailure = { ok: false; status: number; code: string; error: string; field?: string };
export type ParseSuccess = { ok: true; lead: LeadRecord };

/** رشتهٔ خام → رشتهٔ نرمال‌شده، یا `null` اگر عملاً خالی باشد. */
function normalize(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.length > 0 ? trimmed : null;
}

function tooLong(value: string | null, field: keyof typeof LEAD_LIMITS): ParseFailure | null {
  if (value && value.length > LEAD_LIMITS[field]) {
    return {
      ok: false,
      status: 400,
      code: "field_too_long",
      field,
      error: `طول فیلد «${field}» بیش از حدِ مجاز است.`,
    };
  }
  return null;
}

/**
 * اعتبارسنجی و نرمال‌سازیِ بدنهٔ وبهوک.
 *
 * `status` عمداً از payload خوانده **نمی‌شود**؛ چرخهٔ حیاتِ لید فقط سمتِ سرور
 * تعیین می‌شود تا فراخوانندهٔ بیرونی نتواند لید را مثلاً `archived` بفرستد.
 */
export function parseLeadPayload(body: unknown): ParseSuccess | ParseFailure {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, status: 400, code: "invalid_body", error: "بدنهٔ درخواست معتبر نیست." };
  }
  const raw = body as Record<string, unknown>;

  const name = normalize(raw.name);
  if (!name) {
    return { ok: false, status: 400, code: "name_required", error: "نام الزامی است." };
  }

  // ارقامِ فارسی/عربی قبل از اعتبارسنجی به لاتین تبدیل می‌شوند (قانونِ app/api).
  const phoneRaw = normalize(raw.phone);
  const phone = phoneRaw ? toLatinDigits(phoneRaw) : null;
  if (phone && (phone.match(/\d/g) ?? []).length < MIN_PHONE_DIGITS) {
    return { ok: false, status: 400, code: "invalid_phone", error: "شمارهٔ تماس معتبر نیست." };
  }

  const lead: LeadRecord = {
    source: normalize(raw.source) ?? DEFAULT_SOURCE,
    name,
    phone,
    topic: normalize(raw.topic),
    message: normalize(raw.message),
    preferred_date: normalize(raw.preferred_date),
    preferred_time: normalize(raw.preferred_time),
    telegram_username: normalize(raw.telegram_username),
    telegram_id: normalize(raw.telegram_id),
    status: "new",
  };

  for (const field of Object.keys(LEAD_LIMITS) as (keyof typeof LEAD_LIMITS)[]) {
    const failure = tooLong(lead[field], field);
    if (failure) return failure;
  }

  return { ok: true, lead };
}

// ── لایهٔ ذخیره‌سازی (تزریق‌شونده، تا موتور به Supabase گره نخورد) ──────────────
export interface LeadStore {
  /** لیدِ هم‌سان در پنجرهٔ اخیر. خطا → `{ error }` و مسیر ادامه می‌یابد. */
  findRecentDuplicate(query: {
    phone: string;
    topic: string | null;
    sinceIso: string;
  }): Promise<{ found: boolean; error?: unknown }>;
  insertLead(lead: LeadRecord): Promise<{ error: unknown }>;
}

/** نشانهٔ «بدنه اصلاً JSON نبود» — تا route لازم نباشد پیامِ خطا را خودش بسازد. */
export const INVALID_JSON = Symbol("INVALID_JSON");

export type WebhookResult = { status: number; body: Record<string, unknown> };

export async function handleLeadWebhook(args: {
  providedSecret: string | null;
  body: unknown | typeof INVALID_JSON;
  env: Record<string, string | undefined>;
  store: LeadStore;
  now?: Date;
  log?: (message: string, meta?: unknown) => void;
}): Promise<WebhookResult> {
  const { providedSecret, body, env, store } = args;
  const now = args.now ?? new Date();
  const log = args.log ?? (() => {});

  // ۱) احراز هویت — پیش از هر پارس یا لاگی از بدنه.
  const resolved = resolveWebhookSecret(env);
  if (!resolved) {
    log(`[Leads webhook] ${CANONICAL_SECRET_ENV} تنظیم نشده — درخواست رد شد.`);
    return { status: 401, body: { code: "unauthorized", error: "دسترسی غیرمجاز." } };
  }
  if (resolved.source === "legacy") {
    log(
      `[Leads webhook] هشدارِ منسوخ: ${LEGACY_SECRET_ENV} استفاده شد. ` +
        `به ${CANONICAL_SECRET_ENV} مهاجرت کنید (ADR-003).`
    );
  }
  if (!secretMatches(providedSecret, resolved.secret)) {
    log("[Leads webhook] سکرتِ نامعتبر — درخواست رد شد.");
    return { status: 401, body: { code: "unauthorized", error: "دسترسی غیرمجاز." } };
  }

  // ۲) اعتبارسنجی
  if (body === INVALID_JSON) {
    return { status: 400, body: { code: "invalid_json", error: "بدنهٔ درخواست معتبر نیست." } };
  }
  const parsed = parseLeadPayload(body);
  if (!parsed.ok) {
    const { status, ...rest } = parsed;
    const payload: Record<string, unknown> = { code: rest.code, error: rest.error };
    if (rest.field) payload.field = rest.field;
    return { status, body: payload };
  }
  const { lead } = parsed;

  // ۳) تکراری — فقط وقتی شماره داریم (تنها کلیدِ هویتیِ قابل‌اتکا).
  //    شکستِ خودِ این خواندن هرگز نباید باعثِ ازدست‌رفتنِ لید شود.
  if (lead.phone) {
    const sinceIso = new Date(now.getTime() - DUPLICATE_WINDOW_MS).toISOString();
    const dup = await store.findRecentDuplicate({ phone: lead.phone, topic: lead.topic, sinceIso });
    if (dup.error) {
      log("[Leads webhook] بررسیِ تکراری ناموفق بود؛ درج ادامه یافت.", dup.error);
    } else if (dup.found) {
      log("[Leads webhook] لیدِ تکراری در پنجرهٔ اخیر — نادیده گرفته شد.");
      return { status: 200, body: { ok: true, duplicate: true, code: "duplicate_ignored" } };
    }
  }

  // ۴) درج
  const { error } = await store.insertLead(lead);
  if (error) {
    log("[Leads webhook] خطای درج:", error);
    return { status: 500, body: { code: "db_insert_failed", error: "خطا در ثبت اطلاعات." } };
  }

  return { status: 200, body: { ok: true, duplicate: false } };
}
