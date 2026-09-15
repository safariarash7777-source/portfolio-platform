import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatPercentPoints,
  formatCount,
  formatTehranClock,
  formatOrDash,
  sumCovered,
  formatPercent,
  formatToman,
  formatTomanShort,
} from "./format";

/* ── واحدِ درصد در برابرِ درصد ────────────────────────────────────────────── */

test("واحدِ درصد و درصد دو متنِ متفاوت تولید می‌کنند", () => {
  assert.notEqual(formatPercentPoints(2), formatPercent(2));
  assert.ok(formatPercentPoints(2).includes("واحدِ درصد"));
  assert.ok(formatPercent(2).includes("٪"));
});

test("علامتِ منفیِ واحدِ درصد پیش از عدد می‌آید (RTL سالم)", () => {
  assert.equal(formatPercentPoints(-2.5), "−۲٫۵ واحدِ درصد");
});

/* ── صفرِ واقعی در برابرِ ناموجود ─────────────────────────────────────────── */

test("formatOrDash: صفرِ واقعی صفر می‌ماند، ناموجود خط‌تیره می‌شود", () => {
  assert.equal(formatOrDash(0, formatCount), "۰");
  assert.equal(formatOrDash(null, formatCount), "—");
  assert.equal(formatOrDash(undefined, formatCount), "—");
  assert.equal(formatOrDash(NaN, formatCount), "—");
  assert.equal(formatOrDash(Infinity, formatCount), "—");
});

/* ── جمع با پوشش — باگِ «۰ برای ۳۲۹ صندوق» ──────────────────────────────── */

test("sumCovered وقتی هیچ ردیفی داده ندارد null می‌دهد، نه صفر", () => {
  const rows = [{ a: null }, { a: undefined }, { a: null }];
  const r = sumCovered(rows, (x) => x.a as number | null);
  assert.equal(r.total, null, "نبودِ داده نباید به صفر ترجمه شود");
  assert.equal(r.covered, 0);
  assert.equal(r.population, 3);
});

test("sumCovered فقط ردیف‌های دارای داده را جمع می‌زند و پوشش را گزارش می‌کند", () => {
  const rows = [{ a: 10 }, { a: null }, { a: 5 }];
  const r = sumCovered(rows, (x) => x.a as number | null);
  assert.equal(r.total, 15);
  assert.equal(r.covered, 2);
  assert.equal(r.population, 3);
});

test("sumCovered صفرِ واقعی را پوشش می‌شمارد (نه ناموجود)", () => {
  const r = sumCovered([{ a: 0 }, { a: null }], (x) => x.a as number | null);
  assert.equal(r.total, 0, "جمعِ یک صفرِ واقعی، صفر است");
  assert.equal(r.covered, 1);
});

test("sumCovered روی فهرستِ خالی null می‌دهد", () => {
  const r = sumCovered([] as { a: number }[], (x) => x.a);
  assert.equal(r.total, null);
  assert.equal(r.population, 0);
});

/* ── ساعت و شمارش ───────────────────────────────────────────────────────── */

test("ساعتِ تهران مستقل از منطقهٔ زمانیِ اجرا است", () => {
  // 2026-09-15T06:00:00Z → تهران +03:30 → ۰۹:۳۰
  assert.equal(formatTehranClock("2026-09-15T06:00:00Z"), "۰۹:۳۰");
});

test("ساعتِ تهران ۲۴ساعته است و نیمه‌شب را ۰۰ می‌نویسد", () => {
  assert.equal(formatTehranClock("2026-09-14T20:30:00Z"), "۰۰:۰۰");
});

test("formatCount هزارگان فارسی می‌گذارد", () => {
  assert.equal(formatCount(1234), "۱٬۲۳۴");
  assert.equal(formatCount(0), "۰");
});

test("formatToman واحد را در متن می‌گذارد — ریال و تومان قابلِ اشتباه نیستند", () => {
  assert.ok(formatToman(1000).endsWith("تومان"));
});

/* ── پله‌های واحدِ پول ────────────────────────────────────────────────────── */

test("جمع‌های سطحِ بازار به «همت» می‌روند، نه «میلیارد»ِ چندرقمی", () => {
  // ۳۳۲٫۹ همت — نه «۳۳۲٬۹۲۸٬۱۴۶ میلیارد تومان»
  assert.equal(formatTomanShort(332_928_146_200_000), "۳۳۲٫۹ همت تومان");
  assert.equal(formatTomanShort(1_000_000_000_000), "۱ همت تومان");
});

test("پله‌های زیرِ همت دست‌نخورده‌اند", () => {
  assert.equal(formatTomanShort(3_500_000_000), "۳٫۵ میلیارد تومان");
  assert.equal(formatTomanShort(2_000_000), "۲ میلیون تومان");
  assert.equal(formatTomanShort(5_000), "۵ هزار تومان");
});

test("منفی با «−» فارسی می‌آید، نه خطِ تیرهٔ اسکی — همان علامتِ formatPercent", () => {
  const out = formatTomanShort(-2_500_000_000_000);
  assert.equal(out, "−۲٫۵ همت تومان");
  assert.ok(!out.includes("-"), "خطِ تیرهٔ اسکی نباید در خروجی باشد");
  // همان علامتی که درصدها استفاده می‌کنند.
  assert.ok(formatPercent(-2).startsWith("−"));
});
