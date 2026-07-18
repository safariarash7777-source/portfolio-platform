// ماژول کدال — دریافت خودکار گزارش‌های بنیادی از وب‌سرویس کدالِ BrsApi.
// چرا این‌جا (رله): excel.codal.ir و codal.ir به IP خارجی پاسخ نمی‌دهند؛
// فقط هاست داخل ایران (لیارا) می‌تواند اکسل گزارش‌ها را دانلود کند.
//
// جریان داده:
//   ۱) Announcement.php (BrsApi) → فهرست اطلاعیه‌های هر نماد (category=1: صورت
//      مالی، category=3: فعالیت ماهانه) با link_excel.
//   ۲) دانلود «اکسل» کدال — در عمل یک صفحهٔ HTML چندجدولی است (GetAll)؛ با
//      پارسر سبکِ همین فایل (بدون وابستگی npm) جدول‌ها استخراج می‌شوند.
//   ۳) نرمال‌سازی به قرارداد CodalN10Data / CodalN30Data (lib/fundamental/types.ts)
//      — دقیقاً همان شکلی که UI می‌خواند؛ اعتبارسنجی حسابی (فروش−بها=ناخالص).
//   ۴) درج در جدول append-only «codal_reports» با dedup روی source_url.
//
// قانون دادهٔ پروژه: «هیچ عدد ساختگی» — اگر پارس یک قلم قطعی نبود، null می‌ماند
// و ردیف با data=null فقط به‌عنوان متادیتای اطلاعیه ثبت می‌شود (raw همیشه هست).
// ─────────────────────────────────────────────────────────────────────────────

const BRSAPI_KEY = process.env.BRSAPI_KEY || "";
const BRSAPI_BASE = (process.env.BRSAPI_BASE || "https://Api.BrsApi.ir").replace(/\/+$/, "");
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// فاصلهٔ اجرای چرخهٔ موتور v3 — پیش‌فرض ۳ ساعت؛ گزارش کدال روزی چند بار بیشتر عوض نمی‌شود.
export const CODAL_INTERVAL_MS = Number(process.env.CODAL_INTERVAL_MS || 3 * 60 * 60 * 1000);

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const HDRS = { Accept: "application/json", "User-Agent": BROWSER_UA };

const errMsg = (e) => (e && e.name === "TimeoutError" ? "timeout" : e?.message ?? String(e));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── ابزار اعداد و تاریخ فارسی ─────────────────────────────────────────────── */

const FA_DIGITS = { "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9", "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9" };
function faToEnDigits(s) {
  return String(s ?? "").replace(/[۰-۹٠-٩]/g, (d) => FA_DIGITS[d] ?? d);
}

/** عدد از سلول جدول کدال؛ پرانتز = منفی؛ جداکنندهٔ هزارگان حذف می‌شود. */
function cellNum(s) {
  if (s == null) return null;
  let t = faToEnDigits(String(s)).replace(/[,\u066C\u200c\s]/g, "").trim();
  if (!t || t === "-" || t === "--") return null;
  let neg = false;
  const m = t.match(/^\((.*)\)$/);
  if (m) { neg = true; t = m[1]; }
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return neg ? -n : n;
}

/** تاریخ جلالی «۱۴۰۴/۱۲/۲۹» → "1404-12-29" (رشتهٔ قرارداد UI). */
function jalaliStr(s) {
  const t = faToEnDigits(String(s ?? "")).trim();
  const m = t.match(/(1[34]\d{2})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

/** جلالی → میلادی (برای ستون date دیتابیس). الگوریتم استاندارد jalaali. */
function jalaliToGregorian(jy, jm, jd) {
  jy = Number(jy); jm = Number(jm); jd = Number(jd);
  const jyd = jy + 1595;
  let days = -355668 + 365 * jyd + Math.floor(jyd / 33) * 8 + Math.floor(((jyd % 33) + 3) / 4) + jd
    + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * Math.floor(days / 146097); days %= 146097;
  if (days > 36524) { gy += 100 * Math.floor(--days / 36524); days %= 36524; if (days >= 365) days++; }
  gy += 4 * Math.floor(days / 1461); days %= 1461;
  if (days > 365) { gy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
  let gd = days + 1;
  const leap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
  const gdm = [0, 31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  for (gm = 1; gm <= 12 && gd > gdm[gm]; gm++) gd -= gdm[gm];
  return `${gy}-${String(gm).padStart(2, "0")}-${String(gd).padStart(2, "0")}`;
}

function jalaliStrToGregorian(j) {
  if (!j) return null;
  const m = j.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  try { return jalaliToGregorian(m[1], m[2], m[3]); } catch { return null; }
}

/* ── پارس HTML جدولی کدال (بدون وابستگی) ───────────────────────────────────── */

/** استخراج همهٔ جدول‌های HTML به‌صورت آرایهٔ [ [row][cell] ]. */
export function parseHtmlTables(html) {
  const tables = [];
  const tableRe = /<table[\s\S]*?<\/table>/gi;
  const rowRe = /<tr[\s\S]*?<\/tr>/gi;
  const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
  for (const tm of html.match(tableRe) ?? []) {
    const rows = [];
    for (const rm of tm.match(rowRe) ?? []) {
      const cells = [];
      let c;
      cellRe.lastIndex = 0;
      while ((c = cellRe.exec(rm))) {
        const text = c[1]
          .replace(/<br\s*\/?>/gi, " ")
          .replace(/<[^>]+>/g, "")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/\s+/g, " ")
          .trim();
        cells.push(text);
      }
      if (cells.length) rows.push(cells);
    }
    if (rows.length) tables.push(rows);
  }
  return tables;
}

/** نرمال‌سازی برچسب برای تطبیق: حذف فاصله/نیم‌فاصله/کشیده و یکسان‌سازی ی/ک عربی-فارسی. */
function normLabel(s) {
  return String(s ?? "")
    .replace(/[\s\u200c\u200f\u200e\u00a0\u0640]+/g, "")
    .replace(/[يى]/g, "ی").replace(/ك/g, "ک")
    .replace(/[()\u200d‌]/g, "");
}

/** جست‌وجوی یک ردیف درون یک جدول مشخص با برچسب نرمال‌شده. */
function rowIn(table, labels) {
  const wanted = labels.map(normLabel);
  for (const row of table) {
    const label = normLabel(row[0]);
    if (!label) continue;
    if (wanted.some((l) => label.includes(l))) {
      // ستون ۱ = دورهٔ جاری، ستون ۲ = دورهٔ مشابه قبل (ساختار تأییدشدهٔ ن-۱۰).
      return { value: cellNum(row[1]), prior: cellNum(row[2]) };
    }
  }
  return null;
}

/** پیداکردن جدول صورت سود و زیان: تنها جدولی که هم «درآمدهای عملیاتی»
 * و هم «سود(زیان) خالص» دارد (نه جدول تاریخچهٔ ۵ساله و نه ترازنامه). */
function findIncomeTable(tables) {
  for (const t of tables) {
    let hasRevenue = false, hasNet = false, hasGross = false;
    for (const row of t) {
      const l = normLabel(row[0]);
      if (l === normLabel("درآمدهای عملیاتی") || l === normLabel("جمع درآمدهای عملیاتی")) hasRevenue = true;
      if (l.includes(normLabel("سود(زیان)خالص")) && !l.includes(normLabel("هرسهم")) && !l.includes(normLabel("عملیاتمتوقف")) && !l.includes(normLabel("درحالتداوم"))) hasNet = true;
      if (l.includes(normLabel("سود(زیان)ناخالص"))) hasGross = true;
    }
    if (hasRevenue && hasNet && hasGross) return t;
  }
  return null;
}

/* ── نرمال‌سازی ن-۱۰ (صورت‌های مالی) ────────────────────────────────────────── */

/** جدول سود و زیان بانک/بیمه: به جای «درآمدهای عملیاتی»، «درآمد تسهیلات اعطایی»
 * (بانک) یا «درآمد حق بیمه» (بیمه) + «درآمد عملیاتی» + «سود(زیان)خالص» دارد.
 * (تأییدشده با اکسل واقعی ونوین FY1404 — جدول ۳۵سطری پس از عنوان «صورت سود و زیان».) */
function findBankIncomeTable(tables) {
  for (const t of tables) {
    let hasCoreRevenue = false, hasNet = false, hasOpIncome = false;
    for (const row of t) {
      const l = normLabel(row[0]);
      if (l.startsWith(normLabel("درآمد تسهیلات اعطایی")) || l.startsWith(normLabel("درآمد حق بیمه"))) hasCoreRevenue = true;
      if (l === normLabel("درآمد عملیاتی") || l === normLabel("جمع درآمدهای عملیاتی")) hasOpIncome = true;
      if (l === normLabel("سود(زیان)خالص") || l === normLabel("سود (زيان) خالص")) hasNet = true;
    }
    if (hasCoreRevenue && hasOpIncome && hasNet) return t;
  }
  return null;
}

/** نرمال‌سازی صورت سود و زیان بانک/بیمه به همان قرارداد IncomeStatement:
 * revenue=درآمد عملیاتی، cogs=هزینه سود سپرده‌ها (بانک) / هزینه خسارت (بیمه)،
 * gross/op/net/eps مطابق سطرهای استاندارد. اعتبارسنجی: ناخالص ≈ درآمد+هزینه ±۲٪.
 * اگر رد شد null (هیچ عدد ساختگی — قانون ۳). */
export function normalizeN10Bank(tables, meta) {
  const inc = findBankIncomeTable(tables);
  if (!inc) return null;

  const isInsurance = inc.some((r) => normLabel(r[0]).startsWith(normLabel("درآمد حق بیمه")));
  const revenue = rowIn(inc, ["درآمد عملیاتی", "جمع درآمدهای عملیاتی"]);
  const cogs = isInsurance
    ? rowIn(inc, ["هزینه خسارت", "هزینه‌های بیمه‌ای", "هزینه های بیمه ای"])
    : rowIn(inc, ["هزینه سود سپرده", "هزينه سود سپرده"]);
  const gross = rowIn(inc, ["سود(زیان) ناخالص", "سود (زيان) ناخالص"]);
  const op = rowIn(inc, ["سود(زیان) عملیاتی", "سود (زيان) عملياتى"]);

  // سود خالص نهایی — تطبیق دقیق (نه «عملیات در حال تداوم» و نه «هر سهم»).
  let net = null;
  for (const row of inc) {
    const l = normLabel(row[0]);
    if (l === normLabel("سود(زیان) خالص") || l === normLabel("سود (زيان) خالص")) {
      net = { value: cellNum(row[1]), prior: cellNum(row[2]) };
    }
  }
  if (!net) net = rowIn(inc, ["سود(زیان) خالص عملیات در حال تداوم"]);

  // EPS — اولویت با «سود (زیان) خالص هر سهم» (رقم رسمی نهایی؛ ونوین: ۷۷۳)،
  // سپس «ناشی از عملیات در حال تداوم»/«پایه هر سهم» — فقط سطر عدددار و غیرصفر
  // (در بانک‌ها سطر «سود(زیان) پایه هر سهم» گاه ۰ است — ونوین).
  const epsFind = (labels) => {
    for (const row of inc) {
      const l = normLabel(row[0]);
      if (!l || !labels.some((w) => l.includes(normLabel(w)) || l.startsWith(normLabel(w)))) continue;
      const v = cellNum(row[1]);
      if (v !== null && v !== 0) return { value: v, prior: cellNum(row[2]) };
    }
    return null;
  };
  const eps = epsFind(["خالص هر سهم"]) ?? epsFind(["ناشی از عملیات در حال تداوم", "پایه هر سهم"]);

  if (!revenue || revenue.value === null || !net || net.value === null) return null;

  // اعتبارسنجی حسابی: ناخالص ≈ درآمد عملیاتی + هزینه (در اکسل منفی) با تلورانس ۲٪.
  if (gross && gross.value !== null && cogs && cogs.value !== null) {
    const calc = revenue.value + cogs.value;
    const tol = Math.max(Math.abs(gross.value) * 0.02, 10);
    if (Math.abs(calc - gross.value) > tol) return null; // جدول اشتباه — درج نکن
  }

  const mkIncome = (which) => ({
    revenue: which === "cur" ? revenue.value : revenue.prior,
    cogs: cogs && cogs[which === "cur" ? "value" : "prior"] !== null ? Math.abs(cogs[which === "cur" ? "value" : "prior"]) : 0,
    gross_profit: gross && gross[which === "cur" ? "value" : "prior"] !== null ? gross[which === "cur" ? "value" : "prior"] : 0,
    operating_profit: op && op[which === "cur" ? "value" : "prior"] !== null ? op[which === "cur" ? "value" : "prior"] : 0,
    net_profit: which === "cur" ? net.value : net.prior,
    ...(eps && eps[which === "cur" ? "value" : "prior"] !== null ? { eps_rial: eps[which === "cur" ? "value" : "prior"] } : {}),
  });

  const cur = mkIncome("cur");
  let prior;
  if (revenue.prior !== null && net.prior !== null) prior = mkIncome("prior");

  // سرمایه: سطر «سرمایه» در انتهای همین جدول (ساختار تأییدشدهٔ ونوین).
  let capital = 0;
  for (const row of inc) {
    const l = normLabel(row[0]);
    if (l === normLabel("سرمایه") || l === normLabel("سرمايه")) {
      const v = cellNum(row[1]);
      if (v !== null && v > 0) capital = v;
    }
  }

  return {
    symbol: meta.symbol,
    company_name: meta.company_name,
    report_kind: "ن-۱۰",
    statement_type: isInsurance ? "insurance" : "bank",
    period_end: meta.period_end,
    period_months: meta.period_months,
    audited: meta.audited,
    restated_prior: false,
    unit: "میلیون ریال",
    capital,
    standalone: prior ? { ...cur, prior } : cur,
  };
}

/** از جدول‌های اکسل ن-۱۰، CodalN10Data می‌سازد؛ فقط از جدول صورت سود و زیان،
 * با اعتبارسنجی حسابی سخت‌گیرانه؛ اگر رد شد null (هیچ عدد ساختگی). */
export function normalizeN10(tables, meta) {
  const inc = findIncomeTable(tables);
  // بانک/بیمه صورت سود و زیان متفاوتی دارند (بدون «بهای تمام‌شده»/«ناخالص» صنعتی) — مسیر جدا.
  if (!inc) return normalizeN10Bank(tables, meta);

  const revenue = rowIn(inc, ["درآمدهای عملیاتی"]);
  const cogs = rowIn(inc, ["بهای تمام شده درآمد", "بهاى تمام شده درآمد", "بهای تمام‌شده"]);
  const gross = rowIn(inc, ["سود(زیان) ناخالص", "سود (زيان) ناخالص"]);
  const op = rowIn(inc, ["سود(زیان) عملیاتی", "سود (زيان) عملياتى"]);
  // سود خالص نهایی — نه «عملیات در حال تداوم» و نه «هر سهم».
  let net = null;
  for (const row of inc) {
    const l = normLabel(row[0]);
    if (l === normLabel("سود(زیان) خالص") || l === normLabel("سود (زيان) خالص")) {
      net = { value: cellNum(row[1]), prior: cellNum(row[2]) };
    }
  }
  if (!net) net = rowIn(inc, ["سود(زیان) خالص عملیات در حال تداوم"]);
  // EPS: ردیف «ناشی از عملیات در حال تداوم» یا «سود(زیان) پایه هر سهم».
  // فقط ردیفی که مقدار عددی دارد (ردیف عنوان «سود(زیان) پایه هر سهم:» خالی است).
  let eps = null;
  for (const row of inc) {
    const l = normLabel(row[0]);
    if (!l) continue;
    const isEpsRow = l.startsWith(normLabel("ناشی از عملیات در حال تداوم"))
      || l.includes(normLabel("پایه هر سهم")) || l.includes(normLabel("خالص هر سهم"));
    if (!isEpsRow) continue;
    const v = cellNum(row[1]);
    if (v !== null) { eps = { value: v, prior: cellNum(row[2]) }; break; }
  }

  // حداقل لازم: فروش و سود خالص دورهٔ جاری.
  if (!revenue || revenue.value === null || !net || net.value === null) return null;

  // اعتبارسنجی حسابی: ناخالص ≈ فروش + بها (بها در اکسل منفی است) با تلورانس ۲٪.
  if (gross && gross.value !== null && cogs && cogs.value !== null) {
    const calc = revenue.value + cogs.value; // cogs منفی
    const tol = Math.max(Math.abs(gross.value) * 0.02, 10);
    if (Math.abs(calc - gross.value) > tol) return null; // جدول اشتباه — درج نکن
  }

  const mkIncome = (which) => ({
    revenue: which === "cur" ? revenue.value : revenue.prior,
    cogs: cogs && cogs[which === "cur" ? "value" : "prior"] !== null ? Math.abs(cogs[which === "cur" ? "value" : "prior"]) : 0,
    gross_profit: gross && gross[which === "cur" ? "value" : "prior"] !== null ? gross[which === "cur" ? "value" : "prior"] : 0,
    operating_profit: op && op[which === "cur" ? "value" : "prior"] !== null ? op[which === "cur" ? "value" : "prior"] : 0,
    net_profit: which === "cur" ? net.value : net.prior,
    ...(eps && eps[which === "cur" ? "value" : "prior"] !== null ? { eps_rial: eps[which === "cur" ? "value" : "prior"] } : {}),
  });

  const cur = mkIncome("cur");
  let prior;
  if (revenue.prior !== null && net.prior !== null) prior = mkIncome("prior");

  // سرمایه از جدول تغییرات حقوق مالکانه (ستون «سرمایه»، ردیف «مانده...»).
  let capital = 0;
  for (const t of tables) {
    const hdr = t[0] ?? [];
    const cCap = hdr.findIndex((c) => normLabel(c) === normLabel("سرمایه"));
    if (cCap < 1) continue;
    for (const row of t.slice(1)) {
      if (normLabel(row[0]).includes(normLabel("مانده"))) {
        const v = cellNum(row[cCap]);
        if (v !== null && v > 0) capital = v; // آخرین مانده = سرمایهٔ فعلی
      }
    }
    if (capital) break;
  }

  return {
    symbol: meta.symbol,
    company_name: meta.company_name,
    report_kind: "ن-۱۰",
    period_end: meta.period_end,
    period_months: meta.period_months,
    audited: meta.audited,
    restated_prior: false,
    unit: "میلیون ریال",
    capital,
    standalone: prior ? { ...cur, prior } : cur,
  };
}

/* ── نرمال‌سازی ن-۳۰ (فعالیت ماهانه) ────────────────────────────────────────── */

/** از جدول‌های اکسل ن-۳۰، CodalN30Data می‌سازد.
 * ساختار تأییدشدهٔ جدول محصول (شبندر ۱۴۰۵/۰۳): دو سطر سرستون —
 * سطر ۰ = بلوک‌های دوره (تجمعی قبل، اصلاحات، تجمعی اصلاح‌شده، «دوره یک ماهه»،
 * تجمعی جاری، تجمعی سال قبل)، سطر ۱ = زیرستون‌ها. در سطر داده (۲۶ سلول):
 * ستون ۰=نام، ۱=واحد، بلوک «دوره یک ماهه» = ستون‌های ۱۳–۱۶ (تولید، فروش، نرخ، مبلغ)،
 * بلوک تجمعی جاری = ۱۷–۲۰. اعتبارسنجی: مبلغ ≈ فروش×نرخ÷10^6 (±۵٪). */
export function normalizeN30(tables, meta) {
  const products = [];
  let periodTotal = null;
  let fyCumulative = null;

  // جدول محصول: سطری با «نام محصول» دارد و سطر قبلش بلوک «دوره یک ماهه».
  for (const t of tables) {
    const h1Idx = t.findIndex((r) => r.some((c) => normLabel(c) === normLabel("نام محصول")));
    if (h1Idx < 0) continue;
    const h0 = t[h1Idx - 1] ?? [];
    if (!h0.some((c) => c.includes("دوره یک ماهه") || c.includes("دوره یکماهه") || c.includes("ماهه منتهی"))) continue;

    // بلوک‌بندی ثابت طبق ساختار استاندارد ن-۳۰ (۲۶ ستون):
    //   2..5 تجمعی گزارش قبل | 6..8 اصلاحات | 9..12 تجمعی اصلاح‌شده
    //   13..16 دورهٔ یک‌ماههٔ جاری | 17..20 تجمعی تا پایان ماه جاری | 21..24 تجمعی سال قبل
    const expectCols = 26;
    const M = { prod: 13, qty: 14, rate: 15, amount: 16 };
    const C = { qty: 18, amount: 20 };

    let cumTotal = null;
    for (const row of t.slice(h1Idx + 1)) {
      const name = (row[0] || "").trim();
      if (!name) continue;
      if (row.length < expectCols - 2) continue; // سطرهای بخشی کوتاه‌ترند
      if (name.includes("جمع")) {
        const vM = cellNum(row[M.amount]);
        const vC = cellNum(row[C.amount]);
        // «جمع کل» آخرین ردیف جمع است — مقدار آخر برنده می‌شود.
        if (vM !== null) periodTotal = vM;
        if (vC !== null) cumTotal = vC;
        continue;
      }
      if (name.endsWith(":")) continue; // عنوان بخش (فروش داخلی:/صادراتی:)
      const qty = cellNum(row[M.qty]);
      const amount = cellNum(row[M.amount]);
      const rate = cellNum(row[M.rate]);
      if (qty === null && amount === null) continue;
      if ((qty === 0 || qty === null) && (amount === 0 || amount === null)) continue; // بدون فروش در ماه
      // اعتبارسنجی مبلغ ≈ فروش×نرخ÷10^6 (مبلغ به میلیون ریال است).
      if (qty && rate && amount) {
        const calc = (qty * rate) / 1e6;
        if (calc > 0 && Math.abs(calc - amount) / Math.max(amount, 1) > 0.05) continue; // ستون اشتباه — رد
      }
      products.push({
        product_name: name,
        market: name.includes("صادرات") ? "صادراتی" : "داخلی",
        production_qty: cellNum(row[M.prod]),
        sales_qty: qty,
        sales_rate: rate,
        sales_amount: amount,
      });
    }
    if (cumTotal !== null) fyCumulative = cumTotal;
    if (products.length) break; // فقط جدول محصول اصلی
  }

  if (products.length === 0) return null;
  if (periodTotal === null) {
    periodTotal = products.reduce((s, p) => s + (p.sales_amount ?? 0), 0);
  }

  const fyMatch = meta.period_end?.match(/^(\d{4})/);
  return {
    symbol: meta.symbol,
    report_kind: "ن-۳۰",
    period_end: meta.period_end,
    fiscal_year: fyMatch ? Number(fyMatch[1]) : 0,
    products,
    period_total_amount: periodTotal,
    fy_cumulative_amount: fyCumulative ?? periodTotal,
  };
}

/* ── دریافت از BrsApi و کدال ────────────────────────────────────────────────── */

async function fetchAnnouncements(symbol, category) {
  // only_subsidiaries=false: گزارش شرکت‌های زیرمجموعه (مثل «بهساز مشارکت‌های ملت») قاطی نشود.
  const qs = new URLSearchParams({
    key: BRSAPI_KEY, l18: symbol, category: String(category), page: "1",
    only_main_company: "true", only_subsidiaries: "false",
  });
  const res = await fetch(`${BRSAPI_BASE}/Codal/Announcement.php?${qs}`, {
    headers: HDRS, signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`announcement HTTP ${res.status}`);
  const json = await res.json();
  return Array.isArray(json?.announcement) ? json.announcement : [];
}

async function downloadExcelHtml(url) {
  // excel.codal.ir کُند است و گاه بار اول timeout می‌دهد — تا ۳ تلاش با مهلت فزاینده.
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": BROWSER_UA, Accept: "*/*" },
        signal: AbortSignal.timeout(30000 * attempt),
      });
      if (!res.ok) throw new Error(`excel HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
      if (attempt < 3) await sleep(3000 * attempt);
    }
  }
  throw lastErr;
}

/* ── Supabase: dedup و درج ──────────────────────────────────────────────────── */

const SB_HDRS = () => ({
  "Content-Type": "application/json",
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
});

/** نسخهٔ پارسر — با هر بازنویسی منطق پارس، زیاد کنید تا ردیف‌های نسخهٔ قدیم
 * (که در جدول append-only قابل حذف/ویرایش نیستند) دوباره پردازش شوند.
 * ردیف جدید با source_url پسونددار (#pv2) درج می‌شود و لایهٔ خواندن باید
 * بالاترین parser_version برای هر اطلاعیه را بخواند (raw.parser_version). */
export const PARSER_VERSION = 2;

/** کلید درج برای نسخهٔ فعلی پارسر — نسخهٔ ۱ بدون پسوند بود. */
const versionedUrl = (link) => (PARSER_VERSION === 1 ? link : `${link}#pv${PARSER_VERSION}`);

/** source_urlهای موجود برای نماد — تا اطلاعیهٔ تکراری دوباره دانلود نشود.
 * فقط ردیف‌های نسخهٔ فعلی ملاک‌اند (پسوند #pv جدا می‌شود). */
async function existingUrls(symbol) {
  const qs = new URLSearchParams({ select: "source_url", symbol: `eq.${symbol}`, limit: "500" });
  const res = await fetch(`${SUPABASE_URL}/rest/v1/codal_reports?${qs}`, {
    headers: SB_HDRS(), signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`existing HTTP ${res.status}`);
  const rows = await res.json();
  const cur = new Set();
  for (const r of rows) {
    const m = String(r.source_url || "").match(/^(.*?)#pv(\d+)$/);
    const [base, ver] = m ? [m[1], Number(m[2])] : [r.source_url, 1];
    if (ver >= PARSER_VERSION) cur.add(base);
  }
  return cur;
}

async function insertReport(row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/codal_reports?on_conflict=source_url`, {
    method: "POST",
    headers: { ...SB_HDRS(), Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify([row]),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`insert HTTP ${res.status} ${t.slice(0, 120)}`);
  }
}

/* ── طبقه‌بندی اطلاعیه ──────────────────────────────────────────────────────── */

function classify(a) {
  const title = a.title || "";
  const code = a.code || "";
  if (code.includes("ن-۳۰") || title.includes("گزارش فعالیت ماهانه")) return "ن-۳۰";
  const isFs = code.includes("ن-۱۰")
    || title.includes("صورت‌های مالی") || title.includes("صورتهای مالی") || title.includes("صورت های مالی");
  if (!isFs) return null;
  // فقط گزارش خود شرکت اصلی (نه پرتفوی زیرمجموعه و نه تلفیقیِ جدا از اصلی — تلفیقی همراه اصلی در همان اکسل است).
  if (title.includes("پورتفوی")) return null;
  return "ن-۱۰";
}

function metaFrom(a, kind) {
  const title = a.title || "";
  const period_end = jalaliStr(a.date_title) || jalaliStr(title);
  let period_months = 12;
  const pm = faToEnDigits(title).match(/دوره\s*(\d{1,2})\s*ماهه/);
  if (pm) period_months = Number(pm[1]);
  else if (kind === "ن-۳۰") period_months = 1;
  return {
    symbol: a.l18,
    company_name: a.l30 || a.l18,
    period_end,
    period_months,
    audited: title.includes("حسابرسی شده"),
  };
}

/* ── Job اصلی ───────────────────────────────────────────────────────────────── */

/* ── پل موتور v3 (codal-engine.mjs) ───────────────────────────────────────────────
 * موتور کشف سراسری به همین کمکی‌های آزموده تکیه می‌کند تا منطق پارس/درج
 * فقط یک‌جا بماند. */
export const codalEnv = { BRSAPI_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY };
export const faToEn = faToEnDigits;
// تبدیل تاریخ جلالی → میلادی — بک‌فیل کندل (M8-الف) هم به همین نیاز دارد (تاریخ Candlestick.php جلالی است).
export const jalaliYmdToGregorian = jalaliToGregorian;
export const jalaliTextToIso = jalaliStr;
export const classifyAnnouncement = classify;
export const metaFromAnnouncement = metaFrom;
export const existingUrlsFor = existingUrls;

/** دریافت یک صفحهٔ اطلاعیه — بدون l18، فید سراسری کل بازار را می‌دهد
 * (جدیدترین‌ها اول، ۲۰تایی). موتور v3 برای واترمارک فید و بک‌فیل نمادی
 * از همین استفاده می‌کند. */
export async function fetchAnnouncementsPage({ l18, category, page = 1, date_start } = {}) {
  const qs = new URLSearchParams({
    key: BRSAPI_KEY, page: String(page),
    only_main_company: "true", only_subsidiaries: "false",
  });
  if (l18) qs.set("l18", l18);
  if (category) qs.set("category", String(category));
  if (date_start) qs.set("date_start", String(date_start)); // جلالی YYYY/MM/DD — مرز آرشیو (T4)
  const res = await fetch(`${BRSAPI_BASE}/Codal/Announcement.php?${qs}`, {
    headers: HDRS, signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`announcement HTTP ${res.status}`);
  const json = await res.json();
  return Array.isArray(json?.announcement) ? json.announcement : [];
}

/** دانلود اکسل اطلاعیه و نرمال‌سازی — null یعنی پارس ناموفق (درج نکنید). */
export async function downloadAndParse(a, kind) {
  const html = await downloadExcelHtml(a.link_excel);
  const tables = parseHtmlTables(html);
  const meta = metaFrom(a, kind);
  return kind === "ن-۱۰" ? normalizeN10(tables, meta) : normalizeN30(tables, meta);
}

/** درج ردیف پارس‌شده — دقیقاً همان قرارداد درج processSymbol
 * (source_url نسخه‌دار، dedup روی on_conflict، raw کامل). */
export async function insertParsedReport(a, kind, data) {
  const meta = metaFrom(a, kind);
  const row = {
    symbol: a.l18,
    company_name: meta.company_name,
    report_kind: kind,
    period_end: jalaliStrToGregorian(meta.period_end),
    title: a.title || null,
    source_url: versionedUrl(a.link),
    published_at: null,
    data,
    raw: {
      date_publish: a.date_publish ?? null,
      time_publish: a.time_publish ?? null,
      link_pdf: a.link_pdf ?? null,
      link_excel: a.link_excel ?? null,
      code: a.code ?? null,
      period_end_jalali: meta.period_end,
      audited: meta.audited,
      period_months: meta.period_months,
      parser_version: PARSER_VERSION,
      announcement_link: a.link,
      discovered_by: "engine-v3",
    },
  };
  await insertReport(row);
}

/** دامپ تشخیصی ساختار جدول‌های یک اکسل واقعی به Supabase — وقتی لبهٔ لیارا از خارج در دسترس نیست.
 * فعال‌سازی: CODAL_DEBUG_EXCEL_URL را ست کنید؛ خروجی در ir_market_snapshots (key='codal_debug'). */
export async function codalDebugDump() {
  const target = process.env.CODAL_DEBUG_EXCEL_URL;
  if (!target || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    const html = await downloadExcelHtml(target);
    const tables = parseHtmlTables(html);
    // برای هر جدول: ابعاد + تا ۲۵ ردیف اول (هر ردیف تا ۶ سلول، هر سلول تا ۴۰ نویسه).
    const dump = tables.map((t, i) => ({
      i,
      rows: t.length,
      cols: Math.max(...t.map((r) => r.length)),
      sample: t.slice(0, 12).map((r) => r.map((c) => String(c).slice(0, 34))),
    }));
    const body = [{
      key: "codal_debug",
      payload: { url: target, bytes: html.length, tables: dump.length, dump },
    }];
    const res = await fetch(`${SUPABASE_URL}/rest/v1/ir_market_snapshots?on_conflict=key`, {
      method: "POST",
      headers: { ...SB_HDRS(), Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    console.log(`codal debug dump: ${dump.length} tables, push HTTP ${res.status}`);
    return res.ok;
  } catch (e) {
    console.error("codal debug dump error:", errMsg(e));
    return false;
  }
}

/** دریافت خام یک اکسل کدال از داخل ایران — برای تحلیل ساختار جدول‌ها در توسعه. */
export async function codalRawExcel(excelUrl) {
  if (!/^https:\/\/excel\.codal\.ir\//.test(excelUrl)) throw new Error("only excel.codal.ir urls");
  return await downloadExcelHtml(excelUrl);
}

/** تست تشخیصی: یک نماد را زنده پردازش و خلاصهٔ نتیجهٔ پارس را برمی‌گرداند (بدون درج). */
export async function codalTest(symbol) {
  const out = { symbol, announcements: 0, samples: [] };
  const [fs, monthly] = await Promise.all([
    fetchAnnouncements(symbol, 1),
    fetchAnnouncements(symbol, 3),
  ]);
  out.announcements = fs.length + monthly.length;
  let dl = 0;
  for (const a of [...fs, ...monthly]) {
    const kind = classify(a);
    if (!kind || !a.link_excel || dl >= 2) continue;
    dl++;
    const s = { kind, title: a.title, excel: a.link_excel, parsed: false, summary: null, error: null };
    try {
      const html = await downloadExcelHtml(a.link_excel);
      const tables = parseHtmlTables(html);
      s.tables = tables.length;
      s.bytes = html.length;
      const meta = metaFrom(a, kind);
      const data = kind === "ن-۱۰" ? normalizeN10(tables, meta) : normalizeN30(tables, meta);
      if (data) {
        s.parsed = true;
        s.summary = kind === "ن-۱۰"
          ? { revenue: data.standalone.revenue, net_profit: data.standalone.net_profit, eps: data.standalone.eps_rial ?? null, prior_revenue: data.standalone.prior?.revenue ?? null, period_end: data.period_end, months: data.period_months }
          : { products: data.products.length, total: data.period_total_amount, period_end: data.period_end, first: data.products[0]?.product_name ?? null };
      }
    } catch (e) {
      s.error = errMsg(e);
    }
    out.samples.push(s);
  }
  return out;
}
