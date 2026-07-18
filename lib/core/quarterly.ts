// T3 — تحلیل فصلی از گزارش‌های تجمیعی ن-۱۰ (هستهٔ علمی، بدون I/O).
//
// گزارش‌های ن-۱۰ تجمیعی‌اند (۳/۶/۹/۱۲ماهه از ابتدای سال مالی).
// فصل‌سازی با «تفاضل زنجیره‌ای» در همان سال مالی:
//   Q1 = ۳ماهه، Q2 = ۶ماهه − ۳ماهه، Q3 = ۹ماهه − ۶ماهه، Q4 = ۱۲ماهه − ۹ماهه.
//
// قواعد سخت (قانون ۲ حاکم — هیچ عدد ساختگی):
// - حلقهٔ غایب در زنجیره → آن فصل null؛ هرگز تقسیم یا درون‌یابی نمی‌شود.
// - دو نسخه از یک دوره: «حسابرسی‌شده» مقدم؛ سپس اصلاحیهٔ متأخر (بزرگ‌ترین id).
// - تفاضل منفیِ نامعقول در درآمد (تعدیل گزارش قبلی) → فصل null + پرچم adjusted.
// - EPS TTM فقط با ۴ فصل متوالیِ کامل؛ در غیر این صورت نقطه‌ای وجود ندارد.
//
// واحد مبالغ: میلیون ریال (مطابق موتور پارس کدال). eps بر حسب ریال.

export interface QuarterInput {
  /** شناسهٔ یکتای ردیف در codal_reports — برای تقدم اصلاحیهٔ متأخر. */
  id: number;
  /** پایان دورهٔ جلالی مثل "1404-06-31". */
  period_end: string;
  /** طول دورهٔ تجمیعی: ۳ | ۶ | ۹ | ۱۲. */
  period_months: number;
  audited: boolean;
  /** سرمایه (میلیون ریال) — برای EPS TTM. */
  capital: number;
  revenue: number;
  gross_profit: number;
  operating_profit: number;
  net_profit: number;
}

/** یک فصل مشتق‌شده؛ مقادیر null یعنی زنجیرهٔ لازم موجود نبود. */
export interface DerivedQuarter {
  /** سال مالی جلالی (سال period_end گزارش ۱۲ماهه یا ابتدای زنجیره). */
  fy: number;
  /** شمارهٔ فصل ۱..۴. */
  q: 1 | 2 | 3 | 4;
  /** برچسب مثل "Q1 1404". */
  label: string;
  /** پایان دورهٔ تجمیعیِ متناظر (جلالی) — برای یافتن قیمت پایان فصل. */
  periodEnd: string;
  revenue: number | null;
  grossProfit: number | null;
  operatingProfit: number | null;
  netProfit: number | null;
  /** حاشیه‌ها (٪ از درآمد فصل)؛ فقط وقتی درآمد فصل > 0. */
  grossMargin: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  /** true یعنی تفاضل منفی نامعقول در درآمد دیده شد (تعدیل) و فصل null شد. */
  adjusted: boolean;
  /** سرمایهٔ گزارش انتهای زنجیرهٔ همین فصل (میلیون ریال). */
  capital: number | null;
}

export interface TtmPoint {
  /** برچسب فصل انتهایی پنجره مثل "Q2 1404". */
  label: string;
  /** پایان دورهٔ فصل انتهایی (جلالی) — قیمت پایانی همین تاریخ ملاک است. */
  periodEnd: string;
  /** سود خالص ۴ فصل متوالی (میلیون ریال). */
  netProfitTtm: number;
  /** EPS TTM (ریال) = netProfitTtm × ۱۰۰۰ ÷ سرمایهٔ آخرین فصل پنجره. */
  epsTtm: number;
}

/* ---------- انتخاب نسخهٔ معتبر هر دوره ---------- */

/** برای هر (fy, months) یک گزارش: حسابرسی‌شده مقدم، سپس id بزرگ‌تر (اصلاحیهٔ متأخر). */
export function dedupePeriods(reports: QuarterInput[]): Map<string, QuarterInput> {
  const byPeriod = new Map<string, QuarterInput>();
  for (const r of reports) {
    if (!r || !r.period_end || ![3, 6, 9, 12].includes(r.period_months)) continue;
    const fy = fyOf(r);
    if (!fy) continue;
    const key = `${fy}|${r.period_months}`;
    const prev = byPeriod.get(key);
    if (!prev) {
      byPeriod.set(key, r);
      continue;
    }
    if (r.audited && !prev.audited) byPeriod.set(key, r);
    else if (r.audited === prev.audited && r.id > prev.id) byPeriod.set(key, r);
  }
  return byPeriod;
}

/** سال مالی = سال جلالیِ پایان دوره منهای صفر/یک بسته به ماه — چون period_end تجمیعی
 * درون همان سال مالی است، سال مالی را از پایانِ دورهٔ ۱۲ماهه یا از خود دوره می‌گیریم.
 * سادهٔ صادق: fy = سال جلالی پایان سال مالی. برای دوره‌های میانی (۳/۶/۹ماهه) پایان دوره
 * ممکن است در سال تقویمی قبل از پایان سال مالی باشد (سال مالی غیرتقویمی).
 * قاعدهٔ به‌کاررفته: fy از پایان دورهٔ ۱۲ماههٔ همان زنجیره؛ اگر نبود، از تخمین
 * end-of-FY = period_end + (12 − months) ماه استفاده نمی‌کنیم (حدس ممنوع) —
 * بلکه زنجیره را با «فاصلهٔ ماه» گروه می‌کنیم: دو دوره هم‌زنجیره‌اند اگر
 * پایان‌هایشان دقیقاً به اندازهٔ اختلاف months (در تقویم جلالی) فاصله داشته باشد.
 * برای سادگی و درستیِ قابل‌آزمون، از «سال شروع دوره» استفاده می‌کنیم:
 * شروع = period_end منهای months ماه؛ سال مالی = سال جلالی ماهِ بعد از شروع. */
export function fyOf(r: QuarterInput): number {
  const m = String(r.period_end).match(/^(\d{4})-(\d{2})/);
  if (!m) return 0;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  // شروع دوره = (y, mo) منهای months ماه + ۱ ماه (ماه اول دوره)
  let total = y * 12 + (mo - 1) - r.period_months; // ماهِ قبل از شروع
  total += 1; // ماه اول دوره
  const startYear = Math.floor(total / 12);
  return startYear;
}

/* ---------- فصل‌سازی با تفاضل زنجیره‌ای ---------- */

const FIELDS = ["revenue", "gross_profit", "operating_profit", "net_profit"] as const;

function toQuarter(
  fy: number,
  q: 1 | 2 | 3 | 4,
  cur: QuarterInput | undefined,
  prev: QuarterInput | undefined,
): DerivedQuarter {
  const label = `Q${q} ${fy}`;
  const empty: DerivedQuarter = {
    fy,
    q,
    label,
    periodEnd: cur?.period_end ?? "",
    revenue: null,
    grossProfit: null,
    operatingProfit: null,
    netProfit: null,
    grossMargin: null,
    operatingMargin: null,
    netMargin: null,
    adjusted: false,
    capital: cur?.capital && cur.capital > 0 ? cur.capital : null,
  };
  if (!cur) return empty;
  if (q === 1) {
    // Q1 مستقیم از گزارش ۳ماهه
    const rev = cur.revenue;
    return finalize(empty, rev, cur.gross_profit, cur.operating_profit, cur.net_profit);
  }
  if (!prev) return empty; // حلقهٔ غایب → null (هرگز تقسیم نمی‌کنیم)
  const rev = cur.revenue - prev.revenue;
  if (rev < 0) {
    // تعدیل گزارش قبلی — فصل نامعتبر است؛ پرچم بزنیم و null بدهیم.
    return { ...empty, adjusted: true };
  }
  return finalize(
    empty,
    rev,
    cur.gross_profit - prev.gross_profit,
    cur.operating_profit - prev.operating_profit,
    cur.net_profit - prev.net_profit,
  );
}

function finalize(
  base: DerivedQuarter,
  revenue: number,
  gross: number,
  op: number,
  net: number,
): DerivedQuarter {
  const margins =
    revenue > 0
      ? {
          grossMargin: (gross / revenue) * 100,
          operatingMargin: (op / revenue) * 100,
          netMargin: (net / revenue) * 100,
        }
      : { grossMargin: null, operatingMargin: null, netMargin: null };
  return {
    ...base,
    revenue,
    grossProfit: gross,
    operatingProfit: op,
    netProfit: net,
    ...margins,
  };
}

/** فصل‌سازی همهٔ سال‌های مالی موجود؛ خروجی مرتب از قدیم به جدید. */
export function deriveQuarters(reports: QuarterInput[]): DerivedQuarter[] {
  const byPeriod = dedupePeriods(reports);
  const fys = new Set<number>();
  for (const key of byPeriod.keys()) fys.add(Number(key.split("|")[0]));
  const out: DerivedQuarter[] = [];
  for (const fy of [...fys].sort((a, b) => a - b)) {
    const m3 = byPeriod.get(`${fy}|3`);
    const m6 = byPeriod.get(`${fy}|6`);
    const m9 = byPeriod.get(`${fy}|9`);
    const m12 = byPeriod.get(`${fy}|12`);
    if (!m3 && !m6 && !m9 && !m12) continue;
    out.push(toQuarter(fy, 1, m3, undefined));
    out.push(toQuarter(fy, 2, m6, m3));
    out.push(toQuarter(fy, 3, m9, m6));
    out.push(toQuarter(fy, 4, m12, m9));
  }
  // فصل‌های انتهایی که هنوز گزارش ندارند (آیندهٔ سال جاری) حذف می‌شوند:
  // از انتها تا اولین فصل دارای دادهٔ واقعی یا پرچم adjusted، فصل‌های تمام-null بدون گزارش حذف.
  while (out.length > 0) {
    const last = out[out.length - 1];
    if (last.revenue === null && !last.adjusted && last.periodEnd === "") out.pop();
    else break;
  }
  return out;
}

/* ---------- P/E TTM ---------- */

/** نقاط EPS TTM: فقط پنجره‌های ۴ فصل «متوالی و کامل» (netProfit همهٔ ۴ فصل موجود).
 * متوالی یعنی (fy, q) پشت‌سرهم بدون گپ. */
export function ttmSeries(quarters: DerivedQuarter[]): TtmPoint[] {
  const seq = quarters.filter((q) => q.periodEnd !== "" || q.revenue !== null || q.adjusted);
  const out: TtmPoint[] = [];
  for (let i = 3; i < seq.length; i++) {
    const win = [seq[i - 3], seq[i - 2], seq[i - 1], seq[i]];
    // توالی بدون گپ
    let consecutive = true;
    for (let k = 1; k < 4; k++) {
      const a = win[k - 1];
      const b = win[k];
      const expectedQ = a.q === 4 ? 1 : a.q + 1;
      const expectedFy = a.q === 4 ? a.fy + 1 : a.fy;
      if (b.q !== expectedQ || b.fy !== expectedFy) {
        consecutive = false;
        break;
      }
    }
    if (!consecutive) continue;
    if (win.some((w) => w.netProfit === null)) continue; // ۴ فصل کامل شرط سخت
    const last = win[3];
    if (!last.capital || last.capital <= 0 || !last.periodEnd) continue;
    const netTtm = win.reduce((s, w) => s + (w.netProfit as number), 0);
    out.push({
      label: last.label,
      periodEnd: last.periodEnd,
      netProfitTtm: netTtm,
      // سرمایه میلیون ریال، سهم ۱۰۰۰ریالی → تعداد سهم = capital×۱۰۰۰؛
      // EPS = سود(میلیون ریال)×۱۰^۶ ÷ (capital×۱۰۰۰) = سود×۱۰۰۰÷capital (ریال).
      epsTtm: (netTtm * 1000) / last.capital,
    });
  }
  return out;
}

/** P/E یک نقطه: قیمت (ریال) ÷ EPS TTM (ریال)؛ فقط EPS مثبت. */
export function peOf(priceRial: number | null, epsTtm: number): number | null {
  if (priceRial == null || !isFinite(priceRial) || priceRial <= 0) return null;
  if (!isFinite(epsTtm) || epsTtm <= 0) return null;
  return priceRial / epsTtm;
}

/** میانگین سادهٔ مقادیر غیر-null؛ کمتر از ۲ مقدار → null. */
export function avgOf(values: Array<number | null>): number | null {
  const v = values.filter((x): x is number => x != null && isFinite(x));
  if (v.length < 2) return null;
  return v.reduce((s, x) => s + x, 0) / v.length;
}

/** میانگین متحرک ۴فصلهٔ یک سری حاشیه؛ نقطهٔ i فقط وقتی هر ۴ مقدار اخیر موجود باشد. */
export function rolling4(values: Array<number | null>): Array<number | null> {
  return values.map((_, i) => {
    if (i < 3) return null;
    const win = values.slice(i - 3, i + 1);
    if (win.some((x) => x == null || !isFinite(x))) return null;
    return (win as number[]).reduce((s, x) => s + x, 0) / 4;
  });
}
