// خواندن گزارش‌های کدال از Supabase (جدول codal_reports که رلهٔ لیارا پر می‌کند).
// قرارداد خروجی همان SymbolFundamentals رجیستری است تا UI بدون تغییر کار کند.
//
// قواعد انتخاب (append-only بودن جدول یعنی نسخه‌های تکراری وجود دارد):
// ۱) فقط ردیف‌هایی که data دارند (پارس موفق).
// ۲) بالاترین raw.parser_version برای هر اطلاعیه (پسوند #pvN در source_url).
// ۳) برای هر (period_end, period_months): جداگانه بر تلفیقی، حسابرسی‌شده بر نشده،
//    اصلاحیه بر اولیه، انتشارِ دیرتر، سپس id — جزئیات در `dedupeByPeriod`.
// ۴) n10 اصلی صفحه = جدیدترین گزارش سالانه (۱۲ماهه)؛ اگر نبود جدیدترین میان‌دوره.
// ۵) سری روند فروش از دل همهٔ دوره‌های ۱۲ماههٔ موجود ساخته می‌شود.

import type {
  CodalN10Data,
  CodalN30Data,
  SymbolFundamentals,
} from "./types";

export interface CodalRow {
  id: number;
  symbol: string;
  report_kind: string;
  period_end: string | null;
  title: string | null;
  source_url: string | null;
  data: (CodalN10Data | CodalN30Data) & Record<string, unknown>;
  raw: {
    parser_version?: number;
    audited?: boolean;
    period_months?: number;
    period_end_jalali?: string;
    announcement_link?: string | null;
    /** تاریخِ انتشار در کدال، جلالی با رقمِ فارسی — «۱۴۰۴/۰۴/۱۳». */
    date_publish?: string;
    /** ساعتِ انتشار در کدال، رقمِ فارسی — «۱۵:۱۴:۴۰». */
    time_publish?: string;
  } | null;
}

const REVALIDATE_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; value: SymbolFundamentals | null }>();

function env(): { url: string; anon: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return { url: url.replace(/\/+$/, ""), anon };
}

/**
 * سقفِ ردیف برای هر نوعِ گزارش. هر برش باید **قدیمی‌ترین دوره‌ها** را کنار بگذارد،
 * نه تازه‌ترین را — پس مرتب‌سازی روی `period_end` است، نه `id`.
 *
 * پیش‌تر یک پرس‌وجوی مشترک با `order=id.desc&limit=120` بود. امروز بیشینه ۷۰
 * ردیف در هر نماد است، ولی جدول append-only است و هر اجرای دوبارهٔ پارسر
 * (`#pvN` تازه) همهٔ ردیف‌ها را دوباره درج می‌کند؛ و `id` ترتیبِ درج است که در
 * بک‌فیلِ آرشیو **برعکسِ** زمانِ انتشار بود. برشِ `id` می‌توانست گزارشِ تازه را
 * بیندازد و هیچ نشانه‌ای نمی‌داد.
 */
export const FETCH_LIMITS = { "ن-۱۰": 400, "ن-۳۰": 200 } as const;

export function fetchQueries(symbol: string): Array<{ kind: keyof typeof FETCH_LIMITS; qs: URLSearchParams }> {
  return (Object.keys(FETCH_LIMITS) as Array<keyof typeof FETCH_LIMITS>).map((kind) => ({
    kind,
    qs: new URLSearchParams({
      select: "id,symbol,report_kind,period_end,title,source_url,data,raw",
      symbol: `eq.${symbol}`,
      report_kind: `eq.${kind}`,
      data: "not.is.null",
      order: "period_end.desc,id.desc",
      limit: String(FETCH_LIMITS[kind]),
    }),
  }));
}

async function fetchRows(symbol: string): Promise<CodalRow[] | null> {
  const e = env();
  if (!e) return null;
  try {
    const parts = await Promise.all(
      fetchQueries(symbol).map(async ({ kind, qs }) => {
        const res = await fetch(`${e.url}/rest/v1/codal_reports?${qs}`, {
          headers: { apikey: e.anon, Authorization: `Bearer ${e.anon}` },
          signal: AbortSignal.timeout(8000),
          next: { revalidate: 600 },
        });
        if (!res.ok) return null;
        const rows = (await res.json()) as CodalRow[];
        if (rows.length >= FETCH_LIMITS[kind]) {
          // برش رخ داد: قدیمی‌ترین دوره‌ها بیرون ماندند. بی‌صدا نباشد.
          console.warn(`codal_reports: ${symbol} ${kind} reached limit ${FETCH_LIMITS[kind]} — oldest periods truncated`);
        }
        return rows;
      }),
    );
    if (parts.some((p) => p === null)) return null;
    return parts.flat() as CodalRow[];
  } catch {
    return null;
  }
}

/** آدرس اطلاعیهٔ codal.ir بدون پسوند نسخهٔ پارسر. */
function cleanUrl(row: CodalRow): string | null {
  const link = row.raw?.announcement_link ?? row.source_url;
  return link ? link.replace(/#pv\d+$/, "") : null;
}

function parserVersion(row: CodalRow): number {
  if (row.raw?.parser_version) return row.raw.parser_version;
  const m = String(row.source_url ?? "").match(/#pv(\d+)$/);
  return m ? Number(m[1]) : 1;
}

/** حذف نسخه‌های تکراری: هر اطلاعیه فقط با بالاترین نسخهٔ پارسر. */
function latestParserRows(rows: CodalRow[]): CodalRow[] {
  const byAnnouncement = new Map<string, CodalRow>();
  for (const r of rows) {
    const key = cleanUrl(r) ?? String(r.id);
    const prev = byAnnouncement.get(key);
    if (!prev || parserVersion(r) > parserVersion(prev)) byAnnouncement.set(key, r);
  }
  return [...byAnnouncement.values()];
}

/**
 * آیا عنوانِ اطلاعیه می‌گوید این یک **اصلاحیه** است.
 *
 * ⚠️ «ي» و «ك» عربی در عنوان‌های کدال واقعاً وجود دارند و اگر نرمال نشوند،
 * «اصلاحيه» با «اصلاحیه» یکی گرفته نمی‌شود و اصلاحیه نامرئی می‌ماند.
 *
 * منبعِ سیگنال عمداً ستونِ `title` است، نه یک کلیدِ تازه در `data`: هر ۳۴۳۹
 * ردیفِ موجود همین حالا عنوان دارند، پس این اصلاح **بدونِ بک‌فیل و بدونِ
 * دست‌زدن به ردیف‌های قدیمی** کار می‌کند. بازنویسیِ سوابق برای رفعِ یک باگِ
 * انتخاب، خودش یک اشتباهِ جداست.
 */
/**
 * آیا عنوانِ اطلاعیه «تلفیقی» است (صورت‌های گروه).
 *
 * B-056: پارسر (`relay/codal.mjs`) اولین جدولِ سود و زیانِ مطابق را برمی‌دارد و
 * آن را در `standalone` می‌گذارد؛ `data.consolidated` در **هیچ** ردیفی پر نیست.
 * در گزارشِ تلفیقی آن جدول ممکن است صورتِ گروه باشد. تا تطبیق با سندِ اصلی،
 * رقمِ این گزارش‌ها به شرکت نسبت داده نمی‌شود.
 */
export function isConsolidatedTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  const norm = String(title).replace(/[يى]/g, "ی").replace(/ك/g, "ک");
  return norm.includes("تلفیقی");
}

export function isAmendmentTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  const norm = String(title).replace(/[يى]/g, "ی").replace(/ك/g, "ک");
  return norm.includes("اصلاحیه");
}

/**
 * زمانِ انتشار در کدال به شکلِ قابلِ مقایسهٔ رشته‌ای — «1404/04/13 15:14:40».
 *
 * `published_at`ِ جدول برای همهٔ ردیف‌ها تهی است (B-045)، ولی خودِ کدال زمانِ
 * انتشار را در `raw.date_publish` و `raw.time_publish` داده و رله نگهش داشته.
 * اندازه‌گیریِ ۱۴۰۵/۰۶/۳۱: هر ۳٬۵۵۳ ردیفِ ن-۱۰ هر دو را دارند و همه به همین
 * شکلِ ثابت‌عرض‌اند، پس مقایسهٔ رشته‌ای همان مقایسهٔ زمانی است.
 *
 * شکلِ نامعتبر یا ناقص → `null`. تاریخِ حدسی ساخته نمی‌شود (قاعدهٔ D2)، و
 * «ندانستن» به تصمیمِ بعدی واگذار می‌شود، نه به یک عددِ ساختگی.
 */
export function publishKey(row: Pick<CodalRow, "raw">): string | null {
  const toLatin = (s: unknown) =>
    String(s ?? "").trim().replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
      .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660));
  const d = toLatin(row.raw?.date_publish);
  const t = toLatin(row.raw?.time_publish);
  if (!/^1[34]\d{2}\/(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])$/.test(d)) return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(t)) return null;
  return `${d} ${t}`;
}

/**
 * برای هر دورهٔ مالی یک گزارش.
 *
 * تقدم، به ترتیب:
 *   ۰. **گزارشِ جداگانهٔ شرکت بر تلفیقی** (دو دامنهٔ متفاوت‌اند — B-056)
 *   ۱. حسابرسی‌شده بر حسابرسی‌نشده
 *   ۲. **اصلاحیه بر نسخهٔ اولیه** (در همان وضعیتِ حسابرسی)
 *   ۳. **زمانِ انتشارِ دیرتر** — فقط وقتی هر دو زمان معلوم باشند
 *   ۴. در تساوی یا نامعلومی، `id` بزرگ‌تر
 *
 * ⚠️ بندِ ۳ (۱۴۰۵/۰۶/۳۱): #150 بندِ ۳ را نداشت و مستقیم به `id` می‌رفت. ولی
 * بک‌فیلِ آرشیوِ کدال از جدید به قدیم درج کرده، پس `id` می‌تواند **برعکسِ** زمانِ
 * انتشار باشد. اندازه‌گیری **درونِ یک دامنه** (پس از بندِ ۰): بندِ ۳ برنده را در
 * ۱۲ دوره عوض می‌کند و فقط در **یک** دوره رقم فرق دارد (پاریز، یک واحد). ارزشِ
 * آن درستیِ ترتیب است، نه تغییرِ امروزِ ارقام.
 *
 * ❌ تصحیح: نسخهٔ قبلیِ همین توضیح فخاس و ذوب را مثالِ «گزارشِ دیرترِ همان دوره»
 * آورده بود. هر دو «گزارشِ دیرتر» **تلفیقی** بودند؛ یعنی بندِ ۳ بدونِ بندِ ۰ کارتِ
 * فخاس را از رقمِ درستِ شرکت (سودِ خالصِ ۷۳٬۳۹۸٬۰۵۱) به رقمِ گروه (۶۱٬۵۳۶٬۵۹۰)
 * می‌برد. بندِ ۰ همین را می‌بندد.
 *
 * چرا بندِ ۳ **زیرِ** اصلاحیه است نه بالای آن: در همهٔ ۸ دوره‌ای که گزارشِ
 * بی‌عنوانِ اصلاحیه دیرتر از یک اصلاحیه منتشر شده، آن گزارش «تلفیقی» است —
 * یعنی گزارشِ دیگری، نه نسخهٔ تازه‌ترِ همان. بالابردنِ زمان جای اصلاحیه را به
 * صورت‌های گروه می‌داد.
 *
 * ── آنچه این تابع **تضمین نمی‌کند** ──────────────────────────────────────
 * «آخرین گزارشِ معتبر قطعاً انتخاب شد» ادعا نمی‌شود. سه ابهامِ باقی‌مانده:
 *   • تشخیصِ اصلاحیه از عنوان است. اصلاحی که کلمهٔ «اصلاحیه» ندارد با بندِ ۳
 *     پیدا می‌شود فقط اگر وضعیتِ حسابرسی و اصلاحیه برابر باشد.
 *   • ۶ گروه زمانِ انتشارِ **دقیقاً یکسان** دارند؛ آنجا `id` تصمیم می‌گیرد.
 *   • دوره‌ای که **فقط** گزارشِ تلفیقی دارد همچنان انتخاب می‌شود، ولی دامنه‌اش
 *     مبهم است: در ۴۸ جفتِ قابلِ مقایسه، `standalone`ِ تلفیقی در ۳۳ بزرگ‌تر، در
 *     ۱۱ برابر و در ۴ کوچک‌تر از جداگانه بود. مصرف‌کننده باید آن را با
 *     `isConsolidatedTitle` برچسب بزند و **قطعی به شرکت نسبت ندهد** (B-056).
 *
 * ⚠️ بندِ ۲ تازه است و یک باگِ واقعی را می‌بندد. پیش از این، انتخاب فقط به
 * `id` تکیه می‌کرد و `id` ترتیبِ **درج** است نه ترتیبِ انتشار: اندازه‌گیریِ
 * فقط‌خواندنیِ پروژهٔ اصلی (۱۴۰۵/۰۶/۲۸) نشان داد در ۲۸۰ دوره‌ای که هم
 * اصلاحیه دارند و هم نسخهٔ اولیه، در **۲۵۷** مورد نسخهٔ اولیه صرفاً به‌خاطر
 * `id` بزرگ‌تر برنده می‌شد — و در **۱۷** مورد اعدادِ دو نسخه واقعاً فرق
 * داشتند. یعنی کارت می‌توانست رقمِ باطل‌شده را نشان بدهد.
 */
export function dedupeByPeriod(rows: CodalRow[]): CodalRow[] {
  const byPeriod = new Map<string, CodalRow>();
  for (const r of rows) {
    const d = r.data as CodalN10Data;
    const key = `${d.period_end}|${d.period_months}`;
    const prev = byPeriod.get(key);
    if (!prev) { byPeriod.set(key, r); continue; }

    // ۰. دامنه: گزارشِ **جداگانهٔ شرکت** بر تلفیقی مقدم است، پیش از هر معیارِ دیگر.
    // کارت دربارهٔ شرکت است؛ `standalone`ِ گزارشِ تلفیقی در ۶۹٪ جفت‌های قابلِ
    // مقایسه از رقمِ جداگانهٔ همان دوره بزرگ‌تر است (B-056)، پس حسابرسی یا
    // اصلاحیه بودنِ آن رقم را به دامنهٔ درست نمی‌برد.
    const pCons = isConsolidatedTitle(prev.title);
    const cCons = isConsolidatedTitle(r.title);
    if (pCons !== cCons) {
      if (!cCons) byPeriod.set(key, r);
      continue;
    }

    const pa = (prev.data as CodalN10Data).audited === true;
    const ca = d.audited === true;
    if (ca !== pa) {
      if (ca) byPeriod.set(key, r);
      continue;
    }

    const pAmend = isAmendmentTitle(prev.title);
    const cAmend = isAmendmentTitle(r.title);
    if (cAmend !== pAmend) {
      if (cAmend) byPeriod.set(key, r);
      continue;
    }

    const pPub = publishKey(prev);
    const cPub = publishKey(r);
    if (pPub && cPub && pPub !== cPub) {
      if (cPub > pPub) byPeriod.set(key, r);
      continue;
    }

    if (r.id > prev.id) byPeriod.set(key, r);
  }
  return [...byPeriod.values()];
}

/** متنِ یکسانِ هشدارِ دامنه برای کارت و فصل‌ها. */
export const CONSOLIDATED_SCOPE_NOTE =
  "این ارقام از گزارشِ تلفیقی استخراج شده‌اند و ممکن است رقمِ گروه باشند، نه شرکتِ اصلی — تطبیق با سندِ کدال انجام نشده.";

/** سال مالی جلالی از period_end مثل "1404-12-29" → 1404. */
function fyOf(d: CodalN10Data): number {
  return Number(String(d.period_end).slice(0, 4)) || 0;
}

function buildFundamentals(symbol: string, rows: CodalRow[]): SymbolFundamentals | null {
  const fresh = latestParserRows(rows);

  const n10all = dedupeByPeriod(
    fresh.filter((r) => r.report_kind === "ن-۱۰" && (r.data as CodalN10Data).standalone),
  ).sort((a, b) => {
    const da = a.data as CodalN10Data;
    const db = b.data as CodalN10Data;
    return db.period_end.localeCompare(da.period_end) || db.period_months - da.period_months;
  });

  const annuals = n10all.filter((r) => (r.data as CodalN10Data).period_months === 12);
  const main = annuals[0] ?? n10all[0] ?? null;

  const n30rows = fresh
    .filter((r) => r.report_kind === "ن-۳۰" && Array.isArray((r.data as CodalN30Data).products))
    .sort((a, b) =>
      (b.data as CodalN30Data).period_end.localeCompare((a.data as CodalN30Data).period_end),
    )
    .slice(0, 26); // T1: تا ۲۶ گزارش ماهانه — پوشش سال مالی جاری + سال قبل برای مقایسه

  if (!main && n30rows.length === 0) return null;

  let n10: SymbolFundamentals["n10"] = null;
  if (main) {
    const d = { ...(main.data as CodalN10Data) };
    // روند فروش چندساله از خود گزارش‌های سالانهٔ موجود (فقط دوره‌های ۱۲ماهه).
    if (!d.sales_trend_5y && annuals.length >= 2) {
      d.sales_trend_5y = annuals
        .map((r) => {
          const a = r.data as CodalN10Data;
          return { fy: fyOf(a), revenue: a.standalone.revenue, cogs: a.standalone.cogs };
        })
        .filter((t) => t.fy > 0 && t.revenue > 0)
        .sort((x, y) => x.fy - y.fy);
    }
    const faDigits = (v: number | string) =>
      String(v).replace(/\d/g, (c) => "۰۱۲۳۴۵۶۷۸۹"[Number(c)]);
    const periodLabel = d.period_months === 12 ? "۱۲ماههٔ" : `${faDigits(d.period_months)}ماههٔ`;
    const consolidated = isConsolidatedTitle(main.title);
    n10 = {
      data: d,
      source: {
        title: `صورت‌های مالی ${periodLabel} ${d.audited ? "حسابرسی‌شدهٔ" : "حسابرسی‌نشدهٔ"} سال مالی ${faDigits(fyOf(d))}${consolidated ? " — گزارشِ تلفیقی" : ""} (کدال)`,
        source_url: cleanUrl(main),
        // «اعتبارسنجی متقاطع» فقط حسابی است (ناخالص = فروش − بها) و دامنه را اثبات
        // نمی‌کند؛ برای گزارشِ تلفیقی تیکِ سبز گمراه‌کننده بود (B-056).
        verified: !consolidated,
        verification_note: consolidated
          ? CONSOLIDATED_SCOPE_NOTE
          : "استخراج خودکار از اکسل رسمی کدال با اعتبارسنجی حسابی (ناخالص = فروش − بها)",
        scope: consolidated ? "consolidated_ambiguous" : "company",
      },
    };
  }

  let n30: SymbolFundamentals["n30"] = null;
  if (n30rows.length > 0) {
    n30 = {
      data: n30rows.map((r) => r.data as CodalN30Data),
      source: {
        title: "گزارش‌های فعالیت ماهانه (ن-۳۰) کدال",
        source_url: cleanUrl(n30rows[0]),
        verified: true,
      },
    };
  }

  // T3: همهٔ دوره‌های ن-۱۰ برای فصل‌سازی تفاضلی (dedup نسخهٔ پارسر قبلاً انجام شده؛
  // تقدم حسابرسی‌شده/اصلاحیه در خود lib/core/quarterly با id انجام می‌شود).
  // ⚠️ از `n10all` (خروجیِ `dedupeByPeriod`) ساخته می‌شود، نه از `fresh`.
  //
  // پیش‌تر همهٔ نسخه‌های انتخاب‌نشده اینجا می‌رفتند و `lib/core/quarterly`
  // دوباره با قاعدهٔ **قدیمیِ** خودش (حسابرسی ← `id`) انتخاب می‌کرد — یک موتورِ
  // انتخابِ موازی که نه اصلاحیه را می‌دید نه زمانِ انتشار را. نتیجه: اصلاحِ
  // #150 به کارتِ اصلی رسید ولی **هرگز** به فصل‌ها، TTM و P/Eِ همان صفحه نرسید؛
  // یک صفحه، دو پاسخ برای یک دوره. حالا انتخاب یک‌بار و یک‌جا انجام می‌شود و
  // `dedupePeriods`ِ فصلی با یک ردیف در هر دوره عملاً بی‌اثر است.
  //
  // دامنه در زنجیرهٔ فصلی (B-056): Q2 = ۶ماهه − ۳ماهه. اگر ۳ماهه جداگانه و ۶ماهه
  // تلفیقی باشد، تفاضل رقمِ گروه منهای رقمِ شرکت است — عددی بی‌معنا با ظاهرِ
  // دقیق. پس در هر سالِ مالی که گزارشِ جداگانه دارد، گزارش‌های تلفیقیِ همان سال
  // کنار می‌روند؛ حلقهٔ غایب فصل را null می‌کند (قاعدهٔ D2)، نه حدس.
  const fyHasCompany = new Set(
    n10all.filter((r) => !isConsolidatedTitle(r.title)).map((r) => fyOf(r.data as CodalN10Data)),
  );
  const periodRows = n10all.filter(
    (r) => !isConsolidatedTitle(r.title) || !fyHasCompany.has(fyOf(r.data as CodalN10Data)),
  );
  const n10Periods = periodRows.map((r) => ({ id: r.id, data: r.data as CodalN10Data }));
  const n10PeriodsScope: SymbolFundamentals["n10PeriodsScope"] = periodRows.some((r) => isConsolidatedTitle(r.title))
    ? "consolidated_ambiguous"
    : "company";

  return {
    symbol,
    n10,
    n30,
    n10Periods: n10Periods.length > 0 ? n10Periods : undefined,
    n10PeriodsScope: n10Periods.length > 0 ? n10PeriodsScope : undefined,
  };
}

/** دادهٔ بنیادی نماد از Supabase؛ نبودِ داده یا خطا → null (بدون عدد ساختگی). */
export async function getFundamentalsFromSupabase(
  symbol: string,
): Promise<SymbolFundamentals | null> {
  const hit = cache.get(symbol);
  if (hit && Date.now() - hit.at < REVALIDATE_MS) return hit.value;
  const rows = await fetchRows(symbol);
  const value = rows && rows.length > 0 ? buildFundamentals(symbol, rows) : null;
  // خطای شبکه (rows=null) کش نمی‌شود تا درخواست بعدی دوباره تلاش کند.
  if (rows !== null) cache.set(symbol, { at: Date.now(), value });
  return value;
}
