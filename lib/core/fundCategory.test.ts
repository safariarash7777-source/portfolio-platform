import { test } from "node:test";
import assert from "node:assert/strict";
import { fundCategory, countByCategory, categoryBreakdown, FUND_CATEGORIES } from "./fundCategory";
import { FUND_TYPE_VALUES } from "../market-nav";

/** سیزده نوعِ واقعیِ اسنپ‌شاتِ ۱۴۰۵/۰۶/۲۴ با تعدادِ واقعی‌شان. */
const REAL: Array<[string, number]> = [
  ["صندوق سرمایه گذاری در اوراق با درآمدثابت", 92],
  ["صندوق سرمایه گذاری در سهام", 88],
  ["صندوق سرمایه گذاری بخشی", 62],
  ["صندوق کالایی مبتنی بر طلا", 35],
  ["صندوق کالایی مبتنی بر نقره", 14],
  ["صندوق سرمایه گذاری مختلط", 9],
  ["صندوق های سرمایه گذاری اهرمی", 9],
  ["صندوق سرمایه گذاری املاک و مستغلات", 8],
  ["صندوق سرمایه گذاری جسورانه", 4],
  ["صندوق سرمایه گذاری خصوصی", 3],
  ["صندوق س. صندوق در صندوق", 3],
  ["صندوق کالایی کشاورزی", 2],
  ["صندوق های پروژه", 1],
];

/**
 * تعدادِ **موردِ انتظار** هر دسته پس از نگاشت — با دستِ خودم از همان سیزده عددِ
 * بالا جمع زده شده، نه از خروجیِ کد. یک `deepEqual` روی کلِ نقشه به جای چند
 * `equal` جدا: این‌طور اگر روزی قاعده‌ای صندوقی را به دستهٔ دیگری ببرد، تست
 * می‌شکند حتی اگر آن دسته در تست اسمی نداشته باشد.
 */
const EXPECTED_COUNTS: Record<string, number> = {
  "درآمد ثابت": 92,
  "سهامی": 88,
  "بخشی": 62,
  "طلا": 35,
  "نقره": 14,
  "مختلط": 9,
  "اهرمی": 9,
  "املاک": 8,
  "فراصندوق": 3,
  "کالایی": 2,
  // جسورانه ۴ + خصوصی ۳ + پروژه ۱
  "سایر": 8,
};

test("هر سیزده نوعِ واقعیِ منبع به دستهٔ خودش می‌رود", () => {
  const expected: Array<[string, string]> = [
    ["صندوق سرمایه گذاری در اوراق با درآمدثابت", "درآمد ثابت"],
    ["صندوق سرمایه گذاری در سهام", "سهامی"],
    ["صندوق سرمایه گذاری بخشی", "بخشی"],
    ["صندوق کالایی مبتنی بر طلا", "طلا"],
    ["صندوق کالایی مبتنی بر نقره", "نقره"],
    ["صندوق سرمایه گذاری مختلط", "مختلط"],
    ["صندوق های سرمایه گذاری اهرمی", "اهرمی"],
    ["صندوق سرمایه گذاری املاک و مستغلات", "املاک"],
    ["صندوق س. صندوق در صندوق", "فراصندوق"],
    ["صندوق کالایی کشاورزی", "کالایی"],
    // این سه نوعِ واقعی‌اند ولی دستهٔ تابلویی ندارند و صریحاً «سایر» می‌شوند.
    ["صندوق سرمایه گذاری جسورانه", "سایر"],
    ["صندوق سرمایه گذاری خصوصی", "سایر"],
    ["صندوق های پروژه", "سایر"],
  ];
  assert.equal(expected.length, REAL.length, "فهرستِ تست باید همان سیزده نوع باشد");
  for (const [t, c] of expected) assert.equal(fundCategory(t), c, t);
  // هیچ نوعِ واقعی‌ای از قلم نیفتاده باشد.
  assert.deepEqual(expected.map(([t]) => t).sort(), REAL.map(([t]) => t).sort());
});

test("طلا و نقره زیرِ «کالایی» بلعیده نمی‌شوند", () => {
  // نامِ رسمیِ هر سه با «صندوق کالایی…» شروع می‌شود؛ ترتیبِ قواعد باید این را
  // از هم جدا نگه دارد، وگرنه ۴۹ صندوق به دستهٔ غلط می‌روند.
  assert.equal(fundCategory("صندوق کالایی مبتنی بر طلا"), "طلا");
  assert.equal(fundCategory("صندوق کالایی مبتنی بر نقره"), "نقره");
  assert.equal(fundCategory("صندوق کالایی کشاورزی"), "کالایی");
});

test("نوعِ ناشناخته به سایر می‌رود — بی‌صدا حذف نمی‌شود", () => {
  assert.equal(fundCategory("یک نوعِ کاملاً تازه"), "سایر");
  assert.equal(fundCategory(""), "سایر");
  assert.equal(fundCategory(null), "سایر");
  assert.equal(fundCategory(undefined), "سایر");
});

test("هیچ صندوقی در نگاشت گم نمی‌شود — جمعِ دسته‌ها برابرِ کلِ صندوق‌هاست", () => {
  const rows = REAL.flatMap(([t, n]) => Array.from({ length: n }, () => ({ type: t })));
  assert.equal(rows.length, 330, "کلِ اسنپ‌شات ۳۳۰ صندوق بود");
  const counts = countByCategory(rows);
  const sum = [...counts.values()].reduce((a, b) => a + b, 0);
  assert.equal(sum, 330);
});

test("شمارشِ هر دسته با دادهٔ واقعی می‌خواند", () => {
  const rows = REAL.flatMap(([t, n]) => Array.from({ length: n }, () => ({ type: t })));
  const c = countByCategory(rows);
  assert.deepEqual(Object.fromEntries([...c]), EXPECTED_COUNTS);
});

test("تفاوتِ فاصله و «صندوق های» نگاشت را نمی‌شکند", () => {
  assert.equal(fundCategory("صندوق  سرمایه گذاری  اهرمی"), "اهرمی");
  assert.equal(fundCategory("اوراق با درآمد ثابت"), "درآمد ثابت");
});

test("دسته‌ها یکتا و «سایر» آخر است", () => {
  assert.equal(new Set(FUND_CATEGORIES).size, FUND_CATEGORIES.length);
  assert.equal(FUND_CATEGORIES[FUND_CATEGORIES.length - 1], "سایر");
});


/* ── مقاومت در برابرِ تغییرِ نگارشِ منبع ──────────────────────────────────── */

test("نگارشِ کوتاه‌ترِ منبع هم درست دسته‌بندی می‌شود", () => {
  // اگر منبع روزی «صندوق کالایی مبتنی بر طلا» را «صندوق طلا» بنویسد، این ۳۵
  // صندوق نباید بی‌صدا به «سایر» بیفتند.
  assert.equal(fundCategory("صندوق طلا"), "طلا");
  assert.equal(fundCategory("صندوق در سهام"), "سهامی");
  assert.equal(fundCategory("صندوق سهامی"), "سهامی");
  assert.equal(fundCategory("صندوق با درآمد ثابت"), "درآمد ثابت");
});

test("نقره هرگز طلا نمی‌شود، با هر نگارشی", () => {
  assert.equal(fundCategory("صندوق کالایی مبتنی بر نقره"), "نقره");
  assert.equal(fundCategory("صندوق نقره"), "نقره");
  assert.notEqual(fundCategory("صندوق نقره"), "طلا");
});

test("نگاشت روی ۱۳ نوعِ واقعی دست‌نخورده می‌ماند", () => {
  const rows = REAL.flatMap(([t, n]) => Array.from({ length: n }, () => ({ type: t })));
  const c = countByCategory(rows);
  assert.deepEqual(Object.fromEntries([...c]), EXPECTED_COUNTS);
  assert.equal([...c.values()].reduce((a, b) => a + b, 0), 330);
});

/* ── قراردادِ URL ────────────────────────────────────────────────────────── */

test("مقادیرِ مجازِ ?type= دقیقاً همان دسته‌های واقعی‌اند", () => {
  // `lib/market-nav.ts` این فهرست را برای اعتبارسنجیِ URL نگه می‌دارد. اگر دو
  // فهرست از هم جدا بیفتند، یک دستهٔ واقعی از فیلترِ برگشت می‌افتد (یا برعکس،
  // مقداری مجاز می‌شود که هیچ صندوقی ندارد) — و هیچ‌کدام سر و صدا نمی‌کند.
  assert.deepEqual([...FUND_TYPE_VALUES].sort(), [...FUND_CATEGORIES].sort());
});


/* ── تفکیک ───────────────────────────────────────────────────────────────── */

const realRows = () => REAL.flatMap(([t, n]) => Array.from({ length: n }, () => ({ type: t })));

test("تفکیک سهمِ هر دسته را می‌دهد و جمعِ سهم‌ها یک است", () => {
  const b = categoryBreakdown(realRows());
  assert.equal(b.total, 330);
  // فقط دسته‌های دارای صندوق — هیچ ردیفِ صفری در پنل رندر نمی‌شود.
  assert.equal(b.slices.length, Object.keys(EXPECTED_COUNTS).length);
  for (const s of b.slices) assert.ok(s.count > 0, `${s.category} نباید صفر باشد`);
  assert.deepEqual(
    Object.fromEntries(b.slices.map((s) => [s.category, s.count])),
    EXPECTED_COUNTS,
  );
  const sum = b.slices.reduce((a, s) => a + s.share, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `جمعِ سهم‌ها ${sum} شد`);
});

test("ترتیبِ تفکیک: پرجمعیت‌ترین اول، «سایر» آخر", () => {
  const b = categoryBreakdown(realRows());
  assert.equal(b.slices[0].category, "درآمد ثابت");
  assert.equal(b.slices[b.slices.length - 1].category, "سایر");
  const withoutOther = b.slices.filter((s) => s.category !== "سایر");
  for (let i = 1; i < withoutOther.length; i++) {
    assert.ok(
      withoutOther[i - 1].count >= withoutOther[i].count,
      "ترتیب نزولیِ تعداد نیست",
    );
  }
});

test("«سایر» حتی وقتی پرجمعیت‌ترین است آخر می‌ماند", () => {
  // «سایر» یک دسته نیست، باقی‌ماندهٔ دسته‌بندی است؛ صدرِ جدول جای آن نیست.
  const b = categoryBreakdown([
    ...Array.from({ length: 50 }, () => ({ type: "یک نوعِ تازه" })),
    { type: "صندوق کالایی مبتنی بر طلا" },
  ]);
  assert.equal(b.slices[b.slices.length - 1].category, "سایر");
  assert.equal(b.slices[0].category, "طلا");
});

test("ردیفِ بدونِ ارزشِ بازار صفر حساب نمی‌شود — پوشش جدا گزارش می‌شود", () => {
  const b = categoryBreakdown([
    { type: "صندوق کالایی مبتنی بر طلا", marketValue: 200 },
    { type: "صندوق کالایی مبتنی بر طلا", marketValue: null },
    { type: "صندوق کالایی مبتنی بر طلا" },
  ]);
  const gold = b.slices.find((s) => s.category === "طلا")!;
  assert.equal(gold.count, 3);
  assert.equal(gold.marketValue, 200);
  assert.equal(gold.marketValueCovered, 1, "فقط یک ردیف ارزشِ بازار داشت");
  assert.equal(b.marketValueTotal, 200);
  assert.equal(b.marketValueCovered, 1);
});

test("دستهٔ بدونِ هیچ ارزشِ بازاری null می‌دهد، نه صفر", () => {
  const b = categoryBreakdown([{ type: "صندوق سرمایه گذاری در سهام" }]);
  assert.equal(b.slices[0].marketValue, null);
  assert.equal(b.slices[0].marketValueCovered, 0);
  assert.equal(b.marketValueTotal, null);
});

test("میانگینِ بازده فقط روی ردیف‌های دارای بازده گرفته می‌شود", () => {
  const b = categoryBreakdown([
    { type: "صندوق سرمایه گذاری بخشی", changePercent: 2 },
    { type: "صندوق سرمایه گذاری بخشی", changePercent: 4 },
    { type: "صندوق سرمایه گذاری بخشی", changePercent: null },
    // فقط قیمتِ پایانی دارد — باید شمرده شود، نه کنار گذاشته.
    { type: "صندوق سرمایه گذاری بخشی", closingChangePercent: -6 },
  ]);
  const s = b.slices[0];
  assert.equal(s.ratedCount, 3);
  assert.equal(s.avgChangePercent, 0);
  assert.equal(s.count, 4);
});

test("مجموعهٔ خالی خروجیِ خالیِ بی‌خطا می‌دهد", () => {
  const b = categoryBreakdown([]);
  assert.deepEqual(b.slices, []);
  assert.equal(b.total, 0);
  assert.equal(b.marketValueTotal, null);
});

test("دستهٔ هر دسته از `?type=` قابلِ انتخاب است", () => {
  // هر دسته‌ای که تفکیک نشان می‌دهد باید مقدارِ مجازِ URL هم باشد، وگرنه چیپ
  // کلیک می‌شود و فیلتر بی‌صدا نادیده گرفته می‌شود.
  const allowed = new Set<string>(FUND_TYPE_VALUES);
  for (const s of categoryBreakdown(realRows()).slices) {
    assert.ok(allowed.has(s.category), `${s.category} در FUND_TYPE_VALUES نیست`);
  }
});

test("درصدهای نوشته‌شده دقیقاً ۱۰۰ می‌شوند، نه ۱۰۱", () => {
  // گِردکردنِ جداگانه روی این سیزده نوع ۱۰۱٪ می‌داد؛ ستونی که جمعش ۱۰۱ است
  // اولین چیزی است که یک خوانندهٔ دقیق به آن شک می‌کند.
  const b = categoryBreakdown(realRows());
  const sum = b.slices.reduce((a, s) => a + s.sharePercent, 0);
  assert.equal(sum, 100);
  // بزرگ‌ترین دسته نباید به‌خاطرِ گِردکردن جابه‌جا شود.
  assert.equal(b.slices[0].sharePercent, 28);
});

test("درصدِ صحیح با سهمِ واقعی بیش از یک واحد فاصله نمی‌گیرد", () => {
  for (const s of categoryBreakdown(realRows()).slices) {
    assert.ok(
      Math.abs(s.sharePercent - s.share * 100) <= 1,
      `${s.category}: ${s.sharePercent} در برابرِ ${s.share * 100}`,
    );
  }
});

test("دستهٔ خیلی کوچک صفر می‌شود ولی ناپدید نمی‌شود", () => {
  const rows = [
    ...Array.from({ length: 400 }, () => ({ type: "صندوق سرمایه گذاری در سهام" })),
    { type: "صندوق های پروژه" },
  ];
  const b = categoryBreakdown(rows);
  const other = b.slices.find((s) => s.category === "سایر")!;
  assert.equal(other.count, 1, "ردیف باید بماند");
  assert.equal(other.sharePercent, 0, "۱ از ۴۰۱ به صفر گرد می‌شود — UI «کمتر از ٪۱» می‌نویسد");
  assert.equal(b.slices.reduce((a, s) => a + s.sharePercent, 0), 100);
});

test("درصدها روی یک دستهٔ تنها ۱۰۰ است", () => {
  const b = categoryBreakdown([{ type: "صندوق کالایی مبتنی بر طلا" }]);
  assert.equal(b.slices[0].sharePercent, 100);
});
