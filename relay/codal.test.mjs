// تست واحد پارسر کدال — نمونه‌ها بازتولید ساختار واقعیِ تأییدشده از اکسل کدال است
// (شبندر: ن-۱۰ سه‌ماههٔ ۱۴۰۴/۰۳/۳۱ و ن-۳۰ ماهانهٔ ۱۴۰۵/۰۳). اجرا: node codal.test.mjs
import { parseHtmlTables, normalizeN10, normalizeN10Bank, normalizeN30 } from "./codal.mjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

let failed = 0;
function check(name, cond, extra = "") {
  if (cond) console.log(`  ok  ${name}`);
  else { failed++; console.error(`FAIL  ${name} ${extra}`); }
}

const tbl = (rows) =>
  `<table>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</table>`;

/* ── ن-۱۰: صورت سود و زیان واقعی (ساختار ۵ ستونه، اعداد فارسی، پرانتز=منفی) ── */
// جدول مزاحم اول: تاریخچهٔ ۵ساله (باید نادیده گرفته شود — سود خالص ندارد).
const histTable = tbl([
  ["شرح", "سال مالی ۱۳۹۹/۱۲/۳۰", "سال مالی ۱۴۰۰/۱۲/۲۹"],
  ["مبلغ فروش", "۸۹۴,۹۸۳,۱۱۰", "۱,۹۷۶,۳۱۰,۶۳۶"],
  ["مبلغ بهای تمام شده", "(۷۸۰,۱۶۸,۵۷۲)", "(۱,۷۱۹,۹۸۶,۰۸۵)"],
]);
// صورت سود و زیان واقعی — برچسب‌ها با ي/ى عربی مخلوط، مثل خروجی کدال.
const incomeTable = tbl([
  ["شرح", "دوره منتهي به ۱۴۰۴/۰۳/۳۱", "تجديد ارائه شده دوره منتهي به ۱۴۰۳/۰۳/۳۱", "تجديد ارائه شده دوره منتهي به ۱۴۰۳/۱۲/۳۰", "درصد تغيير"],
  ["حسابرسی نشده", "حسابرسی نشده", "حسابرسی شده"],
  ["عمليات در حال تداوم:", "", "", "", ""],
  ["درآمدهاي عملياتي", "۱,۴۴۲,۶۰۳,۶۶۸", "۹۴۵,۴۳۳,۳۲۸", "۴,۴۲۵,۰۶۵,۶۸۴", "۵۳"],
  ["بهاى تمام شده درآمدهاي عملياتي", "(۱,۲۲۷,۳۹۷,۷۳۴)", "(۹۰۶,۸۱۰,۲۷۷)", "(۴,۱۶۳,۳۸۴,۰۱۴)", "(۳۵)"],
  ["سود(زيان) ناخالص", "۲۱۵,۲۰۵,۹۳۴", "۳۸,۶۲۳,۰۵۱", "۲۶۱,۶۸۱,۶۷۰", "۴۵۷"],
  ["هزينه‏ هاى فروش، ادارى و عمومى", "(۱۰,۵۴۹,۷۸۹)", "(۴,۸۷۷,۲۷۳)", "(۳۲,۹۱۴,۷۸۴)", "(۱۱۶)"],
  ["سود(زيان) عملياتى", "۲۰۵,۸۱۹,۵۲۴", "۳۳,۹۵۵,۳۶۵", "۲۴۱,۰۶۵,۸۳۷", "۵۰۶"],
  ["سود(زيان) خالص عمليات در حال تداوم", "۱۶۹,۶۸۸,۵۶۹", "۳۱,۷۴۴,۹۵۳", "۲۰۹,۵۶۹,۱۴۰", "۴۳۵"],
  ["سود(زيان) خالص", "۱۶۹,۶۸۸,۵۶۹", "۳۱,۷۴۴,۹۵۳", "۲۰۹,۵۶۹,۱۴۰", "۴۳۵"],
  ["سود(زيان) پايه هر سهم:", "", "", "", ""],
  ["ناشي از عمليات در حال تداوم", "۱,۲۶۳", "۲۳۶", "۱,۵۶۰", "۴۳۵"],
]);
// جدول تغییرات حقوق مالکانه برای سرمایه.
const equityTable = tbl([
  ["شرح", "سرمايه", "افزايش سرمايه در جريان", "اندوخته قانوني"],
  ["مانده در ۱۴۰۳/۰۱/۰۱", "۱۳۴,۳۴۱,۹۲۲", "۰", "۱۳,۴۳۴,۱۹۲"],
]);

const n10tables = parseHtmlTables(histTable + incomeTable + equityTable);
const n10 = normalizeN10(n10tables, {
  symbol: "شبندر", company_name: "پالايش نفت بندرعباس",
  period_end: "1404-03-31", period_months: 3, audited: false,
});
check("n10 parsed", !!n10);
if (n10) {
  check("n10 revenue", n10.standalone.revenue === 1442603668, String(n10.standalone.revenue));
  check("n10 cogs abs", n10.standalone.cogs === 1227397734, String(n10.standalone.cogs));
  check("n10 gross", n10.standalone.gross_profit === 215205934);
  check("n10 operating", n10.standalone.operating_profit === 205819524);
  check("n10 net", n10.standalone.net_profit === 169688569, String(n10.standalone.net_profit));
  check("n10 eps", n10.standalone.eps_rial === 1263, String(n10.standalone.eps_rial));
  check("n10 prior revenue", n10.standalone.prior?.revenue === 945433328, String(n10.standalone.prior?.revenue));
  check("n10 prior net", n10.standalone.prior?.net_profit === 31744953);
  check("n10 capital", n10.capital === 134341922, String(n10.capital));
}

// اعتبارسنجی حسابی: اگر ناخالص با فروش−بها نخواند → null.
const badIncome = incomeTable.replace("۲۱۵,۲۰۵,۹۳۴", "۹۹۹,۹۹۹,۹۹۹");
check("n10 rejects inconsistent table",
  normalizeN10(parseHtmlTables(histTable + badIncome), { symbol: "x", period_end: "1404-03-31", period_months: 3 }) === null);
// بدون جدول سود و زیان → null.
check("n10 null without income table",
  normalizeN10(parseHtmlTables(histTable + equityTable), { symbol: "x", period_end: null, period_months: 12 }) === null);

/* ── ن-۳۰: جدول محصول ۲۶ ستونه واقعی ────────────────────────────────────────── */
const pad = (n) => Array(n).fill("");
const n30Table = tbl([
  ["شرح", "از ابتدای سال مالی تا تاریخ ۱۴۰۵/۰۲/۳۱", "اصلاحات", "از ابتدای سال مالی تا تاریخ ۱۴۰۵/۰۲/۳۱ (اصلاح شده)", "دوره یک ماهه منتهی به ۱۴۰۵/۰۳/۳۱", "از ابتدای سال مالی تا تاریخ ۱۴۰۵/۰۳/۳۱", "از ابتدای سال مالی تا تاریخ ۱۴۰۴/۰۳/۳۱", "وضعیت محصول-واحد"],
  ["نام محصول", "واحد", "تعداد تولید", "تعداد فروش", "نرخ فروش (ریال)", "مبلغ فروش (میلیون ریال)", "تعداد تولید", "تعداد فروش", "مبلغ فروش (میلیون ریال)", "تعداد تولید", "تعداد فروش", "نرخ فروش (ریال)", "مبلغ فروش (میلیون ریال)", "تعداد تولید", "تعداد فروش", "نرخ فروش (ریال)", "مبلغ فروش (میلیون ریال)", "تعداد تولید", "تعداد فروش", "نرخ فروش (ریال)", "مبلغ فروش (میلیون ریال)", "تعداد تولید", "تعداد فروش", "نرخ فروش (ریال)", "مبلغ فروش (میلیون ریال)"],
  ["فروش داخلی:", ...pad(25)],
  // گازمايع — بلوک ماه (۱۳..۱۶): ۲۷,۹۹۹ | ۲۸,۳۸۳ | ۴۳۵,۶۹۹,۰۱۰ | ۱۲,۳۶۶,۴۴۵
  ["گازمايع", "متر مکعب", "۵۷,۰۷۳", "۵۶,۳۹۹", "۴۱۰,۱۵۳,۰۳۵", "۲۳,۱۳۲,۲۲۱", "", "", "۰", "۵۷,۰۷۳", "۵۶,۳۹۹", "۴۱۰,۱۵۳,۰۳۵", "۲۳,۱۳۲,۲۲۱", "۲۷,۹۹۹", "۲۸,۳۸۳", "۴۳۵,۶۹۹,۰۱۰", "۱۲,۳۶۶,۴۴۵", "۸۵,۰۷۲", "۸۴,۷۸۲", "۴۱۸,۷۰۵,۲۲۰", "۳۵,۴۹۸,۶۶۶", "۹۳,۴۴۱", "۹۸,۷۹۷", "۲۲۴,۰۱۷,۹۶۶", "۲۲,۱۳۲,۳۰۳", "توليد"],
  // محصول بدون فروش در ماه — باید حذف شود.
  ["سوخت سنگين جت", "متر مکعب", "۶,۶۰۶", "۵,۷۳۵", "۷۶۱,۳۹۴,۰۷۱", "۴,۳۶۶,۵۹۵", "", "", "۰", "۶,۶۰۶", "۵,۷۳۵", "۷۶۱,۳۹۴,۰۷۱", "۴,۳۶۶,۵۹۵", "۳,۴۱۹", "۰", "", "۰", "۱۰,۰۲۵", "۵,۷۳۵", "۷۶۱,۳۹۴,۰۷۱", "۴,۳۶۶,۵۹۵", "۹۷,۹۸۶", "۹۶,۹۶۱", "۳۴۵,۴۴۴,۶۵۳", "۳۳,۴۹۴,۶۵۹", "توليد"],
  ["جمع کل", "", "", "", "", "۱۰۰,۰۰۰", "", "", "۰", "", "", "", "۱۰۰,۰۰۰", "", "", "", "۱۲,۳۶۶,۴۴۵", "", "", "", "۴۷,۸۶۵,۱۱۱", "", "", "", "۹۹,۰۰۰", ""],
]);

const n30 = normalizeN30(parseHtmlTables(n30Table), { symbol: "شبندر", period_end: "1405-03-31" });
check("n30 parsed", !!n30);
if (n30) {
  check("n30 one product with month sales", n30.products.length === 1, String(n30.products.length));
  const p = n30.products[0];
  check("n30 product name", p?.product_name === "گازمايع");
  check("n30 month qty", p?.sales_qty === 28383, String(p?.sales_qty));
  check("n30 month rate", p?.sales_rate === 435699010);
  check("n30 month amount", p?.sales_amount === 12366445, String(p?.sales_amount));
  check("n30 month production", p?.production_qty === 27999);
  check("n30 period total", n30.period_total_amount === 12366445, String(n30.period_total_amount));
  check("n30 fy cumulative", n30.fy_cumulative_amount === 47865111, String(n30.fy_cumulative_amount));
  check("n30 fiscal year", n30.fiscal_year === 1405);
}
// بدون جدول محصول → null.
check("n30 null without product table",
  normalizeN30(parseHtmlTables(histTable), { symbol: "x", period_end: null }) === null);

/* ── بانک (T5): تطبیق عددی با اکسل واقعی کدال — ونوین FY1404 (فیکسچر کامل) ────
 * مرجع اعداد: صورت سود و زیان بانک در اکسل رسمی کدال (excel.codal.ir،
 * اطلاعیهٔ صورت‌های مالی سال مالی منتهی به ۱۴۰۴/۱۲/۲۹ حسابرسی نشده):
 * درآمد عملیاتی ۷۴۱,۷۶۵,۴۶۷ | هزینه سود سپرده‌ها (۴۳۴,۷۳۲,۵۲۱) |
 * ناخالص ۳۰۷,۰۳۲,۹۴۶ | عملیاتی ۲۲۹,۲۱۰,۷۷۸ | خالص ۱۸۸,۰۴۲,۹۴۰ |
 * EPS خالص هر سهم ۷۷۳ ریال | سرمایه ۲۴۳,۱۴۵,۱۱۹. */
const here = dirname(fileURLToPath(import.meta.url));
let bankHtml = null;
try { bankHtml = readFileSync(join(here, "fixtures", "vanovin-n10-fy1404.html"), "utf8"); } catch { /* fixture missing */ }
check("bank fixture exists", !!bankHtml);
if (bankHtml) {
  const bankTables = parseHtmlTables(bankHtml);
  const meta = {
    symbol: "ونوین", company_name: "بانک اقتصاد نوین",
    period_end: "1404-12-29", period_months: 12, audited: false,
  };
  // مسیر اصلی: normalizeN10 باید خودش به مسیر بانک بیفتد (جدول صنعتی ندارد).
  const bank = normalizeN10(bankTables, meta);
  check("bank n10 parsed via fallback", !!bank);
  if (bank) {
    check("bank statement_type", bank.statement_type === "bank", String(bank.statement_type));
    check("bank revenue (درآمد عملیاتی)", bank.standalone.revenue === 741765467, String(bank.standalone.revenue));
    check("bank cogs (هزینه سود سپرده‌ها)", bank.standalone.cogs === 434732521, String(bank.standalone.cogs));
    check("bank gross", bank.standalone.gross_profit === 307032946, String(bank.standalone.gross_profit));
    check("bank operating", bank.standalone.operating_profit === 229210778, String(bank.standalone.operating_profit));
    check("bank net", bank.standalone.net_profit === 188042940, String(bank.standalone.net_profit));
    check("bank eps (خالص هر سهم)", bank.standalone.eps_rial === 773, String(bank.standalone.eps_rial));
    check("bank capital", bank.capital === 243145119, String(bank.capital));
    check("bank prior revenue", bank.standalone.prior?.revenue === 514483893, String(bank.standalone.prior?.revenue));
    check("bank prior net", bank.standalone.prior?.net_profit === 116251941, String(bank.standalone.prior?.net_profit));
    // اعتبارسنجی حسابی مستقل: ناخالص = درآمد − هزینه (تطبیق دقیق اعداد واقعی).
    check("bank arithmetic", bank.standalone.revenue - bank.standalone.cogs === bank.standalone.gross_profit);
  }
  // مسیر مستقیم هم همان را بدهد.
  const bankDirect = normalizeN10Bank(bankTables, meta);
  check("bank direct === fallback", JSON.stringify(bankDirect) === JSON.stringify(bank));
}

// بیمه: جدول مصنوعی با ساختار صورت سود و زیان بیمه (درآمد حق بیمه).
const insTable = tbl([
  ["شرح", "دوره منتهی به ۱۴۰۴/۱۲/۲۹", "دوره منتهی به ۱۴۰۳/۱۲/۳۰", "درصد تغییرات"],
  ["درآمد حق بیمه", "۱۰۰,۰۰۰", "۸۰,۰۰۰", "۲۵"],
  ["درآمد عملیاتی", "۱۲۰,۰۰۰", "۹۵,۰۰۰", "۲۶"],
  ["هزینه خسارت و مزایا", "(۷۰,۰۰۰)", "(۶۰,۰۰۰)", "(۱۶)"],
  ["سود(زیان) ناخالص", "۵۰,۰۰۰", "۳۵,۰۰۰", "۴۲"],
  ["سود(زیان) عملیاتی", "۴۰,۰۰۰", "۲۸,۰۰۰", "۴۲"],
  ["سود(زیان) خالص", "۳۰,۰۰۰", "۲۲,۰۰۰", "۳۶"],
  ["سود (زیان) خالص هر سهم– ریال", "۳۰۰", "۲۲۰", "۳۶"],
  ["سرمایه", "۱۰۰,۰۰۰", "۱۰۰,۰۰۰", ""],
]);
const ins = normalizeN10Bank(parseHtmlTables(insTable), { symbol: "بیمهنمونه", company_name: "بیمه نمونه", period_end: "1404-12-29", period_months: 12, audited: false });
check("insurance parsed", !!ins);
if (ins) {
  check("insurance statement_type", ins.statement_type === "insurance");
  check("insurance revenue", ins.standalone.revenue === 120000);
  check("insurance cogs", ins.standalone.cogs === 70000);
  check("insurance net", ins.standalone.net_profit === 30000);
  check("insurance eps", ins.standalone.eps_rial === 300);
}

// جدول صنعتی نباید وارد مسیر بانک شود (درآمد تسهیلات/حق بیمه ندارد).
check("bank normalizer rejects industrial table",
  normalizeN10Bank(n10tables, { symbol: "x", period_end: null, period_months: 12 }) === null);
// اعتبارسنجی حسابی بانک: ناخالص ناسازگار → null.
const badIns = insTable.replace("۵۰,۰۰۰", "۹۹۹,۹۹۹");
check("bank rejects inconsistent gross",
  normalizeN10Bank(parseHtmlTables(badIns), { symbol: "x", period_end: null, period_months: 12 }) === null);

console.log(failed === 0 ? "\nALL TESTS PASSED" : `\n${failed} TESTS FAILED`);
process.exit(failed === 0 ? 0 : 1);
