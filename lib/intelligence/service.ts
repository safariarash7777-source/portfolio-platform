/**
 * مرزِ مجوز و اعتبارسنجیِ موتورِ دستیِ هوشمندی — `G3-003`.
 *
 * ── چرا این فایل وجود دارد ──────────────────────────────────────────────
 * همان درسی که `lib/desk/service.ts` را ساخت: اگر منطقِ مجوز داخلِ route
 * handler بماند، تنها راهِ تستش خواندنِ **متنِ سورس** است — و آن تست ثابت
 * می‌کند کد حذف نشده، نه اینکه رفتار درست است. یک بازآراییِ بی‌دقت می‌تواند
 * ترتیب را عوض کند و تستِ متنی همچنان سبز بماند.
 *
 * پس وابستگی‌ها تزریق می‌شوند و `createWriter` یک **factory** است، نه یک
 * نمونهٔ ساخته‌شده. تنها این‌طور می‌شود ثابت کرد که کلاینتِ service-role در
 * مسیرهای ۴۰۱ و ۴۰۳ **اصلاً ساخته نمی‌شود** — ادعایی که با خواندنِ متن
 * قابلِ اثبات نیست.
 *
 * ⚠️ محدودهٔ اعتبار: این‌ها تستِ رفتاریِ محلی/CI‌اند، نه تستِ HTTPِ احرازشده با
 * Supabaseِ زنده و نه راستی‌آزماییِ Production. هر سه لازم‌اند.
 */

import {
  isSafeSourceUrl,
  isValidConfidence,
  isSymbolScopeValid,
  isScenarioLabelValid,
  canTransition,
  type AnalysisState,
  type ClaimKind,
  type EventScope,
  type ScenarioLabel,
} from "@/lib/intelligence/workflow";

export interface CapturedClaim {
  kind: ClaimKind;
  statement: string;
  confidence: number;
  scenarioLabel: ScenarioLabel | null;
}

export interface CapturePackage {
  source: { id?: string; kind?: string; name?: string; url?: string | null; trustTier?: string };
  evidence: { excerpt: string; contentUrl?: string | null; observedAt: string; publishedAt?: string | null };
  event: { domain: string; title: string; summary?: string | null; occurredAt: string; scope: EventScope; symbol?: string | null } | null;
  analysis: { domain: string; title: string; bodyMd: string; briefDate?: string | null };
  claims: CapturedClaim[];
}

/** نویسندهٔ واقعی — در Production کلاینتِ service-role، در تست یک بدل. */
export interface IntelWriter {
  capture(payload: CapturePackage & { contentHash: string }): Promise<string>;
  transition(analysisId: string, to: AnalysisState, note: string | null, actorId: string): Promise<void>;
  loadState(analysisId: string): Promise<AnalysisState | null>;
}

export interface IntelGateway {
  getUser(): Promise<{ id: string } | null>;
  getRole(userId: string): Promise<string | null>;
  createWriter(): IntelWriter;
  /** هشِ محتوا **همیشه** سمتِ سرور ساخته می‌شود؛ کلاینت هرگز تعیینش نمی‌کند. */
  hash(input: string): string;
}

export type IntelResult =
  | { status: 200 | 201; body: Record<string, unknown> }
  | { status: 400 | 401 | 403 | 409 | 500; body: { error: string } };

const SOURCE_KINDS = ["codal", "telegram", "instagram", "news", "official", "market_data", "manual"];
const DOMAINS = [
  "politics_geo", "macro_ir", "macro_global", "fx_gold", "equity_ir",
  "company_codal", "fixed_income", "commodity_funds", "capital_risk", "allocation",
];
const SCOPES = ["iran", "global", "sector", "company"];
const KINDS = ["FACT", "INFERENCE", "SCENARIO"];
const LABELS = ["base", "upside", "downside"];

const str = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const isIsoDate = (v: unknown): v is string =>
  typeof v === "string" && !Number.isNaN(Date.parse(v));

/**
 * اعتبارسنجیِ کاملِ بسته **پیش از** هر تماس با دیتابیس.
 *
 * دیتابیس همهٔ این‌ها را دوباره می‌سنجد و مرجعِ نهایی هم اوست؛ ولی یک خطای
 * `violates check constraint "intel_claims_confidence_check"` پیامِ خوبی برای
 * آرش نیست. اینجا پیامِ فارسیِ قابلِ فهم ساخته می‌شود، بدون اینکه گاردِ
 * دیتابیس سست شود.
 */
export function validatePackage(p: CapturePackage): string | null {
  if (!p || typeof p !== "object") return "بستهٔ نامعتبر";

  const s = p.source;
  if (!s || typeof s !== "object") return "منبع لازم است";
  if (!str(s.id)) {
    if (!str(s.kind) || !SOURCE_KINDS.includes(s.kind)) return "نوعِ منبع نامعتبر است";
    if (!str(s.name)) return "نامِ منبع لازم است";
    if (s.url != null && s.url !== "" && !isSafeSourceUrl(s.url)) {
      return "نشانیِ منبع باید http یا https باشد";
    }
  }

  const e = p.evidence;
  if (!e || !str(e.excerpt)) return "متنِ شاهد لازم است";
  if (e.excerpt.length > 2000) return "متنِ شاهد نباید بیش از ۲۰۰۰ نویسه باشد";
  if (!isIsoDate(e.observedAt)) return "زمانِ مشاهده نامعتبر است";
  if (e.publishedAt != null && e.publishedAt !== "" && !isIsoDate(e.publishedAt)) {
    return "تاریخِ انتشار نامعتبر است";
  }
  if (e.contentUrl != null && e.contentUrl !== "" && !isSafeSourceUrl(e.contentUrl)) {
    return "نشانیِ مستقیمِ شاهد باید http یا https باشد";
  }

  if (p.event !== null) {
    const ev = p.event;
    if (!ev || !DOMAINS.includes(ev.domain)) return "حوزهٔ رخداد نامعتبر است";
    if (!str(ev.title)) return "عنوانِ رخداد لازم است";
    if (!isIsoDate(ev.occurredAt)) return "زمانِ رخداد نامعتبر است";
    if (!SCOPES.includes(ev.scope)) return "دامنهٔ رخداد نامعتبر است";
    const symbol = ev.symbol == null || ev.symbol === "" ? null : ev.symbol;
    if (!isSymbolScopeValid(ev.scope, symbol)) return "نماد فقط برای رخدادِ شرکتی معنا دارد";
  }

  const a = p.analysis;
  if (!a || !DOMAINS.includes(a.domain)) return "حوزهٔ تحلیل نامعتبر است";
  if (!str(a.title)) return "عنوانِ تحلیل لازم است";
  if (!str(a.bodyMd)) return "متنِ تحلیل لازم است";
  if (a.briefDate != null && a.briefDate !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(a.briefDate)) {
    return "تاریخِ بریف نامعتبر است";
  }

  if (!Array.isArray(p.claims) || p.claims.length === 0) return "دستِ‌کم یک گزاره لازم است";
  for (const c of p.claims) {
    if (!c || !KINDS.includes(c.kind)) return "نوعِ گزاره نامعتبر است";
    if (!str(c.statement)) return "متنِ گزاره لازم است";
    if (!isValidConfidence(c.confidence)) return "اطمینان باید عددِ صحیحِ ۰ تا ۱۰۰ باشد";
    const label = c.scenarioLabel == null || (c.scenarioLabel as string) === "" ? null : c.scenarioLabel;
    if (label !== null && !LABELS.includes(label)) return "برچسبِ سناریو نامعتبر است";
    if (!isScenarioLabelValid(c.kind, label)) {
      return "برچسبِ سناریو دقیقاً برای گزاره‌های سناریو لازم است";
    }
  }
  return null;
}

/**
 * مجوز **پیش از** ساختِ هر کلاینتِ دیتابیس.
 *
 * ترتیبِ این تابع خودش بخشی از قرارداد است و تستِ `writersCreated === 0` همان
 * را می‌سنجد. خواندنِ ناموفقِ نقش عمداً ۴۰۳ می‌دهد، نه ۲۰۰ — **fail closed**.
 * ضمناً هیچ پیامِ خطایی نمی‌گوید چند تحلیل وجود دارد یا اصلاً وجود دارد.
 */
async function authorize(
  gateway: IntelGateway
): Promise<{ ok: true; userId: string } | { ok: false; result: IntelResult }> {
  const user = await gateway.getUser();
  if (!user) return { ok: false, result: { status: 401, body: { error: "ورود لازم است" } } };
  let role: string | null;
  try {
    role = await gateway.getRole(user.id);
  } catch {
    return { ok: false, result: { status: 403, body: { error: "دسترسی مجاز نیست" } } };
  }
  if (role !== "admin") {
    return { ok: false, result: { status: 403, body: { error: "دسترسی مجاز نیست" } } };
  }
  return { ok: true, userId: user.id };
}

export async function capturePackage(
  gateway: IntelGateway,
  payload: CapturePackage
): Promise<IntelResult> {
  const auth = await authorize(gateway);
  if (!auth.ok) return auth.result;

  const problem = validatePackage(payload);
  if (problem) return { status: 400, body: { error: problem } };

  // هشِ محتوا از خودِ شاهد ساخته می‌شود، نه از چیزی که کلاینت فرستاده.
  const contentHash = gateway.hash(
    `${payload.evidence.excerpt} ${payload.evidence.contentUrl ?? ""} ${payload.evidence.observedAt}`
  );

  try {
    const id = await gateway.createWriter().capture({ ...payload, contentHash });
    return { status: 201, body: { analysisId: id } };
  } catch (error) {
    return { status: 500, body: { error: describe(error) } };
  }
}

export async function transitionAnalysis(
  gateway: IntelGateway,
  analysisId: string,
  to: AnalysisState,
  note: string | null
): Promise<IntelResult> {
  const auth = await authorize(gateway);
  if (!auth.ok) return auth.result;

  if (!/^[0-9a-f-]{36}$/i.test(analysisId)) {
    return { status: 400, body: { error: "شناسهٔ تحلیل نامعتبر است" } };
  }
  if (note !== null && (typeof note !== "string" || note.length > 2000)) {
    return { status: 400, body: { error: "یادداشتِ بازبینی نامعتبر است" } };
  }

  // انتشار عمداً از این مسیر عبور نمی‌کند. این مأموریت هیچ دکمهٔ انتشارِ
  // عمومی نمی‌سازد و پیش‌فرض، عدمِ انتشار است.
  if (to === "published") {
    return { status: 403, body: { error: "انتشارِ عمومی از این مسیر ممکن نیست" } };
  }

  // ساختِ writer داخلِ try است: بیرونش، یک پرتاب (مثلِ نبودِ سکرتِ سرور) از
  // این تابع بیرون می‌زد و Next آن را به ۵۰۰ با بدنهٔ خالی تبدیل می‌کرد —
  // همان کوری‌ای که `capturePackage` از قبل نداشت.
  try {
    const writer = gateway.createWriter();
    const from = await writer.loadState(analysisId);
    if (from === null) return { status: 404 as 400, body: { error: "تحلیل پیدا نشد" } };
    if (!canTransition(from, to)) {
      return { status: 409, body: { error: "این تغییرِ وضعیت مجاز نیست" } };
    }
    await writer.transition(analysisId, to, note, auth.userId);
    return { status: 200, body: { status: to } };
  } catch (error) {
    return { status: 500, body: { error: describe(error) } };
  }
}

/**
 * پیامِ خطا هرگز نباید سکرت یا دادهٔ شخصی حمل کند. متنِ خامِ خطای Postgres
 * می‌تواند مقدارِ ستون یا رشتهٔ اتصال داشته باشد، پس فقط الگوهای شناخته‌شده به
 * پیامِ فارسی نگاشت می‌شوند و بقیه به یک پیامِ عمومی سقوط می‌کنند.
 */
export function describe(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (/admin required/i.test(raw)) return "دسترسی مجاز نیست";
  if (/at least one claim/i.test(raw)) return "دستِ‌کم یک گزاره لازم است";
  if (/requires evidence/i.test(raw)) return "هر گزاره باید شاهد داشته باشد";
  if (/illegal analysis transition/i.test(raw)) return "این تغییرِ وضعیت مجاز نیست";
  if (/only a draft analysis may be edited/i.test(raw)) return "فقط پیش‌نویس قابلِ ویرایش است";
  if (/duplicate key|unique/i.test(raw)) return "برای این تاریخ بریفِ فعال وجود دارد";
  if (/row-level security/i.test(raw)) return "دسترسی مجاز نیست";
  // نقصِ پیکربندی نباید شبیهِ شکستِ ثبت به‌نظر برسد: این دو تشخیص و دو کارِ
  // متفاوت‌اند. نامِ متغیر افشا می‌شود، مقدارش هرگز — همان قاعدهٔ
  // `app/api/admin/health/route.ts`.
  if (/SUPABASE_SERVICE_ROLE_KEY/.test(raw))
    return "پیکربندیِ سرور ناقص است: متغیرِ «SUPABASE_SERVICE_ROLE_KEY» تنظیم نشده";
  return "ثبت انجام نشد";
}
