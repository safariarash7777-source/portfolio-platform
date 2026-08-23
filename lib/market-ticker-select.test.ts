import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  selectTickerAssets,
  hasRealChange,
  HOMEPAGE_TICKER_IDS,
  MAX_TICKER_ITEMS,
  type TickerPayload,
} from "./market-ticker-select";

/** پاسخی که همهٔ شناسه‌های فهرست را دارد — پایهٔ بیشترِ تست‌ها. */
function fullPayload(): TickerPayload {
  const ir = (id: string, price = 1000) => ({ id, faName: `نامِ ${id}`, price, unit: "toman", changePercent: 1.5 });
  return {
    ir: {
      currency: [
        ir("USD", 90000),
        ir("EUR", 98000),
        ir("AED", 24000),
        ir("TRY", 2700),
        ir("JPY", 600),
        ir("CNY", 12500),
      ],
      gold: [
        ir("IR_GOLD_18K", 3_500_000),
        ir("IR_GOLD_24K", 4_600_000),
        ir("IR_GOLD_MELTED", 15_000_000),
        ir("IR_COIN_EMAMI", 42_000_000),
        ir("IR_COIN_BAHAR", 40_000_000),
        ir("IR_COIN_HALF", 22_000_000),
        ir("IR_COIN_QUARTER", 14_000_000),
        ir("IR_COIN_1G", 8_000_000),
        ir("IR_GOLD_BUBBLE", 12),
      ],
    },
    goldGlobal: [{ id: "pax-gold", faName: "انس طلا (PAXG)", price: 2650, change24h: 0.4 }],
    crypto: [
      { id: "bitcoin", faName: "بیت‌کوین", price: 67000, change24h: -1.2 },
      { id: "ethereum", faName: "اتریوم", price: 3400, change24h: 2.1 },
      { id: "solana", faName: "سولانا", price: 150, change24h: 5 },
    ],
  };
}

describe("selectTickerAssets — اندازه و ترتیب", () => {
  test("حداکثر ۱۲ ردیف، حتی وقتی منبع ۱۹ ردیف دارد", () => {
    const rows = selectTickerAssets(fullPayload());
    assert.ok(rows.length <= MAX_TICKER_ITEMS, `${rows.length} ردیف`);
    assert.equal(rows.length, 12);
  });

  test("در بازهٔ ۸ تا ۱۲ می‌ماند", () => {
    const rows = selectTickerAssets(fullPayload());
    assert.ok(rows.length >= 8 && rows.length <= 12, `${rows.length}`);
  });

  test("ترتیب دقیقاً فهرستِ اولویت است، نه ترتیبِ منبع", () => {
    const rows = selectTickerAssets(fullPayload());
    assert.deepEqual(rows.map((r) => r.id), [...HOMEPAGE_TICKER_IDS]);
  });

  test("قطعی است — دو بار اجرا، یک خروجی", () => {
    assert.deepEqual(selectTickerAssets(fullPayload()), selectTickerAssets(fullPayload()));
  });

  test("ترتیبِ منبع خروجی را عوض نمی‌کند", () => {
    const p = fullPayload();
    p.ir!.gold!.reverse();
    p.ir!.currency!.reverse();
    p.crypto!.reverse();
    assert.deepEqual(selectTickerAssets(p).map((r) => r.id), [...HOMEPAGE_TICKER_IDS]);
  });
});

describe("selectTickerAssets — نویزِ منبع حذف می‌شود", () => {
  test("ارزهای خارج از فهرست وارد نمی‌شوند", () => {
    const ids = selectTickerAssets(fullPayload()).map((r) => r.id);
    for (const noise of ["AED", "TRY", "JPY", "CNY", "IR_COIN_1G", "IR_GOLD_BUBBLE", "solana"]) {
      assert.ok(!ids.includes(noise), `${noise} نباید در نوار باشد`);
    }
  });

  test("هیچ شناسه‌ای دو بار نمی‌آید", () => {
    const ids = selectTickerAssets(fullPayload()).map((r) => r.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe("نبودِ نماد — بدونِ صفر، بدونِ جایگزین", () => {
  test("نمادِ غایب فقط رد می‌شود و بقیه سرِ جایشان می‌مانند", () => {
    const p = fullPayload();
    p.ir!.gold = p.ir!.gold!.filter((r) => r.id !== "IR_COIN_EMAMI");
    const ids = selectTickerAssets(p).map((r) => r.id);
    assert.ok(!ids.includes("IR_COIN_EMAMI"));
    assert.deepEqual(ids, HOMEPAGE_TICKER_IDS.filter((i) => i !== "IR_COIN_EMAMI"));
  });

  test("نمادِ غایب با دارایی خارج از فهرست جایگزین نمی‌شود", () => {
    const p = fullPayload();
    p.ir!.gold = p.ir!.gold!.filter((r) => r.id !== "IR_COIN_EMAMI");
    const ids = selectTickerAssets(p).map((r) => r.id);
    assert.equal(ids.length, HOMEPAGE_TICKER_IDS.length - 1);
    for (const noise of ["IR_COIN_1G", "AED", "solana"]) {
      assert.ok(!ids.includes(noise), `${noise} نباید جایگزین شود`);
    }
  });

  test("نبودِ کاملِ فیدِ ایران، ردیف‌های جهانی را نگه می‌دارد", () => {
    const p = fullPayload();
    p.ir = null;
    assert.deepEqual(selectTickerAssets(p).map((r) => r.id), ["pax-gold", "bitcoin", "ethereum"]);
  });

  test("پاسخِ خالی یا نامعتبر ⇒ آرایهٔ خالی، نه خطا", () => {
    for (const p of [null, undefined, {}, { ir: null }, { ir: { gold: [], currency: [] } }]) {
      assert.deepEqual(selectTickerAssets(p as TickerPayload), []);
    }
  });
});

describe("گاردِ قیمت در انتخاب", () => {
  test("قیمتِ صفر/منفی/NaN/بی‌نهایت/گمشده ردیف را حذف می‌کند", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, null, undefined, "90000"]) {
      const p = fullPayload();
      p.ir!.currency![0] = { id: "USD", faName: "دلار", price: bad, unit: "toman" };
      const ids = selectTickerAssets(p).map((r) => r.id);
      assert.ok(!ids.includes("USD"), `price=${String(bad)} نباید رندر شود`);
    }
  });
});

describe("hasRealChange", () => {
  test("صفر معتبر است — «بدون تغییر» یک واقعیتِ بازار است", () => {
    assert.equal(hasRealChange(0), true);
  });
  test("عددِ متناهیِ مثبت و منفی معتبر است", () => {
    assert.equal(hasRealChange(2.4), true);
    assert.equal(hasRealChange(-3), true);
  });
  test("NaN و بی‌نهایت معتبر نیستند — «٪NaN» و «٪Infinity» شبیهِ داده‌اند", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      assert.equal(hasRealChange(bad), false, String(bad));
    }
  });
  test("غیرعدد معتبر نیست", () => {
    for (const bad of [null, undefined, "1.5", {}]) assert.equal(hasRealChange(bad), false);
  });

  test("درصدِ نامعتبر به null تبدیل می‌شود ولی ردیف با قیمتِ سالم می‌ماند", () => {
    const p = fullPayload();
    p.ir!.currency![0] = { id: "USD", faName: "دلار", price: 90000, unit: "toman", changePercent: Number.NaN };
    const usd = selectTickerAssets(p).find((r) => r.id === "USD");
    assert.ok(usd, "ردیف باید بماند — قیمتش سالم است");
    assert.equal(usd!.changePercent, null, "درصدِ نامعتبر نباید رندر شود");
  });
});

describe("مبدأ و واحد", () => {
  test("مبدأ درست برچسب می‌خورد تا مهرِ زمانیِ درست انتخاب شود", () => {
    const rows = selectTickerAssets(fullPayload());
    assert.equal(rows.find((r) => r.id === "USD")!.origin, "ir");
    assert.equal(rows.find((r) => r.id === "bitcoin")!.origin, "global");
    assert.equal(rows.find((r) => r.id === "pax-gold")!.origin, "global");
  });

  test("ردیفِ جهانی دلاری است و ردیفِ ایران تومانی", () => {
    const rows = selectTickerAssets(fullPayload());
    assert.equal(rows.find((r) => r.id === "bitcoin")!.unit, "usd");
    assert.equal(rows.find((r) => r.id === "USD")!.unit, "toman");
  });

  test("اگر شناسه در هر دو فید باشد، ایران برنده است", () => {
    const p = fullPayload();
    p.crypto!.push({ id: "USD", faName: "USD-global", price: 1, change24h: 0 });
    const usd = selectTickerAssets(p).find((r) => r.id === "USD")!;
    assert.equal(usd.origin, "ir");
    assert.equal(usd.price, 90000);
  });

  test("برچسبِ بدونِ نام به شناسه برمی‌گردد، نه رشتهٔ خالی", () => {
    const p: TickerPayload = { ir: { currency: [{ id: "USD", price: 90000, unit: "toman" }] } };
    assert.equal(selectTickerAssets(p)[0].label, "USD");
  });
});

describe("ساختارِ نوار — دسترس‌پذیری و حرکت", () => {
  // این‌ها ساختاری‌اند چون تستِ مرورگر در CI اجرا نمی‌شود. بررسیِ رفتاریِ
  // متناظرشان در scripts/qa-ticker.mjs است و نتیجه‌اش در سندِ حالت‌ها.
  const src = () => readFileSync("components/market/MarketTicker.tsx", "utf8");

  test("کپیِ دومِ نوار aria-hidden است — قیمت‌ها دو بار خوانده نمی‌شوند", () => {
    // ⚠️ این ادعا اول با /aria-hidden="true"/ نوشته شده بود و
    // scripts/prove-guards.mjs نشان داد چیزی نمی‌سنجد: با برداشتنِ
    // aria-hidden از خودِ <ul>، تست هنوز سبز می‌ماند چون همان رشته در
    // <span> درصدِ تغییر هم هست. حالا دقیقاً روی همان <ul> ادعا می‌شود.
    assert.match(
      src(),
      /<ul className="ticker-row" aria-hidden="true">/,
      "کپیِ تکراریِ نوار باید از دیدِ صفحه‌خوان پنهان باشد"
    );
  });

  test("زیرِ prefers-reduced-motion کپیِ دوم اصلاً ساخته نمی‌شود", () => {
    const s = src();
    assert.match(s, /prefers-reduced-motion/, "ترجیحِ کاهشِ حرکت خوانده نمی‌شود");
    assert.match(s, /!reduceMotion &&/, "کپیِ دوم باید شرطیِ نبودِ reduced-motion باشد");
  });

  test("نوار روی مهرِ زمانیِ مشترک حساب می‌کند، نه Date.now()ِ خام", () => {
    assert.match(src(), /computeFreshness\(/, "تازگی باید از ماژولِ مشترک بیاید");
  });
});
