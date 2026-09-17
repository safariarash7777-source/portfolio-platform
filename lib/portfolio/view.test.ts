import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildHoldingsView, toTargetVersion } from "./view";
import type { HoldingVersion } from "./contracts";
import type { SymbolHistoryRow } from "./prices";

const NOW = new Date("2026-09-17T00:00:00Z");

/** داراییِ واقعی: شناسهٔ پایدار عمداً با نماد فرق دارد. */
const holdings = (
  rows: { key: string; symbol: string | null; cls: string; qty: number; unit: string }[]
): HoldingVersion => ({
  id: "h1",
  version: 1,
  positions: rows.map((r) => ({
    positionKey: r.key,
    symbol: r.symbol,
    manualLabel: r.symbol ? null : "دستی",
    assetClass: r.cls,
    qty: r.qty,
    unit: r.unit,
    costBasis: null,
    asOf: "2026-09-15",
  })),
});

const priceRow = (symbol: string, close: number): SymbolHistoryRow => ({
  symbol, trade_date: "2026-09-16", close, last_price: close, source: "relay_eod",
});

/** هدف به همان شکلی که واقعاً در `portfolio_versions` ذخیره شده. */
const stored = (allocations: unknown) => ({
  id: "t1", version: 1, referenceVersionId: "ref-1", allocations,
});

const build = (o: Partial<Parameters<typeof buildHoldingsView>[0]>) =>
  buildHoldingsView({
    holdings: null, storedTarget: null, priceRows: [],
    maxPriceAgeDays: 3, maxPriceFutureDays: 1, now: NOW, ...o,
  });

describe("اتصال خواندن هدف و قیمت به محاسبه (#140)", () => {
  // ⚠️ همان ورودی واقعیِ گزارش بازبینی.
  test("هدف با دستهٔ ناشناخته هیچ مبلغی نمی‌سازد", () => {
    const v = build({
      holdings: holdings([{ key: "k1", symbol: "طلا", cls: "gold", qty: 10, unit: "عدد" }]),
      storedTarget: stored([{ asset: "طلا", pct: 100 }, { asset: "dsf", pct: 20 }]),
      priceRows: [priceRow("طلا", 1000)],
    });
    assert.equal(v.definitive, false, "نباید قطعی باشد");
    assert.equal(v.totalValue, null);
    assert.deepEqual(v.rows, [], "هیچ ردیف عددی تولید نشود");
    assert.match(v.notes.join(" "), /dsf/);
  });

  test("هدف سالم با قیمت معتبر، مبلغ قطعی می‌دهد", () => {
    const v = build({
      holdings: holdings([
        { key: "k1", symbol: "طلا", cls: "gold", qty: 10, unit: "عدد" },
        { key: "k2", symbol: "خودرو", cls: "equity_ir", qty: 100, unit: "سهم" },
      ]),
      storedTarget: stored([{ asset: "طلا", pct: 50 }, { asset: "سهام", pct: 50 }]),
      priceRows: [priceRow("طلا", 1000), priceRow("خودرو", 760)],
    });
    // قیمت ریال است: طلا 100 تومان × 10 عدد = 1000 ؛ خودرو 76 تومان × 100 سهم = 7600
    assert.equal(v.definitive, true);
    assert.equal(v.totalValue, 8600);
  });

  // ⚠️ شناسهٔ پایدار با نماد فرق دارد — قبلاً قیمت پیدا نمی‌شد.
  test("شناسهٔ قلم متفاوت از نماد، قیمت را از دست نمی‌دهد", () => {
    const v = build({
      holdings: holdings([{ key: "حساب-من", symbol: "خودرو", cls: "equity_ir", qty: 100, unit: "سهم" }]),
      storedTarget: stored([{ asset: "سهام", pct: 100 }]),
      priceRows: [priceRow("خودرو", 760)],
    });
    assert.equal(v.definitive, true, "قیمت باید به شناسهٔ قلم برسد");
    assert.equal(v.totalValue, 7600);
  });

  test("دو قلم با نماد یکسان و شناسه‌های متفاوت، هر دو قیمت می‌گیرند", () => {
    const v = build({
      holdings: holdings([
        { key: "کارگزاری-الف", symbol: "خودرو", cls: "equity_ir", qty: 100, unit: "سهم" },
        { key: "کارگزاری-ب", symbol: "خودرو", cls: "equity_ir", qty: 50, unit: "سهم" },
      ]),
      storedTarget: stored([{ asset: "سهام", pct: 100 }]),
      priceRows: [priceRow("خودرو", 760)],
    });
    assert.equal(v.definitive, true);
    assert.equal(v.totalValue, 76 * 150);
  });

  test("تغییر نماد یک قلم، همان شناسه را نگه می‌دارد و قیمت تازه می‌گیرد", () => {
    const before = build({
      holdings: holdings([{ key: "k1", symbol: "خودرو", cls: "equity_ir", qty: 100, unit: "سهم" }]),
      storedTarget: stored([{ asset: "سهام", pct: 100 }]),
      priceRows: [priceRow("خودرو", 760)],
    });
    const after = build({
      holdings: holdings([{ key: "k1", symbol: "خساپا", cls: "equity_ir", qty: 100, unit: "سهم" }]),
      storedTarget: stored([{ asset: "سهام", pct: 100 }]),
      priceRows: [priceRow("خساپا", 500)],
    });
    assert.equal(before.totalValue, 7600);
    assert.equal(after.totalValue, 5000);
  });

  // ⚠️ «۱ سهم» و «۱ هزار سهم» ارزش یکسان می‌گرفتند.
  test("واحد مقدار در مسیر واقعی هم اثر می‌گذارد", () => {
    const one = build({
      holdings: holdings([{ key: "k1", symbol: "خودرو", cls: "equity_ir", qty: 1, unit: "سهم" }]),
      storedTarget: stored([{ asset: "سهام", pct: 100 }]),
      priceRows: [priceRow("خودرو", 760)],
    });
    const thousand = build({
      holdings: holdings([{ key: "k1", symbol: "خودرو", cls: "equity_ir", qty: 1, unit: "هزار سهم" }]),
      storedTarget: stored([{ asset: "سهام", pct: 100 }]),
      priceRows: [priceRow("خودرو", 760)],
    });
    assert.equal(one.totalValue, 76);
    assert.equal(thousand.totalValue, 76_000);
  });

  test("واحد ناسازگار پوشش ناقص می‌دهد", () => {
    const v = build({
      holdings: holdings([{ key: "k1", symbol: "خودرو", cls: "equity_ir", qty: 5, unit: "گرم" }]),
      storedTarget: stored([{ asset: "سهام", pct: 100 }]),
      priceRows: [priceRow("خودرو", 760)],
    });
    assert.equal(v.definitive, false);
    assert.equal(v.gaps[0].reason, "unit_mismatch");
  });

  test("ردیف قیمت بدون منبع، قطعی نمی‌سازد", () => {
    const v = build({
      holdings: holdings([{ key: "k1", symbol: "خودرو", cls: "equity_ir", qty: 100, unit: "سهم" }]),
      storedTarget: stored([{ asset: "سهام", pct: 100 }]),
      priceRows: [{ ...priceRow("خودرو", 760), source: null }],
    });
    assert.equal(v.definitive, false);
    assert.equal(v.gaps[0].reason, "no_price");
  });

  test("قلم دستی پوشش ناقص می‌دهد، نه عدد ساختگی", () => {
    const v = build({
      holdings: holdings([{ key: "نفت", symbol: null, cls: "commodity", qty: 1, unit: "عدد" }]),
      storedTarget: stored([{ asset: "طلا", pct: 100 }]),
      priceRows: [],
    });
    assert.equal(v.definitive, false);
  });

  test("نبود دارایی یا هدف، پیام روشن می‌دهد نه خطا", () => {
    assert.match(build({}).notes.join(" "), /ثبت نکرده/);
    assert.match(
      build({ holdings: holdings([{ key: "k", symbol: "x", cls: "gold", qty: 1, unit: "عدد" }]) })
        .notes.join(" "),
      /سبد هدفی/
    );
  });

  test("toTargetVersion مشکل‌ها را حمل می‌کند", () => {
    assert.deepEqual(toTargetVersion(stored([{ asset: "طلا", pct: 100 }])).problems, []);
    assert.equal(toTargetVersion(stored([{ asset: "dsf", pct: 100 }])).problems.length, 1);
  });
});
