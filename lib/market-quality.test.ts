import { test } from "node:test";
import assert from "node:assert/strict";
import { toMarket } from "./market-ir";
import { marketProvenance, sourceTime, withValidNav } from "./market-quality";
import { buildMarketHeadline } from "./core/marketHeadline";
import { marketCardContract } from "./core/marketCards";
import { formatRialAsToman, formatJalali } from "./format";
import { decodeMarketGrant, isMarketModule } from "./market-module-contract";
import { extractDailySeries } from "./core/trend";
import { publicationDay } from "./market-report-date";

const NOW = Date.parse("2026-09-30T10:00:00Z");
const row = { id: "نمونه", faName: "نمونهٔ نمایشی", price: 362, unit: "toman" as const, value: 5_600_000_000_000, marketValue: 7_004_700_000_000_000, nav: 360, navDate: "1405-07-08", navTime: "13:20:00", sourceDate: "1405-07-08", sourceTime: "13:25:00" };
const market = () => toMarket({ stocks: [row], fetchedAt: NOW, indices: { total: 3_000_000, totalChange: 0, equalWeight: null, date: "1405-07-08", time: "13:25:00", state: "بازار بسته است" } });

test("واحد ورودی ریال → متن تومان؛ جریانِ تومانی دوباره تبدیل نمی‌شود", () => {
  assert.equal(formatRialAsToman(row.value), "۵۶۰ میلیارد تومان");
  assert.equal(formatRialAsToman(row.marketValue), "۷۰۰٫۵ همت");
  assert.equal(formatRialAsToman(null), "—");
});
test("زمان دریافت ناموجود/صفر/رشته جای امروز نمی‌نشیند", () => {
  for (const value of [null, undefined, "1790762400000", 0, NaN, Number.MAX_VALUE]) {
    assert.equal(toMarket({ stocks: [row], fetchedAt: value }).fetchedAt, null);
  }
});
test("صفر واقعی تغییر حفظ می‌شود؛ شاخص/ارزش نامعلوم صفر نمی‌شود", () => {
  const m = market();
  assert.equal(m.indices?.totalChange, 0);
  assert.equal(m.indices?.equalWeight, null);
  assert.equal(m.indices?.value, null);
  assert.equal(toMarket({ stocks: [{ ...row, buyI: null, changePercent: 0 }] }).stocks[0].buyI, undefined);
  assert.equal(toMarket({ stocks: [{ ...row, changePercent: 0 }] }).stocks[0].changePercent, 0);
});
test("بسته بودن با شکست دریافت متفاوت است؛ برچسب منبع کهنه، جلسهٔ جاری نیست", () => {
  const p = marketProvenance(market(), NOW);
  assert.equal(p.quality, "ready"); assert.equal(p.session, "closed");
  const missing = marketProvenance(null, NOW);
  assert.equal(missing.quality, "unavailable"); assert.equal(missing.session, "unknown");
  const stale = marketProvenance(market(), NOW + 2 * 3600_000);
  assert.equal(stale.quality, "stale"); assert.equal(stale.session, "unknown");
});
test("دریافت تازه، منبع قدیمی را تازه نمی‌کند", () => {
  const m = market(); m.indices!.date = "1405-06-30";
  assert.equal(marketProvenance(m, NOW).quality, "stale");
  m.indices!.date = null;
  assert.equal(marketProvenance(m, NOW).quality, "unknown-time");
});
test("تاریخ/ساعت نامعتبر و آینده پذیرفته نمی‌شوند؛ تاریخ تهران از UTC جداست", () => {
  assert.equal(sourceTime("1405-07-31", "13:00:00"), null);
  assert.equal(sourceTime("1405-07-08", "25:00:00"), null);
  assert.equal(sourceTime("1405-07-08", null), null);
  assert.equal(formatJalali("2026-09-29T21:00:00Z", false), "۱۴۰۵/۰۷/۰۸");
});
test("NAV تازه با ساعت خود منبع و قیمت هم‌زمان حباب دارد", () => {
  const result = withValidNav(row, NOW, NOW);
  assert.equal(result.navState, "ready");
  assert.ok(result.bubblePercent! > 0);
  assert.equal(withValidNav({ ...row, navDate: "1405-06-30" }, NOW, NOW).bubblePercent, null);
  assert.equal(withValidNav({ ...row, nav: 3600 }, NOW, NOW).bubblePercent, null);
  assert.equal(withValidNav({ ...row, sourceTime: null }, NOW, NOW).navState, "unknown-time");
});
test("قرارداد هر کارت سؤال، واحد، منشأ و مقصد عمومی واقعی دارد", () => {
  const m = market();
  for (const metric of buildMarketHeadline({ indices: m.indices, stocks: m.stocks, gold: [], currency: [] }).metrics) {
    const c = marketCardContract(metric, marketProvenance(m, NOW));
    assert.ok(c.question && c.fields.length && c.calculation); assert.match(c.detailHref, /^\/market/);
    if (!metric.key.startsWith("index-")) assert.equal(c.validAt, null);
  }
});
test("روز نمونهٔ طلا/ارز، روز تهران است؛ نرخ دلار فرضی ساخته نمی‌شود", () => {
  const series = extractDailySeries([{ captured_at: "2026-09-29T21:00:00Z", section: "currency", payload: [{ id: "USD", price: 100_000, unit: "toman" }] }]);
  assert.equal(series[0].points[0].date, "2026-09-30");
  assert.deepEqual(extractDailySeries([{ captured_at: "2026-09-29T21:00:00Z", section: "currency", payload: [{ id: "USD", price: 100_000, unit: "usd" }] }]), []);
});
test("مجوز سمت سرور strict است؛ خطا/رشتهٔ true و ماژول ناشناخته حق نمی‌سازد", () => {
  assert.equal(decodeMarketGrant({ allowed: "true" }).allowed, false);
  assert.equal(decodeMarketGrant(null).allowed, false);
  assert.equal(decodeMarketGrant({ allowed: true, authorizedByCohortIds: ["A", "B"], reason: "active" }).authorizedByCohortIds.length, 2);
  assert.equal(isMarketModule("internal-desk"), false);
});
test("تاریخ انتشار کدال با پایان دوره جایگزین نمی‌شود؛ آینده و روز نامعتبر تهی است", () => {
  assert.equal(publicationDay(null, NOW), null);
  assert.equal(publicationDay("1410/12/29", NOW), null);
  assert.equal(publicationDay("1405/07/31", NOW), null);
  assert.equal(publicationDay("1405/07/08 09:00:00", NOW), "1405/07/08");
});
