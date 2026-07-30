/**
 * قراردادهای دادهٔ هوشمندیِ بازار — `G3-001` · ADR-005.
 *
 * ⚠️ **هیچ‌کدام از این جدول‌ها هنوز وجود ندارد.** این فایل فقط قرارداد است تا
 * طراحی قابلِ بازبینی و تایپ‌ها قابلِ راستی‌آزمایی باشند. migration مربوطه
 * `sql/phase20_intelligence_model.sql` است و وضعیتش **`NOT_APPLIED`**.
 *
 * سه قاعده‌ای که شکلِ این تایپ‌ها را تعیین کرده‌اند:
 *
 *   ۱. **ادعای بی‌منبع وجود ندارد.** `evidenceId` در `IntelClaim` اختیاری نیست.
 *      اگر اختیاری بود، اولین باری که عجله داشتیم خالی می‌ماند.
 *   ۲. **اطمینان عددِ صریح است، نه حسِ ضمنی.** `confidence` هم اجباری است.
 *      «نمی‌دانم» یعنی عددِ پایین با دلیل، نه فیلدِ خالی.
 *   ۳. **عددِ خامِ مالی اینجا نیست.** بزرگیِ اثر **باند** است (`magnitudeBand`)
 *      نه رقم. این هم قانونِ CLAUDE.md را نگه می‌دارد و هم مسیرِ آیندهٔ LLM را
 *      از ابتدا امن می‌کند.
 */

// ── دامنه‌ها ────────────────────────────────────────────────────────────────

/** ده دامنه‌ای که مأموریت خواسته — ADR-005 §۵. */
export const INTEL_DOMAINS = [
  "politics_geo",
  "macro_ir",
  "macro_global",
  "fx_gold",
  "equity_ir",
  "company_codal",
  "fixed_income",
  "commodity_funds",
  "capital_risk",
  "allocation",
] as const;
export type IntelDomain = (typeof INTEL_DOMAINS)[number];

export const DOMAIN_LABEL: Record<IntelDomain, string> = {
  politics_geo: "سیاست و ژئوپلیتیک",
  macro_ir: "اقتصاد کلان ایران",
  macro_global: "اقتصاد کلان جهان",
  fx_gold: "ارز و طلا",
  equity_ir: "سهام و صنایع ایران",
  company_codal: "شرکت‌ها و کدال",
  fixed_income: "درآمد ثابت",
  commodity_funds: "صندوق‌های کالایی و گواهی سپرده",
  capital_risk: "ریسک سرمایه",
  allocation: "تخصیص دارایی و سبد مرجع",
};

// ── منبع و شاهد ─────────────────────────────────────────────────────────────

export const SOURCE_KINDS = ["codal", "telegram", "news", "official", "market_data", "manual"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

/** ردهٔ اعتماد. `unverified` پیش‌فرض است — اعتماد باید کسب شود، نه فرض. */
export const TRUST_TIERS = ["primary", "secondary", "unverified"] as const;
export type TrustTier = (typeof TRUST_TIERS)[number];

export interface IntelSource {
  id: string;
  kind: SourceKind;
  name: string;
  url: string | null;
  trustTier: TrustTier;
  /**
   * `D-022` هنوز باز است: فهرستِ منابعِ تأییدشده تصمیمِ آرش است. تا آن زمان
   * پیش‌فرض `false` می‌ماند و هیچ کدی نباید منبعِ تأییدنشده را «معتبر» بخواند.
   */
  approved: boolean;
  createdAt: string;
}

export interface IntelEvidence {
  id: string;
  sourceId: string;
  /** نقلِ کوتاه — نه کلِ متن. کپیِ کاملِ محتوای دیگران نه لازم است نه بی‌خطر. */
  excerpt: string;
  contentUrl: string | null;
  /** کِی ما دیدیمش. */
  observedAt: string;
  /** کِی خودش منتشر شده بود (اگر معلوم باشد) — این دو یکی نیستند. */
  publishedAt: string | null;
  /** برای تشخیصِ شاهدِ تکراری از چند منبع. */
  contentHash: string;
  createdAt: string;
}

// ── رخداد ───────────────────────────────────────────────────────────────────

export const EVENT_SCOPES = ["iran", "global", "sector", "company"] as const;
export type EventScope = (typeof EVENT_SCOPES)[number];

export interface IntelEvent {
  id: string;
  domain: IntelDomain;
  title: string;
  summary: string | null;
  occurredAt: string;
  scope: EventScope;
  /** فقط وقتی `scope='company'` معنا دارد. */
  symbol: string | null;
  createdAt: string;
}

// ── ادعا: واقعیت / استنباط / سناریو ────────────────────────────────────────

/**
 * سه‌گانهٔ تفکیکِ ادعا. اینکه **ستون** است و نه برچسبِ داخلِ متن، عمدی است:
 * چیزی که در متن نوشته شود قابلِ فیلتر و قابلِ ممیزی نیست.
 */
export const CLAIM_KINDS = ["FACT", "INFERENCE", "SCENARIO"] as const;
export type ClaimKind = (typeof CLAIM_KINDS)[number];

export const SCENARIO_LABELS = ["پایه", "خوش‌بینانه", "بدبینانه"] as const;
export type ScenarioLabel = (typeof SCENARIO_LABELS)[number];

export interface IntelClaim {
  id: string;
  analysisId: string;
  eventId: string | null;
  /** **اجباری.** ادعای بی‌شاهد در سطحِ اسکیما هم رد می‌شود، نه فقط اینجا. */
  evidenceId: string;
  kind: ClaimKind;
  statement: string;
  /** ۰..۱۰۰ — اجباری. نبودِ اطمینان یعنی عددِ پایین، نه فیلدِ خالی. */
  confidence: number;
  /** فقط برای `kind='SCENARIO'` پر می‌شود. */
  scenarioLabel: ScenarioLabel | null;
  createdAt: string;
}

// ── تحلیل ───────────────────────────────────────────────────────────────────

export const ANALYSIS_STATUSES = ["draft", "pending_approval", "published", "superseded"] as const;
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

export interface IntelAnalysis {
  id: string;
  seq: number;
  domain: IntelDomain;
  title: string;
  bodyMd: string;
  status: AnalysisStatus;
  /** `DD-023`: هیچ تحلیلِ حساسی بدونِ تأییدِ انسانی منتشر نمی‌شود. */
  approvedBy: string | null;
  approvedAt: string | null;
  /** قضاوتِ خودِ آرش — جدا از بدنهٔ تحلیل، تا در ممیزی گم نشود. */
  decisionNote: string | null;
  /**
   * پلی به کارنامهٔ موجود. وقتی این تحلیل به گزارهٔ سطحِ نماد رسید، ردیفی در
   * `signals` منتشر می‌شود و idش اینجا ثبت می‌گردد. **کارنامهٔ عمومی همچنان
   * فقط `signals` است** — این مدل رقیبش نیست.
   */
  publishedSignalIds: string[];
  publishedAt: string | null;
  prevHash: string;
  recordHash: string;
  createdAt: string;
}

// ── اثر ─────────────────────────────────────────────────────────────────────

export const EFFECT_TARGETS = ["asset_class", "symbol", "index", "fx", "commodity"] as const;
export type EffectTarget = (typeof EFFECT_TARGETS)[number];

export const EFFECT_DIRECTIONS = ["up", "down", "unclear"] as const;
export type EffectDirection = (typeof EFFECT_DIRECTIONS)[number];

/**
 * بزرگیِ اثر **باند** است، نه عدد.
 *
 * دو دلیل: (۱) قانونِ CLAUDE.md که ارزش‌گذاری همیشه بازه است نه رقمِ واحد؛
 * (۲) اگر روزی این داده به LLM برسد، عددِ خامِ مالی نباید همراهش برود.
 */
export const MAGNITUDE_BANDS = ["low", "medium", "high"] as const;
export type MagnitudeBand = (typeof MAGNITUDE_BANDS)[number];

export interface IntelEffect {
  id: string;
  analysisId: string;
  eventId: string | null;
  target: EffectTarget;
  /** مثلاً `USDIRR`، `شستا`، `TEDPIX`. */
  targetKey: string;
  direction: EffectDirection;
  magnitudeBand: MagnitudeBand;
  horizon: string | null;
  confidence: number;
  createdAt: string;
}

// ── سبدِ مرجع ───────────────────────────────────────────────────────────────

export const PORTFOLIO_DIRECTIONS = ["increase", "decrease", "hold"] as const;
export type PortfolioDirection = (typeof PORTFOLIO_DIRECTIONS)[number];

export interface IntelPortfolioEffect {
  id: string;
  analysisId: string;
  assetClass: string;
  suggestedDirection: PortfolioDirection;
  rationale: string;
  createdAt: string;
}

/**
 * وزنِ واقعیِ سبدِ مرجع — **append-only**.
 *
 * ⚠️ این سبدِ **آرش** است، نه سبدِ کاربر. `portfolios` و `portfolio_versions`
 * دست‌نخورده می‌مانند؛ قاطی‌کردنشان RLS مالکیتی را خراب می‌کند.
 */
export interface IntelReferencePosition {
  id: string;
  seq: number;
  assetClass: string;
  weightPct: number;
  reasonAnalysisId: string | null;
  /** **اجباری.** تغییرِ وزنِ بی‌دلیل، همان چیزی است که کارنامه را بی‌ارزش می‌کند. */
  reasonText: string;
  effectiveAt: string;
  createdAt: string;
}

// ── اصلاح ───────────────────────────────────────────────────────────────────

/**
 * اصلاح **ردیفِ تازه** است، نه ویرایشِ ردیفِ قبلی.
 * تحلیلِ اشتباه پاک نمی‌شود؛ `status='superseded'` می‌شود و اصلاحش اینجا می‌آید.
 */
export interface IntelCorrection {
  id: string;
  analysisId: string;
  correctionMd: string;
  reason: string;
  createdBy: string | null;
  createdAt: string;
}

// ── راستی‌آزمایی‌های سبک (بدونِ وابستگی به دیتابیس) ─────────────────────────

export function isValidConfidence(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 100;
}

/** سناریو برچسب می‌خواهد؛ واقعیت و استنباط نمی‌خواهند. */
export function isScenarioLabelConsistent(kind: ClaimKind, label: ScenarioLabel | null): boolean {
  return kind === "SCENARIO" ? label !== null : label === null;
}

/**
 * یک ادعا وقتی «قابلِ انتشار» است که هر سه شرط را داشته باشد.
 * عمداً تابعِ خالص است تا هم UI و هم آزمون‌ها یک تعریف داشته باشند.
 */
export function isPublishableClaim(claim: Pick<IntelClaim, "evidenceId" | "confidence" | "kind" | "scenarioLabel">): boolean {
  return (
    typeof claim.evidenceId === "string" &&
    claim.evidenceId.length > 0 &&
    isValidConfidence(claim.confidence) &&
    isScenarioLabelConsistent(claim.kind, claim.scenarioLabel)
  );
}
