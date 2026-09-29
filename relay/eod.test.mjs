import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { tehranNow, isAfterClose, sessionTradeDate, planEodHistory } from "./eod.mjs";
import { msUntilTehranMidnight } from "./symbol-detail.mjs";

/**
 * B-055 — پایانیِ هر جلسه زیرِ برچسبِ جلسهٔ بعد ذخیره می‌شد.
 *
 * زمان‌ها و تاریخ‌ها از Production برداشته شده‌اند (۱۴۰۵/۰۶/۳۱)، نه ساخته‌شده:
 * ردیف‌های با برچسبِ `2026-09-19` ساعتِ **۰۰:۰۶ شنبهٔ تهران** نوشته شدند، یعنی پیش
 * از بازشدنِ بازار؛ پس محتوایشان پایانیِ **چهارشنبه ۱۴۰۵/۰۶/۲۵** بود.
 *
 * تهران UTC+03:30 است و از ۱۴۰۱ ساعتِ تابستانی ندارد.
 */
const SAT_0006_TEHRAN = new Date("2026-09-18T20:36:00Z"); // همان لحظهٔ نوشتنِ Production
const WED_1430_TEHRAN = new Date("2026-09-16T11:00:00Z");
const THU_1430_TEHRAN = new Date("2026-09-17T11:00:00Z");
const SUN_1430_TEHRAN = new Date("2026-09-20T11:00:00Z");

const payload = (date, stocks, funds = []) => ({ indices: { date }, stocks, funds });
const stock = (id, extra = {}) => ({ id, value: 1_000_000, closingPrice: 5_000, price: 5_100, volume: 200, ...extra });

// ── ساعت ───────────────────────────────────────────────────────────────────

test("ساعتِ تهران هرگز «24» نیست — ۴۸ ساعت با گامِ ۱۰ دقیقه", () => {
  const start = Date.parse("2026-09-18T18:00:00Z");
  for (let m = 0; m < 48 * 60; m += 10) {
    const { hour } = tehranNow(new Date(start + m * 60_000));
    assert.ok(Number.isInteger(hour) && hour >= 0 && hour <= 23, `ساعتِ ${hour} در دقیقهٔ ${m}`);
  }
});

test("لحظهٔ نوشتنِ Production: ۰۰:۰۶ شنبه ساعتِ ۰ است، نه ۲۴", () => {
  assert.deepEqual(tehranNow(SAT_0006_TEHRAN), { date: "2026-09-19", hour: 0, weekday: "Sat" });
});

test("دروازهٔ «پس از بسته‌شدن» با NaN بسته می‌ماند", () => {
  // شکلِ قدیمی `if (hour < 14) return` با NaN باز بود، چون `NaN < 14` نادرست است.
  assert.equal(isAfterClose(NaN, 14), false);
  assert.equal(isAfterClose(13, 14), false);
  assert.equal(isAfterClose(14, 14), true);
  assert.equal(isAfterClose(0, 14), false);
});

test("پخشِ بودجه: ۰۰:۰۵ تهران تقریباً ۲۴ ساعت تا نیمه‌شب مانده، نه عددِ منفی", () => {
  const ms = msUntilTehranMidnight(new Date("2026-09-18T20:35:00Z")); // ۰۰:۰۵ تهران
  assert.equal(ms, (23 * 3600 + 55 * 60) * 1000);
});

// ── تاریخِ جلسه ───────────────────────────────────────────────────────────

test("تاریخِ جلسهٔ منبع: جلالی با رقمِ لاتین یا فارسی → میلادی", () => {
  assert.equal(sessionTradeDate("1405/06/25"), "2026-09-16"); // چهارشنبه
  assert.equal(sessionTradeDate("۱۴۰۵/۰۶/۲۵"), "2026-09-16");
  assert.equal(sessionTradeDate("1405-06-28"), "2026-09-19"); // شنبه
  assert.equal(sessionTradeDate("1405/06/31"), "2026-09-22");
});

test("تاریخِ منبعِ ناموجود یا نامعتبر → null، هرگز حدس", () => {
  for (const bad of [null, undefined, "", "   ", "abc", "1405/13/01", "1405/07/31", "1405/00/10"]) {
    assert.equal(sessionTradeDate(bad), null, JSON.stringify(bad));
  }
});

// ── مسیرِ واقعیِ نوشتن ────────────────────────────────────────────────────

test("بازتولیدِ Production: ۰۰:۰۶ شنبه با دادهٔ چهارشنبه هیچ ردیفی نمی‌سازد", () => {
  // کدِ قبلی اینجا ۱٬۰۷۹ ردیف با برچسبِ 2026-09-19 می‌نوشت.
  const plan = planEodHistory(payload("1405/06/25", [stock("فولاد")]), SAT_0006_TEHRAN, 14);
  assert.deepEqual(plan, { skip: "before-close" });
});

test("چهارشنبه ۱۴:۳۰: برچسب همان چهارشنبه است", () => {
  const plan = planEodHistory(payload("1405/06/25", [stock("فولاد"), stock("شپنا")]), WED_1430_TEHRAN, 14);
  assert.equal(plan.tradeDate, "2026-09-16");
  assert.deepEqual(plan.rows.map((r) => r.trade_date), ["2026-09-16", "2026-09-16"]);
});

test("برچسب از منبع می‌آید نه از تقویم: یکشنبه‌ای که منبع هنوز شنبه را می‌گوید", () => {
  // روزِ تعطیلِ رسمی وسطِ هفته، یا اجرای دیرهنگام: ساعتِ دیواری یکشنبه است ولی آخرین
  // جلسه شنبه بوده. برچسبِ درست شنبه است — و چون شنبه قبلاً نوشته شده، `server.mjs`
  // با دفعِ تکرار روی همان تاریخ چیزی نمی‌نویسد.
  const plan = planEodHistory(payload("1405/06/28", [stock("فولاد")]), SUN_1430_TEHRAN, 14);
  assert.equal(plan.tradeDate, "2026-09-19");
  assert.notEqual(plan.tradeDate, tehranNow(SUN_1430_TEHRAN).date);
});

test("بدونِ تاریخِ منبع هیچ ردیفی ساخته نمی‌شود (D2)", () => {
  const p = { stocks: [stock("فولاد")], funds: [] };
  assert.deepEqual(planEodHistory(p, WED_1430_TEHRAN, 14), { skip: "no-source-session-date" });
  assert.deepEqual(planEodHistory({ ...p, indices: {} }, WED_1430_TEHRAN, 14), { skip: "no-source-session-date" });
});

test("پنجشنبه و جمعه چیزی نوشته نمی‌شود", () => {
  assert.deepEqual(planEodHistory(payload("1405/06/25", [stock("فولاد")]), THU_1430_TEHRAN, 14), { skip: "weekend" });
});

test("نگاشتِ ردیف دست نخورده: زیرنماد، حق‌تقدم و بی‌معامله بیرون؛ تومان→ریال؛ NAV در raw", () => {
  const plan = planEodHistory(
    payload(
      "1405/06/25",
      [stock("فولاد"), stock("فملی2"), stock("خودروح"), stock("شپنا", { value: 0 })],
      [{ id: "طلا", value: 9, closingPrice: 12_000, price: 12_100, nav: 11_900, bubblePercent: 0.8 }],
    ),
    WED_1430_TEHRAN,
    14,
  );
  assert.deepEqual(plan.rows.map((r) => r.symbol), ["فولاد", "طلا"]);
  const [f, g] = plan.rows;
  assert.equal(f.close, 50_000);
  assert.equal(f.last_price, 51_000);
  assert.equal(f.source, "relay_eod");
  assert.equal(g.raw.nav_toman, 11_900);
  assert.equal(g.raw.bubble_percent, 0.8);
  assert.equal(f.raw.nav_toman, undefined);
});

// ── سیم‌کشی ──────────────────────────────────────────────────────────────
// رله روی لیارا اجرا می‌شود نه اینجا، پس اتصالِ `server.mjs` ساختاری سنجیده می‌شود.

const SERVER = readFileSync(new URL("./server.mjs", import.meta.url), "utf8");
const pushDailyHistory = SERVER.slice(
  SERVER.indexOf("async function pushDailyHistory("),
  SERVER.indexOf("\n}\n", SERVER.indexOf("async function pushDailyHistory(")),
);

test("server.mjs: نوشتنِ پایانِ روز از planEodHistory و writeEodHistory می‌گذرد", () => {
  assert.ok(pushDailyHistory.length > 200, "بدنهٔ pushDailyHistory پیدا نشد");
  assert.match(pushDailyHistory, /planEodHistory\(/);
  // دفعِ تکرار روی جلسهٔ منبع حالا داخلِ writeEodHistory است (eod-write.test.mjs).
  assert.match(pushDailyHistory, /writeEodHistory\(\{ plan,/);
  assert.doesNotMatch(pushDailyHistory, /t\.date/);
  assert.doesNotMatch(SERVER, /trade_date:\s*t\.date/);
});

test("هیچ خوانشِ ساعتی در رله `hour12: false` ندارد", () => {
  const dir = new URL("./", import.meta.url);
  const offenders = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".mjs") && !n.endsWith(".test.mjs"))) {
    const code = readFileSync(new URL(f, dir), "utf8")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .join("\n");
    if (/hour12\s*:\s*false/.test(code)) offenders.push(f);
  }
  assert.deepEqual(offenders, []);
});
