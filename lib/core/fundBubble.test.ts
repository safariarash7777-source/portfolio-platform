import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bubblePercent, bubbleSeries, summarizeBubble, bubbleWindow, liveBubble,
  MIN_PRICE_NAV_RATIO, MAX_PRICE_NAV_RATIO, NAV_STALE_HOURS, FUTURE_SKEW_TOLERANCE_HOURS,
  MIN_WINDOW_OBSERVATIONS, MAX_PAIRING_GAP_HOURS,
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
  assert.equal(sum.lastObserved, 20, "آخرین ثبتِ تاریخچه = آخرین روز، نه بیشینه");
  assert.equal(sum.lastObservedDate, "2026-08-03");
  assert.equal(sum.min, -10);
  assert.equal(sum.max, 20);
  assert.equal(sum.median, 0);
  assert.equal(sum.lastVsMedian, 20);
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

/* ── حبابِ جاری: سه واقعیتِ زمانیِ متفاوت ─────────────────────────────────── */

const NOW = new Date("2026-09-06T12:00:00Z");
const hAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

test("جاری: NAV و قیمتِ تازه و هم‌زمان → ready", () => {
  const r = liveBubble({ priceToman: 110, navToman: 100, navAt: hAgo(1), priceAt: hAgo(0.1), now: NOW });
  assert.equal(r.state, "ready");
  assert.equal(r.bubblePercent, 10);
  assert.equal(r.reason, null);
  assert.ok(r.navAgeHours! > 0 && r.priceAgeHours! >= 0);
});

test("جاری: NAV کهنه‌تر از ۲۴ ساعت → stale با عدد و علت، نه حذفِ خاموش", () => {
  const r = liveBubble({ priceToman: 110, navToman: 100, navAt: hAgo(30), priceAt: hAgo(0.1), now: NOW });
  assert.equal(r.state, "stale");
  assert.equal(r.bubblePercent, 10, "عدد نگه داشته می‌شود ولی برچسبِ کهنه می‌خورد");
  assert.match(r.reason!, /ساعت پیش/);
});

test("جاری: سنِ قیمت گزارش می‌شود، نه فقط سنِ NAV", () => {
  const r = liveBubble({ priceToman: 110, navToman: 100, navAt: hAgo(1), priceAt: hAgo(3), now: NOW });
  assert.equal(Math.round(r.priceAgeHours!), 3);
  assert.equal(Math.round(r.navAgeHours!), 1);
});

test("جاری: قیمتِ امروز با NAVِ دیروز جفت نمی‌شود — حتی وقتی هر دو «تازه»اند", () => {
  // NAV ۲۰ ساعت پیش (زیرِ آستانهٔ کهنگی) ولی قیمت همین حالا: فاصلهٔ ۲۰ ساعت.
  // بدونِ گاردِ هم‌زمانی این «ready» می‌شد و عددش نیمی تغییرِ NAV بود، نه حباب.
  const r = liveBubble({ priceToman: 110, navToman: 100, navAt: hAgo(20), priceAt: hAgo(0), now: NOW });
  assert.equal(r.state, "stale");
  assert.ok(r.pairingGapHours! > MAX_PAIRING_GAP_HOURS);
  assert.match(r.reason!, /فاصله دارند/);
});

test("جاری: فاصلهٔ کوچکِ دو ورودی مانع نیست", () => {
  const r = liveBubble({ priceToman: 110, navToman: 100, navAt: hAgo(2), priceAt: hAgo(0.1), now: NOW });
  assert.equal(r.state, "ready");
  assert.ok(r.pairingGapHours! < MAX_PAIRING_GAP_HOURS);
});

test("جاری: بدونِ زمانِ قیمت، هم‌زمانی سنجیده نمی‌شود و null می‌ماند", () => {
  const r = liveBubble({ priceToman: 110, navToman: 100, navAt: hAgo(1), now: NOW });
  assert.equal(r.state, "ready");
  assert.equal(r.pairingGapHours, null, "نبودِ زمانِ قیمت نباید صفر گرفته شود");
  assert.equal(r.priceAgeHours, null);
});

test("جاری: زمانِ NAV نداریم → unavailable، نه ready", () => {
  for (const bad of [null, undefined, "not-a-date"]) {
    const r = liveBubble({ priceToman: 110, navToman: 100, navAt: bad as string, now: NOW });
    assert.equal(r.state, "unavailable", `navAt=${String(bad)}`);
    assert.equal(r.bubblePercent, null, "بدونِ زمان، عدد منتشر نمی‌شود");
  }
});

test("جاری: دقتِ روزانه پنهان نمی‌شود", () => {
  const r = liveBubble({
    priceToman: 110, navToman: 100, navAt: hAgo(1), navPrecision: "day", priceAt: hAgo(0.1), now: NOW,
  });
  assert.equal(r.navTimePrecision, "day");
  assert.match(r.reason!, /ساعتِ NAV ثبت نشده/, "کاربر باید بداند ساعت را نمی‌دانیم");
});

test("جاری: دقتِ روزانه در حالتِ کهنه هم گفته می‌شود", () => {
  const r = liveBubble({
    priceToman: 110, navToman: 100, navAt: hAgo(30), navPrecision: "day", priceAt: hAgo(0.1), now: NOW,
  });
  assert.equal(r.state, "stale");
  assert.match(r.reason!, /سن حداکثری/, "سن از ابتدای روز حساب شده و ممکن است تازه‌تر باشد");
});

/* ── تحملِ اختلافِ ساعت: دقیقه‌ای، نه ساعتی ──────────────────────────────── */

test("جاری: اختلافِ ساعتِ کوچکِ رو به آینده حباب را حذف نمی‌کند", () => {
  const at = new Date(NOW.getTime() + 5 * 60_000).toISOString(); // ۵ دقیقه جلوتر
  const r = liveBubble({ priceToman: 110, navToman: 100, navAt: at, now: NOW });
  assert.equal(r.state, "ready", "skew دقیقه‌ای نباید عدد را از صفحه بردارد");
  assert.equal(r.navAgeHours, 0, "سنِ منفی به صفر گرد می‌شود");
});

test("جاری: منطقهٔ زمانیِ اشتباه پوشانده نمی‌شود", () => {
  // خطای منطقهٔ زمانی معمولاً ساعت‌ها جابه‌جاست. تحملِ دوساعتیِ نسخهٔ قبل
  // دقیقاً همین را می‌پوشاند؛ تحملِ ۱۵ دقیقه‌ای آن را می‌گیرد.
  const r = liveBubble({ priceToman: 110, navToman: 100, navAt: hAgo(-3.5), now: NOW });
  assert.equal(r.state, "unavailable");
  assert.match(r.reason!, /آینده/);
});

test("جاری: مرزِ تحمل دقیقاً همان‌جاست که مستند شده", () => {
  const inside = new Date(NOW.getTime() + FUTURE_SKEW_TOLERANCE_HOURS * 3_600_000).toISOString();
  assert.equal(liveBubble({ priceToman: 110, navToman: 100, navAt: inside, now: NOW }).state, "ready");
  const outside = new Date(NOW.getTime() + FUTURE_SKEW_TOLERANCE_HOURS * 3_600_000 + 60_000).toISOString();
  assert.equal(liveBubble({ priceToman: 110, navToman: 100, navAt: outside, now: NOW }).state, "unavailable");
});

test("جاری: زمانِ قیمتِ آینده هم رد می‌شود", () => {
  const r = liveBubble({ priceToman: 110, navToman: 100, navAt: hAgo(1), priceAt: hAgo(-3), now: NOW });
  assert.equal(r.state, "unavailable");
  assert.match(r.reason!, /قیمت در آینده/);
});

/* ── زمانِ NAV از فیدِ جلالیِ رله ─────────────────────────────────────── */

import { navAtIso, TEHRAN_UTC_OFFSET } from "./fundBubble";
import { jalaliYmdToGregorian } from "./jalali";

test("navAtIso: تاریخِ جلالی + ساعتِ تهران → ISO درست", () => {
  const at = navAtIso("1405-06-15", "16:40:00", jalaliYmdToGregorian)!;
  const iso = at.iso;
  assert.equal(iso, `2026-09-06T16:40:00${TEHRAN_UTC_OFFSET}`);
  // ۱۶:۴۰ تهران = ۱۳:۱۰ UTC
  assert.equal(new Date(iso).toISOString(), "2026-09-06T13:10:00.000Z");
  assert.equal(at.precision, "minute");
});

test("navAtIso: ساعتِ بدونِ ثانیه پذیرفته می‌شود", () => {
  assert.deepEqual(navAtIso("1405-06-15", "09:05", jalaliYmdToGregorian), { iso: `2026-09-06T09:05:00${TEHRAN_UTC_OFFSET}`, precision: "minute" });
});

test("navAtIso: ورودیِ ناقص → null، نه زمانِ حدسی", () => {
  assert.equal(navAtIso(null, "16:40:00", jalaliYmdToGregorian), null);
  assert.equal(navAtIso("", "16:40:00", jalaliYmdToGregorian), null);
  assert.equal(navAtIso("not-jalali", "16:40:00", jalaliYmdToGregorian), null);
});

test("navAtIso: نبودِ ساعت با دقتِ «روز» برمی‌گردد، نه دقتِ ساختگی", () => {
  // نبودِ ساعت نباید کلِ روز را دور بیندازد؛ ولی نباید وانمود کند ساعت را می‌داند
  for (const bad of ["xx:yy", null, ""]) {
    const at = navAtIso("1405-06-15", bad as string, jalaliYmdToGregorian)!;
    assert.equal(at.iso, `2026-09-06T00:00:00${TEHRAN_UTC_OFFSET}`, "از ابتدای روز — سنِ حداکثری");
    assert.equal(at.precision, "day", "دقت باید صریحاً «روز» باشد");
  }
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


/* ── چگالیِ پنجره — یافتهٔ بازبینی ───────────────────────────────────────── */

test("پنجره: بازهٔ کشیده ولی تُنُک خلاصه نمی‌سازد", () => {
  // پنج روزِ اولِ بازه، بعد یک روز در انتها. کشیدگی ۵۰ روز است و از گاردِ
  // اول رد می‌شود — ولی «میانهٔ ۳۰ روزه» اینجا از **یک مشاهده** درمی‌آمد.
  const pts: NavPricePoint[] = [];
  const start = Date.parse("2026-07-18");
  for (let i = 0; i < 5; i++) {
    pts.push({ trade_date: new Date(start + i * 86_400_000).toISOString().slice(0, 10), nav: 100, close: 105 });
  }
  pts.push({ trade_date: new Date(start + 49 * 86_400_000).toISOString().slice(0, 10), nav: 100, close: 108 });
  const s = bubbleSeries(pts);
  assert.equal(s.coverage!.calendarSpanDays, 50, "کشیدگی از گاردِ اول رد می‌شود");
  assert.equal(bubbleWindow(s, 30), null, "ولی چگالی کافی نیست");
});

test("پنجره: بازهٔ کشیده و پرْ خلاصه می‌سازد", () => {
  const pts: NavPricePoint[] = [];
  const start = Date.parse("2026-07-18");
  // ۳۷ روزِ معاملاتی پخش‌شده در ۵۰ روزِ تقویمی — همان شکلِ دادهٔ واقعی
  for (let i = 0; i < 50; i++) {
    const d = new Date(start + i * 86_400_000);
    if (d.getUTCDay() === 4 || d.getUTCDay() === 5) continue; // تعطیلیِ پنجشنبه/جمعه
    pts.push({ trade_date: d.toISOString().slice(0, 10), nav: 100, close: 105 });
  }
  const s = bubbleSeries(pts);
  assert.ok(s.points.length >= 30);
  assert.ok(bubbleWindow(s, 30) !== null, "پنجرهٔ ۳۰ روزه روی دادهٔ پُر باید ساخته شود");
  assert.equal(bubbleWindow(s, 90), null, "۹۰ روز همچنان ساخته نمی‌شود");
});

test("پنجره: کفِ مطلقِ تعدادِ مشاهده رعایت می‌شود", () => {
  const pts: NavPricePoint[] = [];
  const start = Date.parse("2026-08-25");
  for (let i = 0; i < 4; i++) {
    pts.push({ trade_date: new Date(start + i * 86_400_000).toISOString().slice(0, 10), nav: 100, close: 105 });
  }
  const s = bubbleSeries(pts);
  assert.ok(s.points.length < MIN_WINDOW_OBSERVATIONS);
  assert.equal(bubbleWindow(s, 5), null, "زیرِ کفِ مطلق، خلاصه ساخته نمی‌شود");
});

test("جاری: زمانِ یک‌ساعت‌جلوترِ NAV هم خرابیِ ساعت است، نه skew", () => {
  // ⚠️ این تست مرزِ بینِ «تحملِ دقیقه‌ای» و «تحملِ ساعتی» را می‌سنجد.
  // بدونِ آن، برگرداندنِ تحمل به ۲ ساعت هیچ تستی را قرمز نمی‌کرد — یعنی
  // کاهشِ تحمل از ۲ ساعت به ۱۵ دقیقه یک تغییرِ **آزموده‌نشده** می‌ماند.
  const r = liveBubble({ priceToman: 110, navToman: 100, navAt: hAgo(-1), now: NOW });
  assert.equal(r.state, "unavailable", "NAVِ یک ساعت جلوتر از ساعتِ ما یعنی ساعتِ منبع خراب است");
  assert.match(r.reason!, /آینده/);
});

test("پنجره: نمادِ کم‌معامله ولی منظم، به‌خاطرِ کم‌بودنِ مشاهده رد نمی‌شود", () => {
  // ⚠️ این تست دلیلِ وجودِ چگالیِ خودِ سری است. صندوقی که ذاتاً هر پنج روز
  // یک‌بار معامله می‌شود، با یک نسبتِ تقویمیِ ثابت (که فرض می‌کند بازار هر روز
  // باز است) بی‌دلیل رد می‌شد. بدونِ این تست، برگرداندنِ چگالی به عددِ ثابت
  // هیچ تستی را قرمز نمی‌کرد.
  const pts: NavPricePoint[] = [];
  const start = Date.parse("2026-05-01");
  for (let i = 0; i < 100; i += 5) {
    pts.push({ trade_date: new Date(start + i * 86_400_000).toISOString().slice(0, 10), nav: 100, close: 103 });
  }
  const s = bubbleSeries(pts);
  assert.equal(s.points.length, 20);
  assert.ok(s.coverage!.calendarSpanDays >= 95);
  const w = bubbleWindow(s, 50);
  assert.ok(w !== null, "چگالیِ خودِ سری ۰٫۲ است؛ ۱۰ مشاهده در ۵۰ روز کاملاً معمولِ همین نماد است");
  assert.ok(w!.observedDays >= 10);
});
