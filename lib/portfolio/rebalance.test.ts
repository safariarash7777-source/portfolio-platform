import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  compareHoldingsToTarget,
  assertTargetSumsTo100,
  exceedsThreshold,
  InvalidTargetError,
} from "./rebalance";
import type { HoldingVersion, PricePoint, TargetVersion } from "./contracts";

const NOW = new Date("2026-09-16T00:00:00Z");
const opts = { maxPriceAgeDays: 3, maxPriceFutureDays: 1, now: NOW };

const target = (
  weights: [string, number][],
  refId: string | null = "ref-1",
  problems: string[] = []
): TargetVersion => ({
  id: "tgt-1",
  version: 1,
  referenceVersionId: refId,
  weights: weights.map(([assetClass, weightPct]) => ({ assetClass, weightPct })),
  problems,
});

const holdings = (rows: [string, string, number][], unit = "عدد"): HoldingVersion => ({
  id: "hold-1",
  version: 1,
  positions: rows.map(([positionKey, assetClass, qty]) => ({
    positionKey,
    symbol: positionKey,
    manualLabel: null,
    assetClass,
    qty,
    unit,
    costBasis: null,
    asOf: "2026-09-15",
  })),
});

const price = (toman: number, asOf = "2026-09-15", unit = "عدد"): PricePoint =>
  ({ toman, source: "رله", asOf, unit });

describe("مقایسهٔ دارایی با سبد هدف (#140)", () => {
  test("۷۰/۱۰/۳۰ برابر ۱۱۰ درصد است و رد می‌شود، نه نرمال", () => {
    assert.throws(
      () => assertTargetSumsTo100(target([["gold", 70], ["fixed_income", 10], ["equity_ir", 30]])),
      (e: unknown) => e instanceof InvalidTargetError && /۱۰۰ درصد|100/.test((e as Error).message)
    );
  });

  test("۷۰/۱۵/۱۵ پذیرفته می‌شود — ممیزِ شناور نباید ردش کند", () => {
    assert.doesNotThrow(() =>
      assertTargetSumsTo100(target([["gold", 70], ["fixed_income", 15], ["equity_ir", 15]]))
    );
  });

  test("دستهٔ تکراری در هدف رد می‌شود", () => {
    assert.throws(
      () => assertTargetSumsTo100(target([["gold", 50], ["gold", 50]])),
      InvalidTargetError
    );
  });

  test("پوشش کامل: وزن جاری، اختلاف واحد درصد و مقدار تومانی", () => {
    const r = compareHoldingsToTarget(
      holdings([["ط", "gold", 10], ["س", "equity_ir", 10]]),
      target([["gold", 70], ["equity_ir", 30]]),
      new Map([["ط", price(100)], ["س", price(100)]]),
      opts
    );
    assert.equal(r.definitive, true);
    assert.equal(r.totalValue, 2000);
    const gold = r.rows.find((x) => x.assetClass === "gold")!;
    assert.equal(gold.currentWeightPct, 50);
    assert.equal(gold.deltaPercentagePoints, 20); // 70 − 50
    assert.equal(gold.valueDelta, 400); // 70% از ۲۰۰۰ منهای ۱۰۰۰
  });

  test("قیمت کهنه ⇒ هیچ مقدار قطعی بازتوازن تولید نمی‌شود", () => {
    const r = compareHoldingsToTarget(
      holdings([["ط", "gold", 10], ["س", "equity_ir", 10]]),
      target([["gold", 70], ["equity_ir", 30]]),
      new Map([["ط", price(100)], ["س", price(100, "2026-09-01")]]),
      opts
    );
    assert.equal(r.definitive, false);
    assert.equal(r.fullCoverage, false);
    assert.equal(r.totalValue, null);
    assert.equal(r.gaps[0].reason, "stale_price");
    for (const row of r.rows) {
      assert.equal(row.valueDelta, null, `${row.assetClass} نباید عدد قطعی بدهد`);
      assert.equal(row.currentWeightPct, null);
    }
  });

  test("قیمت بدون منبع، قیمت نیست", () => {
    const r = compareHoldingsToTarget(
      holdings([["ط", "gold", 10]]),
      target([["gold", 100]]),
      new Map([["ط", { toman: 100, source: "   ", asOf: "2026-09-15", unit: "عدد" }]]),
      opts
    );
    assert.equal(r.definitive, false);
    assert.equal(r.gaps[0].reason, "no_price");
  });

  test("قیمت گم‌شده با صفر یا آخرین مقدار پر نمی‌شود", () => {
    const r = compareHoldingsToTarget(
      holdings([["ط", "gold", 10], ["س", "equity_ir", 10]]),
      target([["gold", 70], ["equity_ir", 30]]),
      new Map([["ط", price(100)]]),
      opts
    );
    assert.equal(r.definitive, false);
    assert.deepEqual(r.gaps.map((g) => g.positionKey), ["س"]);
  });

  test("رشد قیمت طلا وزنش را عوض می‌کند، بدون هیچ معاملهٔ تازه", () => {
    const h = holdings([["ط", "gold", 10], ["س", "equity_ir", 10]]);
    const t = target([["gold", 70], ["equity_ir", 30]]);
    const before = compareHoldingsToTarget(h, t, new Map([["ط", price(100)], ["س", price(100)]]), opts);
    const after = compareHoldingsToTarget(h, t, new Map([["ط", price(300)], ["س", price(100)]]), opts);
    const w = (r: typeof before) => r.rows.find((x) => x.assetClass === "gold")!.currentWeightPct;
    assert.equal(w(before), 50);
    assert.equal(w(after), 75);
    assert.equal(h.version, 1, "نسخهٔ دارایی نباید عوض شده باشد");
  });

  test("دو عضو با موجودی متفاوت، یک هدف: تفاوت‌هایشان یکی نیست", () => {
    const t = target([["gold", 70], ["equity_ir", 30]]);
    const p = new Map([["ط", price(100)], ["س", price(100)]]);
    const a = compareHoldingsToTarget(holdings([["ط", "gold", 10], ["س", "equity_ir", 10]]), t, p, opts);
    const b = compareHoldingsToTarget(holdings([["ط", "gold", 1], ["س", "equity_ir", 19]]), t, p, opts);
    const d = (r: typeof a) => r.rows.find((x) => x.assetClass === "gold")!.valueDelta;
    assert.equal(a.totalValue, b.totalValue, "ارزش کل اتفاقاً برابر است");
    assert.notEqual(d(a), d(b), "ولی مقدار تغییر لازم نباید یکی باشد");
  });

  test("هویت محاسبه نسخهٔ دارایی و نسخهٔ هدف را حمل می‌کند", () => {
    const r = compareHoldingsToTarget(
      holdings([["ط", "gold", 10]]),
      target([["gold", 100]]),
      new Map([["ط", price(100)]]),
      opts
    );
    assert.equal(r.identity.holdingVersionId, "hold-1");
    assert.equal(r.identity.targetVersionId, "tgt-1");
    assert.equal(r.identity.pricedAt, NOW.toISOString());
  });

  test("هدفِ بدون اتصال به نسخهٔ مرجع صریح اعلام می‌شود", () => {
    const r = compareHoldingsToTarget(
      holdings([["ط", "gold", 10]]),
      target([["gold", 100]], null),
      new Map([["ط", price(100)]]),
      opts
    );
    assert.ok(r.notes.some((n) => /نسخهٔ مرجع/.test(n)));
  });

  test("آستانه روی نتیجهٔ غیرقطعی هرگز فعال نمی‌شود", () => {
    const stale = compareHoldingsToTarget(
      holdings([["ط", "gold", 10]]),
      target([["gold", 100]]),
      new Map([["ط", price(100, "2026-01-01")]]),
      opts
    );
    assert.equal(exceedsThreshold(stale, 1), false, "قیمت کهنه نباید اعلان بسازد");
  });

  // ── آزمون‌های مرزیِ قیمت (یافتهٔ بازبینیِ مستقل) ──────────────────────────
  // نسخهٔ اول فقط `Number.isFinite` را می‌سنجید، پس قیمتِ منفی و تاریخِ آینده
  // هر دو «معتبر» بودند و عددِ قطعیِ بی‌معنا می‌ساختند.
  const rejected = (p: PricePoint) =>
    compareHoldingsToTarget(
      holdings([["ط", "gold", 10]]),
      target([["gold", 100]]),
      new Map([["ط", p]]),
      opts
    );

  test("قیمت منفی رد می‌شود و عدد قطعی نمی‌سازد", () => {
    const r = rejected({ toman: -100, source: "رله", asOf: "2026-09-15", unit: "عدد" });
    assert.equal(r.definitive, false);
    assert.equal(r.rows[0].valueDelta, null);
  });

  test("قیمت صفر رد می‌شود — قرارداد روشن", () => {
    const r = rejected({ toman: 0, source: "رله", asOf: "2026-09-15", unit: "عدد" });
    assert.equal(r.definitive, false);
    assert.equal(r.totalValue, null);
  });

  test("تاریخ آینده خارج از تلورانس رد می‌شود", () => {
    const r = rejected({ toman: 100, source: "رله", asOf: "2100-01-01", unit: "عدد" });
    assert.equal(r.definitive, false, "سنِ منفی نباید «تازه» به حساب بیاید");
    assert.equal(r.gaps[0].reason, "no_price");
  });

  test("اختلاف ساعتِ کوچک تحمل می‌شود", () => {
    const soon = new Date(NOW.getTime() + 6 * 3600_000).toISOString();
    const r = rejected({ toman: 100, source: "رله", asOf: soon, unit: "عدد" });
    assert.equal(r.definitive, true, "شش ساعت جلوتر نباید کلِ محاسبه را بیندازد");
  });

  test("قیمت NaN و مقدار نامعتبر رد می‌شوند", () => {
    assert.equal(rejected({ toman: NaN, source: "رله", asOf: "2026-09-15", unit: "عدد" }).definitive, false);
    assert.equal(rejected({ toman: Infinity, source: "رله", asOf: "2026-09-15", unit: "عدد" }).definitive, false);
    const bad = compareHoldingsToTarget(
      { id: "h", version: 1, positions: [{ positionKey: "ط", symbol: "ط", manualLabel: null,
        assetClass: "gold", qty: Number.NaN, unit: "عدد", costBasis: null, asOf: "2026-09-15" }] },
      target([["gold", 100]]),
      new Map([["ط", price(100)]]),
      opts
    );
    assert.equal(bad.definitive, false, "مقدارِ NaN نباید عددِ قطعی بسازد");
  });

  test("تاریخ بی‌معنا رد می‌شود", () => {
    const r = rejected({ toman: 100, source: "رله", asOf: "نه‌یک‌تاریخ", unit: "عدد" });
    assert.equal(r.definitive, false);
  });

  // ── سرریزِ جمع (یافتهٔ بازبینیِ ۱۴۰۵/۰۶/۲۶) ────────────────────────────────
  test("دو قلمِ finite که جمعشان Infinity می‌شود، نتیجهٔ قطعی نمی‌سازند", () => {
    const r = compareHoldingsToTarget(
      holdings([["الف", "gold", 1e308], ["ب", "equity_ir", 1e308]]),
      target([["gold", 70], ["equity_ir", 30]]),
      new Map([["الف", price(1)], ["ب", price(1)]]),
      opts
    );
    assert.equal(r.fullCoverage, true, "هر دو قلم قیمتِ معتبر دارند");
    assert.equal(r.definitive, false, "ولی جمعشان از بردِ عددی بیرون است");
    assert.equal(r.totalValue, null);
    for (const row of r.rows) {
      assert.equal(row.valueDelta, null, `${row.assetClass} نباید NaN بدهد`);
      assert.notEqual(row.deltaPercentagePoints, undefined);
      assert.ok(
        row.deltaPercentagePoints === null || Number.isFinite(row.deltaPercentagePoints),
        "هیچ خروجی‌ای نباید NaN باشد"
      );
    }
    assert.ok(r.notes.some((n) => /محدودهٔ عددی/.test(n)), "دلیل باید صریح گفته شود");
  });

  test("هیچ خروجی قطعی‌ای NaN یا Infinity نیست", () => {
    const r = compareHoldingsToTarget(
      holdings([["ط", "gold", 10], ["س", "equity_ir", 10]]),
      target([["gold", 70], ["equity_ir", 30]]),
      new Map([["ط", price(100)], ["س", price(100)]]),
      opts
    );
    assert.equal(r.definitive, true);
    for (const row of r.rows) {
      for (const v of [row.value, row.currentWeightPct, row.deltaPercentagePoints, row.valueDelta]) {
        assert.ok(v === null || Number.isFinite(v), `مقدار نامعتبر: ${v}`);
      }
    }
  });

  // ── یافته‌های بازبینی ۱۴۰۵/۰۶/۲۶ ─────────────────────────────────────────

  // ورودیِ واقعیِ گزارش: [{طلا,۱۰۰},{dsf,۲۰}]. «dsf» کنار گذاشته می‌شد و
  // بقیه اتفاقاً ۱۰۰ جمع می‌زدند، پس محاسبه «قطعی» می‌شد و مبلغ بازتوازن
  // می‌ساخت — با وجود اینکه یک‌پنجم سبد اصلاً شناخته نشده بود.
  test("هدفِ دارای دستهٔ ناشناخته محاسبهٔ قطعی نمی‌دهد", () => {
    const broken = target([["gold", 100]], "ref-1", ["دستهٔ «dsf» شناخته نشد."]);
    assert.throws(() => assertTargetSumsTo100(broken), InvalidTargetError);
    assert.throws(
      () =>
        compareHoldingsToTarget(
          holdings([["ط", "gold", 10]]),
          broken,
          new Map([["ط", price(100)]]),
          opts
        ),
      (e: unknown) => e instanceof InvalidTargetError && /dsf/.test((e as Error).message)
    );
  });

  test("هدفِ دارای قلمِ نامعتبر هم مسدود می‌شود", () => {
    const broken = target([["gold", 100]], "ref-1", ["قلم‌های نامعتبر: «سهام»"]);
    assert.throws(() => assertTargetSumsTo100(broken), InvalidTargetError);
  });

  test("هدفِ سالم همچنان محاسبه می‌شود", () => {
    const r = compareHoldingsToTarget(
      holdings([["ط", "gold", 10]]),
      target([["gold", 100]]),
      new Map([["ط", price(100)]]),
      opts
    );
    assert.equal(r.definitive, true);
  });

  // «۱ سهم» و «۱ هزار سهم» ارزشِ یکسان می‌گرفتند.
  test("واحدِ مقدار در ارزش اثر می‌گذارد", () => {
    const one = compareHoldingsToTarget(
      holdings([["س", "equity_ir", 1]], "سهم"),
      target([["equity_ir", 100]]),
      new Map([["س", price(1000, "2026-09-15", "سهم")]]),
      opts
    );
    const thousand = compareHoldingsToTarget(
      holdings([["س", "equity_ir", 1]], "هزار سهم"),
      target([["equity_ir", 100]]),
      new Map([["س", price(1000, "2026-09-15", "سهم")]]),
      opts
    );
    assert.equal(one.totalValue, 1000);
    assert.equal(thousand.totalValue, 1_000_000, "هزار سهم باید هزار برابر باشد");
    assert.notEqual(one.totalValue, thousand.totalValue);
  });

  test("واحدِ ناشناخته پوششِ ناقص می‌دهد، نه عددِ حدسی", () => {
    const r = compareHoldingsToTarget(
      holdings([["س", "equity_ir", 5]], "واحدِ عجیب"),
      target([["equity_ir", 100]]),
      new Map([["س", price(1000, "2026-09-15", "سهم")]]),
      opts
    );
    assert.equal(r.definitive, false);
    assert.equal(r.gaps[0].reason, "unit_mismatch");
    assert.equal(r.totalValue, null);
  });

  test("طلای فیزیکی (گرم) با قیمتِ هر سهم ضرب نمی‌شود", () => {
    const r = compareHoldingsToTarget(
      holdings([["ط", "gold", 5]], "گرم"),
      target([["gold", 100]]),
      new Map([["ط", price(1000, "2026-09-15", "سهم")]]),
      opts
    );
    assert.equal(r.definitive, false);
    assert.equal(r.gaps[0].reason, "unit_mismatch");
    assert.match(r.gaps[0].detail, /هم‌خانواده/);
  });

  test("منبعِ «نامشخص» قیمت را معتبر نمی‌کند", () => {
    const r = compareHoldingsToTarget(
      holdings([["ط", "gold", 10]]),
      target([["gold", 100]]),
      new Map([["ط", { toman: 100, source: "نامشخص", asOf: "2026-09-15", unit: "عدد" }]]),
      opts
    );
    assert.equal(r.definitive, false);
    assert.equal(r.gaps[0].reason, "no_price");
  });

  test("قیمت بدون واحد رد می‌شود", () => {
    const r = compareHoldingsToTarget(
      holdings([["ط", "gold", 10]]),
      target([["gold", 100]]),
      new Map([["ط", { toman: 100, source: "رله", asOf: "2026-09-15", unit: "  " }]]),
      opts
    );
    assert.equal(r.definitive, false);
  });

  test("آستانه فقط با عبور واقعی فعال می‌شود", () => {
    const r = compareHoldingsToTarget(
      holdings([["ط", "gold", 10], ["س", "equity_ir", 10]]),
      target([["gold", 70], ["equity_ir", 30]]),
      new Map([["ط", price(100)], ["س", price(100)]]),
      opts
    );
    assert.equal(exceedsThreshold(r, 20), true);
    assert.equal(exceedsThreshold(r, 21), false);
  });
});
