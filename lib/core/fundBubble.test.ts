import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bubblePercent, bubbleSeries, summarizeBubble, bubbleWindow, liveBubble,
  MIN_PRICE_NAV_RATIO, MAX_PRICE_NAV_RATIO, NAV_STALE_HOURS, FUTURE_SKEW_TOLERANCE_HOURS,
  type NavPricePoint,
} from "./fundBubble";

/* ── تعریفِ پایه ───────────────────────────────────────────────────────── */

test("حباب: قیمتِ بالاتر از NAV مثبت، پایین‌تر منفی، برابر صفر", () => {
  assert.equal(bubblePercent(110, 100), 10);
  assert.equal(bubblePercent(90, 100), -10);
  assert.equal(bubblePercent(100, 100), 0);
});

test("حباب: ورودیِ ناموجود/صفر/منفی → null، هرگز صفر", () => {
  for (const bad of [null, undefined, 0, -5, NaN, Infinity]) {
    assert.equal(bubblePercent(bad as number, 100), null, `price=${String(bad)}`);
    assert.equal(bubblePercent(100, bad as number), null, `nav=${String(bad)}`);
  }
});

test("حباب: خطای واحد ریال/تومان (۱۰ برابر) گرفته می‌شود", () => {
  // همان صندوق، ولی قیمت اشتباهاً ریال مانده
  assert.equal(bubblePercent(1000, 100), null, "۱۰ برابر باید رد شود");
  assert.equal(bubblePercent(100, 1000), null, "یک‌دهم باید رد شود");
});

test("حباب: رفتارِ واقعیِ صندوقِ اهرمی حذف نمی‌شود", () => {
  // حبابِ +۴۵٪ در صندوقِ اهرمی عادی است و نباید فیلتر شود
  const b = bubblePercent(145, 100);
  assert.ok(b !== null && Math.abs(b - 45) < 1e-9);
  // مرزها دقیقاً همان‌اند که مستند شده
  assert.equal(bubblePercent(MIN_PRICE_NAV_RATIO * 100, 100), -80);
  assert.equal(bubblePercent(MAX_PRICE_NAV_RATIO * 100, 100), 400);
});

/* ── سری و پوشش ───────────────────────────────────────────────────────── */

const S: NavPricePoint[] = [
  { trade_date: "2026-08-03", nav: 100, close: 105 },
  { trade_date: "2026-08-01", nav: 100, close: 110 },
  { trade_date: "2026-08-02", nav: 100, close: null }, // قیمت نداریم
  { trade_date: "2026-08-04", nav: 0, close: 100 },    // NAV نداریم
  { trade_date: "2026-08-05", nav: 100, close: 5000 }, // خطای واحد
];

test("سری: مرتب‌سازی صعودی و شمارشِ تفکیک‌شدهٔ روزهای کنارگذاشته", () => {
  const s = bubbleSeries(S);
  assert.deepEqual(s.points.map((p) => p.trade_date), ["2026-08-01", "2026-08-03"]);
  assert.deepEqual(s.skipped, { missingPrice: 1, missingNav: 1, implausibleRatio: 1 });
});

test("سری: هیچ درون‌یابی — روزِ غایب ساخته نمی‌شود", () => {
  const s = bubbleSeries(S);
  assert.equal(s.points.length, 2);
  assert.ok(!s.points.some((p) => p.trade_date === "2026-08-02"));
});

test("پوشش: بازهٔ واقعی گزارش می‌شود، نه بازهٔ درخواستی", () => {
  const s = bubbleSeries(S);
  assert.deepEqual(s.coverage, {
    firstDate: "2026-08-01",
    lastDate: "2026-08-03",
    observedDays: 2,          // دو مشاهده
    calendarSpanDays: 3,      // ولی سه روزِ تقویمی — این دو یکی نیستند
  });
});

test("سریِ خالی: coverage و summary هر دو null، نه صفر", () => {
  const s = bubbleSeries([{ trade_date: "2026-08-01", nav: 0, close: null }]);
  assert.equal(s.coverage, null);
  assert.equal(summarizeBubble(s), null);
});

/* ── خلاصه ────────────────────────────────────────────────────────────── */

test("خلاصه: جاری، کمینه، بیشینه، میانه و فاصله از میانه", () => {
  const s = bubbleSeries([
    { trade_date: "2026-08-01", nav: 100, close: 90 },  // -10
    { trade_date: "2026-08-02", nav: 100, close: 100 }, //   0
    { trade_date: "2026-08-03", nav: 100, close: 120 }, // +20
  ]);
  const sum = summarizeBubble(s)!;
  assert.equal(sum.current, 20, "جاری = آخرین روز، نه بیشینه");
  assert.equal(sum.min, -10);
  assert.equal(sum.max, 20);
  assert.equal(sum.median, 0);
  assert.equal(sum.vsMedian, 20);
  assert.equal(sum.observedDays, 3);
});

/* ── گاردِ پنجرهٔ فاقدِ داده — قلبِ این ماژول ─────────────────────────── */

function span(days: number): NavPricePoint[] {
  const out: NavPricePoint[] = [];
  const start = Date.parse("2026-07-18");
  for (let i = 0; i < days; i++) {
    out.push({
      trade_date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
      nav: 100,
      close: 100 + i,
    });
  }
  return out;
}

test("پنجره: ۹۰ روزه روی پوششِ ~۳۷ روزه ساخته نمی‌شود", () => {
  const s = bubbleSeries(span(37));
  assert.equal(bubbleWindow(s, 90), null, "مقایسهٔ فصلی نباید از ۳۷ روز ساخته شود");
  assert.equal(bubbleWindow(s, 180), null);
});

test("پنجره: ۳۰ روزه روی پوششِ ۳۷ روزه ساخته می‌شود", () => {
  const s = bubbleSeries(span(37));
  const w = bubbleWindow(s, 30);
  assert.ok(w !== null, "۳۰ روز داخلِ پوشش است");
  assert.ok(w!.observedDays <= 37 && w!.observedDays >= 30);
});

test("پنجره: تلورانس مرزی است، نه دلبخواهی", () => {
  const s = bubbleSeries(span(37)); // calendarSpanDays = 37
  // ۴۰ روز با تلورانسِ ۲۰٪ لازم دارد ۳۲ ⇒ عبور می‌کند
  assert.ok(bubbleWindow(s, 40) !== null);
  // ۵۰ روز لازم دارد ۴۰ ⇒ رد می‌شود
  assert.equal(bubbleWindow(s, 50), null);
});

test("پنجره: روی سریِ خالی null، نه صفر", () => {
  assert.equal(bubbleWindow(bubbleSeries([]), 30), null);
});

/* ── حبابِ جاری و ناسازگاریِ زمان ─────────────────────────────────────── */

const NOW = new Date("2026-09-06T12:00:00Z");

test("جاری: NAV تازه → ready", () => {
  const r = liveBubble({ priceToman: 110, navToman: 100, navAt: "2026-09-06T09:00:00Z", now: NOW });
  assert.equal(r.state, "ready");
  assert.equal(r.bubblePercent, 10);
  assert.equal(r.reason, null);
});

test("جاری: NAV کهنه‌تر از ۲۴ ساعت → stale با عدد و علت، نه حذفِ خاموش", () => {
  const r = liveBubble({ priceToman: 110, navToman: 100, navAt: "2026-09-04T09:00:00Z", now: NOW });
  assert.equal(r.state, "stale");
  assert.equal(r.bubblePercent, 10, "عدد نگه داشته می‌شود ولی برچسبِ کهنه می‌خورد");
  assert.ok(r.navAgeHours! > NAV_STALE_HOURS);
  assert.match(r.reason!, /ساعت پیش/);
});

test("جاری: زمانِ NAV نداریم → unavailable، نه ready", () => {
  for (const bad of [null, undefined, "not-a-date"]) {
    const r = liveBubble({ priceToman: 110, navToman: 100, navAt: bad as string, now: NOW });
    assert.equal(r.state, "unavailable", `navAt=${String(bad)}`);
    assert.equal(r.bubblePercent, null, "بدونِ زمان، عدد منتشر نمی‌شود");
  }
});

test("جاری: دقیقاً روی مرزِ ۲۴ ساعت هنوز ready است", () => {
  const at = new Date(NOW.getTime() - NAV_STALE_HOURS * 3_600_000).toISOString();
  assert.equal(liveBubble({ priceToman: 110, navToman: 100, navAt: at, now: NOW }).state, "ready");
  const past = new Date(NOW.getTime() - (NAV_STALE_HOURS * 3_600_000 + 60_000)).toISOString();
  assert.equal(liveBubble({ priceToman: 110, navToman: 100, navAt: past, now: NOW }).state, "stale");
});

/* ── زمانِ NAV از فیدِ جلالیِ رله ─────────────────────────────────────── */

import { navAtIso, TEHRAN_UTC_OFFSET } from "./fundBubble";
import { jalaliYmdToGregorian } from "./jalali";

test("navAtIso: تاریخِ جلالی + ساعتِ تهران → ISO درست", () => {
  const iso = navAtIso("1405-06-15", "16:40:00", jalaliYmdToGregorian);
  assert.equal(iso, `2026-09-06T16:40:00${TEHRAN_UTC_OFFSET}`);
  // ۱۶:۴۰ تهران = ۱۳:۱۰ UTC
  assert.equal(new Date(iso!).toISOString(), "2026-09-06T13:10:00.000Z");
});

test("navAtIso: ساعتِ بدونِ ثانیه پذیرفته می‌شود", () => {
  assert.equal(navAtIso("1405-06-15", "09:05", jalaliYmdToGregorian), `2026-09-06T09:05:00${TEHRAN_UTC_OFFSET}`);
});

test("navAtIso: ورودیِ ناقص → null، نه زمانِ حدسی", () => {
  assert.equal(navAtIso(null, "16:40:00", jalaliYmdToGregorian), null);
  assert.equal(navAtIso("", "16:40:00", jalaliYmdToGregorian), null);
  assert.equal(navAtIso("not-jalali", "16:40:00", jalaliYmdToGregorian), null);
});

test("navAtIso: ساعتِ خراب به نیمه‌شب می‌افتد، ولی تاریخ حفظ می‌شود", () => {
  // نبودِ ساعت نباید کلِ روز را دور بیندازد؛ ولی سن محافظه‌کارانه‌تر می‌شود
  assert.equal(navAtIso("1405-06-15", "xx:yy", jalaliYmdToGregorian), `2026-09-06T00:00:00${TEHRAN_UTC_OFFSET}`);
  assert.equal(navAtIso("1405-06-15", null, jalaliYmdToGregorian), `2026-09-06T00:00:00${TEHRAN_UTC_OFFSET}`);
});

/* ── تطبیق با محاسبهٔ مستقلِ رله (دادهٔ واقعیِ Production ۱۴۰۵/۰۶/۱۵) ──── */

test("تطبیق: موتورِ ما همان عددی را می‌دهد که رله مستقلاً حساب کرده", () => {
  // سه ردیفِ واقعی از ir_market_snapshots — قیمت و NAV تومان، bubblePercent محاسبهٔ رله
  const live = [
    { id: "عیار", price: 64000, nav: 63284, relay: 1.13 },
    { id: "سپر", price: 4632, nav: 4632, relay: -0.01 },
    { id: "فیروزا", price: 9018, nav: 9019, relay: -0.01 },
  ];
  for (const r of live) {
    const ours = bubblePercent(r.price, r.nav);
    assert.ok(ours !== null, `${r.id} باید عدد بدهد`);
    assert.ok(
      Math.abs(ours! - r.relay) < 0.02,
      `${r.id}: ما ${ours!.toFixed(4)} در برابرِ رله ${r.relay}`,
    );
  }
});

/* ── تحملِ اختلافِ ساعت با رله (یافتهٔ رندرِ آزمایشی) ─────────────────── */

test("جاری: اختلافِ ساعتِ کوچکِ رو به آینده حباب را حذف نمی‌کند", () => {
  // NAV یک ساعت «جلوتر» از ساعتِ سرور — skew، نه خرابی
  const at = new Date(NOW.getTime() + 60 * 60_000).toISOString();
  const r = liveBubble({ priceToman: 110, navToman: 100, navAt: at, now: NOW });
  assert.equal(r.state, "ready", "skew کوچک نباید عدد را از صفحه بردارد");
  assert.equal(r.bubblePercent, 10);
  assert.equal(r.navAgeHours, 0, "سنِ منفی به صفر گرد می‌شود");
});

test("جاری: زمانِ آیندهٔ بزرگ همچنان رد می‌شود (ساعتِ خرابِ منبع)", () => {
  const at = new Date(NOW.getTime() + 5 * 60 * 60_000).toISOString();
  const r = liveBubble({ priceToman: 110, navToman: 100, navAt: at, now: NOW });
  assert.equal(r.state, "unavailable");
  assert.equal(r.bubblePercent, null);
});

test("جاری: مرزِ تحمل دقیقاً همان‌جاست که مستند شده", () => {
  const inside = new Date(NOW.getTime() + FUTURE_SKEW_TOLERANCE_HOURS * 3_600_000).toISOString();
  assert.equal(liveBubble({ priceToman: 110, navToman: 100, navAt: inside, now: NOW }).state, "ready");
  const outside = new Date(NOW.getTime() + FUTURE_SKEW_TOLERANCE_HOURS * 3_600_000 + 60_000).toISOString();
  assert.equal(liveBubble({ priceToman: 110, navToman: 100, navAt: outside, now: NOW }).state, "unavailable");
});
