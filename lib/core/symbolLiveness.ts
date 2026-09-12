/**
 * زندگیِ نماد — «این ردیف کهنه است، یا این نماد دیگر معامله نمی‌شود؟»
 *
 * ── نقصی که این ماژول می‌بندد ───────────────────────────────────────────────
 * اندازه‌گیریِ ۱۴۰۵/۰۶/۲۱ روی Production: از ۱٬۱۳۴ نمادِ `symbol_history`،
 * ۶۹ تا آخرین روزِ معاملاتیِ بازار را ندارند. تا امروز هر ۶۹ تا **دقیقاً مثلِ
 * یک نمادِ زنده** رندر می‌شدند — آخرین قیمتِ ثبت‌شده بدونِ هیچ نشانه‌ای از
 * سنِ آن. نمادی که آخرین ردیفش از ۲۰۱۸ است در کنارِ نمادی که امروز معامله
 * شده نشسته بود.
 *
 * ── دو چیزی که خیلی شبیه‌اند و یکی نیستند ──────────────────────────────────
 * همان اندازه‌گیری نشان داد آن ۶۹ تا **دو چیزِ متفاوت‌اند**:
 *
 *   ۲۱ تا **همین حالا روی تابلوی زنده هستند** ولی تاریخچه‌شان عقب است
 *        ⇒ نماد زنده است، **لولهٔ ما** عقب مانده. نقصِ ماست.
 *   ۴۸ تا روی تابلو **هم نیستند**
 *        ⇒ متوقف/حذف‌شده. نقصِ ما نیست، ولی خواننده باید بداند.
 *
 * تفاوتشان را نمی‌شود از سنِ ردیف حدس زد — فقط از حضور روی تابلو فهمید. پس
 * حضور روی تابلو ورودیِ اجباریِ این تابع است، نه یک اختیارِ اضافه.
 *
 * ── و یک تله‌ی سوم: «بازار بسته» در برابر «فید خراب» ────────────────────────
 * وقتی هیچ نمادی دادهٔ امروز ندارد، دو تفسیر هست و با هم زمین تا آسمان فرق
 * دارند. مرجعِ تصمیم **سنِ خودِ تابلو** است، نه تعدادِ ردیف‌ها: تابلوی تازه با
 * صفر معامله یعنی بازار بسته؛ تابلوی کهنه یعنی فید خراب. وقتی فید خراب باشد
 * «روی تابلو هست» دربارهٔ **هیچ‌کس** معلوم نیست، پس رأیِ تک‌تکِ نمادها به
 * `undetermined` می‌رود — نه به یک حدسِ خوش‌بینانه.
 *
 * ── مرزها ──────────────────────────────────────────────────────────────────
 * • تابعِ خالص؛ هیچ I/O و هیچ ساعتِ سیستمی — `now` و `today` تزریق می‌شوند.
 * • هیچ عددِ ساختگی: دادهٔ نبوده `null` می‌ماند.
 * • خروجی توصیفی است؛ هیچ جهت‌گیری و هیچ اقدامی از آن درنمی‌آید.
 */

/** رأی دربارهٔ یک نماد. */
export type SymbolLiveness =
  | "live"          // آخرین ردیف = آخرین روزِ معاملاتیِ مجموعه
  | "lagging"       // عقب است، ولی نماد همین حالا روی تابلو هست ⇒ نقصِ لولهٔ ما
  | "off_board"     // عقب است و روی تابلو هم نیست ⇒ متوقف یا حذف‌شده
  | "undetermined"  // فید خراب است؛ «روی تابلو بودن» دربارهٔ هیچ‌کس معلوم نیست
  | "invalid_date"  // آخرین ردیف تاریخِ آینده دارد ⇒ دادهٔ معیوب، نه تازه
  | "never_seen";   // هیچ ردیفی نداریم — با «صفر» یکی نیست

/** رأی دربارهٔ خودِ فید. */
export type FeedVerdict =
  | "trading"    // تابلو تازه است و معامله جریان دارد
  | "closed"     // تابلو تازه است ولی هیچ معامله‌ای نیست ⇒ بازار بسته
  | "feed_down"  // تابلو کهنه یا خالی است ⇒ ما نمی‌بینیم
  | "unknown";   // ورودیِ کافی برای قضاوت نداریم

/** بعد از این مدت، تابلو دیگر «امروز» نیست. */
export const BOARD_DOWN_AFTER_MIN = 60;

/** بیش از این اختلاف به آینده = ساعتِ نامعتبر. */
const MAX_FUTURE_SKEW_MS = 2 * 60 * 1000;

export interface SymbolRow {
  symbol: string;
  /** `YYYY-MM-DD` — بیشینهٔ `trade_date` این نماد. `null` یعنی هیچ ردیفی نیست. */
  lastTradeDate: string | null;
  /** آیا همین حالا در اسنپ‌شاتِ زندهٔ تابلو دیده می‌شود. */
  onBoard: boolean;
}

export interface FeedInput {
  /** زمانی که رله تابلو را گرفت (ms). `null` یعنی نمی‌دانیم. */
  boardFetchedAt: number | null;
  now: number;
  /** چند ابزار روی تابلو بود. */
  boardSymbols: number;
  /** از آنها چند تا امروز حجمِ معاملهٔ بزرگ‌تر از صفر داشتند. */
  boardWithVolume: number;
}

export interface FeedAssessment {
  verdict: FeedVerdict;
  /** سنِ تابلو به دقیقه؛ `null` وقتی مهرِ زمانیِ معتبری نیست. */
  ageMin: number | null;
  /** چرا این رأی — همیشه عدد، نه لحن. */
  driver: string;
}

export interface LivenessRow {
  symbol: string;
  state: SymbolLiveness;
  /** فاصلهٔ آخرین ردیف تا آخرین روزِ معاملاتیِ مجموعه، به روز. `null` وقتی بی‌معناست. */
  behindDays: number | null;
  /** جملهٔ کوتاهِ علت — برای نمایشِ مستقیم. */
  why: string;
}

export interface LivenessReport {
  feed: FeedAssessment;
  rows: LivenessRow[];
  counts: Record<SymbolLiveness, number>;
  /** سهمِ نمادهایی که آخرین روزِ معاملاتی را دارند (۰ تا ۱). `null` وقتی نمادی نیست. */
  coverageOnLastDay: number | null;
  /** بیشینهٔ `lastTradeDate` در کلِ ورودی. `null` وقتی هیچ تاریخِ معتبری نیست. */
  marketLastTradeDate: string | null;
}

/* ── کمک‌ابزارهای تاریخ ───────────────────────────────────────────────────── */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `YYYY-MM-DD` → شمارهٔ روزِ UTC. `null` برای ورودیِ بدشکل یا ناموجود. */
export function isoDayNumber(iso: string | null | undefined): number | null {
  if (typeof iso !== "string" || !ISO_DATE.test(iso)) return null;
  const ms = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(ms)) return null;
  return Math.floor(ms / 86_400_000);
}

/* ── رأی دربارهٔ فید ──────────────────────────────────────────────────────── */

export function assessFeed(input: FeedInput): FeedAssessment {
  const { boardFetchedAt, now, boardSymbols, boardWithVolume } = input;

  let ageMin: number | null = null;
  if (typeof boardFetchedAt === "number" && Number.isFinite(boardFetchedAt) && boardFetchedAt > 0) {
    const diff = now - boardFetchedAt;
    // مهرِ زمانیِ آینده بی‌اعتماد است — نه «خیلی تازه».
    if (diff >= -MAX_FUTURE_SKEW_MS) ageMin = Math.max(0, Math.round(diff / 60_000));
  }

  if (ageMin === null) {
    return { verdict: "unknown", ageMin: null, driver: "مهرِ زمانیِ تابلو معتبر نیست" };
  }
  if (ageMin > BOARD_DOWN_AFTER_MIN) {
    return { verdict: "feed_down", ageMin, driver: `سنِ تابلو ${ageMin} دقیقه (آستانه ${BOARD_DOWN_AFTER_MIN})` };
  }
  if (boardSymbols <= 0) {
    return { verdict: "feed_down", ageMin, driver: "تابلو تازه است ولی هیچ ابزاری ندارد" };
  }
  if (boardWithVolume <= 0) {
    return { verdict: "closed", ageMin, driver: `${boardSymbols} ابزار روی تابلو، هیچ‌کدام حجمِ امروز ندارند` };
  }
  return {
    verdict: "trading",
    ageMin,
    driver: `${boardWithVolume} از ${boardSymbols} ابزار امروز حجم داشتند`,
  };
}

/* ── رأی دربارهٔ یک نماد ──────────────────────────────────────────────────── */

export function classifySymbol(
  row: SymbolRow,
  marketLastDay: number | null,
  today: number | null,
  feedTrusted: boolean,
): LivenessRow {
  const last = isoDayNumber(row.lastTradeDate);

  if (last === null) {
    return {
      symbol: row.symbol,
      state: "never_seen",
      behindDays: null,
      why: "هیچ ردیفِ تاریخی برای این نماد نداریم",
    };
  }
  if (today !== null && last > today) {
    return {
      symbol: row.symbol,
      state: "invalid_date",
      behindDays: null,
      why: `آخرین ردیف تاریخِ آینده دارد (${row.lastTradeDate})`,
    };
  }
  if (marketLastDay === null || last >= marketLastDay) {
    return {
      symbol: row.symbol,
      state: "live",
      behindDays: 0,
      why: "آخرین روزِ معاملاتیِ مجموعه را دارد",
    };
  }

  const behindDays = marketLastDay - last;
  if (!feedTrusted) {
    return {
      symbol: row.symbol,
      state: "undetermined",
      behindDays,
      why: `${behindDays} روز عقب است، ولی چون تابلو در دسترس نیست علتش معلوم نیست`,
    };
  }
  if (row.onBoard) {
    return {
      symbol: row.symbol,
      state: "lagging",
      behindDays,
      why: `نماد روی تابلو هست ولی ${behindDays} روز از تاریخچه‌اش ثبت نشده`,
    };
  }
  return {
    symbol: row.symbol,
    state: "off_board",
    behindDays,
    why: `${behindDays} روز است نه ردیفی ثبت شده و نه روی تابلو دیده می‌شود`,
  };
}

/* ── گزارشِ کامل ─────────────────────────────────────────────────────────── */

const EMPTY_COUNTS: Record<SymbolLiveness, number> = {
  live: 0, lagging: 0, off_board: 0, undetermined: 0, invalid_date: 0, never_seen: 0,
};

export function buildLivenessReport(rows: SymbolRow[], feed: FeedInput): LivenessReport {
  const assessment = assessFeed(feed);
  // «فید خراب» تنها حالتی است که حضور روی تابلو را بی‌معنا می‌کند. «بازار
  // بسته» این کار را نمی‌کند: تابلوی تازهٔ یک روزِ تعطیل همچنان می‌گوید چه
  // نمادهایی وجود دارند.
  const feedTrusted = assessment.verdict === "trading" || assessment.verdict === "closed";

  const today = isoDayNumber(isoOf(feed.now));

  let marketLastDay: number | null = null;
  let marketLastIso: string | null = null;
  for (const r of rows) {
    const d = isoDayNumber(r.lastTradeDate);
    if (d === null) continue;
    // تاریخِ آینده نباید مبنای «آخرین روزِ معاملاتی» شود، وگرنه یک ردیفِ معیوب
    // کلِ مجموعه را «عقب» نشان می‌دهد.
    if (today !== null && d > today) continue;
    if (marketLastDay === null || d > marketLastDay) {
      marketLastDay = d;
      marketLastIso = r.lastTradeDate;
    }
  }

  const out: LivenessRow[] = [];
  const counts: Record<SymbolLiveness, number> = { ...EMPTY_COUNTS };
  for (const r of rows) {
    const cls = classifySymbol(r, marketLastDay, today, feedTrusted);
    counts[cls.state] += 1;
    out.push(cls);
  }

  return {
    feed: assessment,
    rows: out,
    counts,
    coverageOnLastDay: rows.length > 0 ? counts.live / rows.length : null,
    marketLastTradeDate: marketLastIso,
  };
}

/** `now` (ms) → `YYYY-MM-DD` به وقتِ تهران. */
function isoOf(now: number): string | null {
  if (!Number.isFinite(now) || now <= 0) return null;
  // `en-CA` تاریخ را دقیقاً `YYYY-MM-DD` می‌دهد — بدونِ ساختنِ دستیِ رشته.
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date(now));
  } catch {
    return null;
  }
}
