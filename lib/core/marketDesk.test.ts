// تستِ میزِ بازار — هر قاعده، مرزهایش، و تفکیکِ «چیزی نبود» از «چیزی ندیدیم».
import { strict as assert } from "node:assert";
import test from "node:test";
import {
  buildDesk, BAND_EDGE_PCT, BOARD_GAP_PCT, PREMIUM_GAP_PP,
  type DeskFund, type DeskStock, type DeskResult,
} from "./marketDesk";
import { NAV_STALE_HOURS } from "./fundBubble";

const NOW = Date.parse("2026-09-12T09:00:00+03:30");

/** تاریخِ جلالیِ معادلِ «n ساعت پیش»، با ساعت. */
function navAgo(hours: number): { navDate: string; navTime: string } {
  const d = new Date(NOW - hours * 3_600_000);
  const fa = new Intl.DateTimeFormat("en-u-ca-persian-nu-latn", {
    timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const g = (t: string) => fa.find((p) => p.type === t)!.value;
  const hm = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d);
  return { navDate: `${g("year")}/${g("month")}/${g("day")}`, navTime: hm };
}

function fund(over: Partial<DeskFund> = {}): DeskFund {
  return { id: "ف۱", faName: "صندوق یک", price: 10_000, type: "طلا", nav: 10_000, bubblePercent: 0, ...navAgo(1), ...over };
}
function stock(over: Partial<DeskStock> = {}): DeskStock {
  return { id: "س۱", faName: "سهم یک", price: 1000, closingPrice: 1000, ...over };
}
const cov = (r: DeskResult, k: string) => r.coverage.find((c) => c.kind === k)!;

/* ── NAV ─────────────────────────────────────────────────────────────────── */

test("NAVِ کهنه‌تر از آستانه مشاهده می‌سازد، تازه‌تر نه", () => {
  const fresh = buildDesk({ funds: [fund({ ...navAgo(NAV_STALE_HOURS - 1) })] }, { now: NOW });
  assert.equal(cov(fresh, "nav_stale").matched, 0, "درست زیرِ آستانه نباید مشاهده بسازد");

  const stale = buildDesk({ funds: [fund({ ...navAgo(NAV_STALE_HOURS + 1) })] }, { now: NOW });
  assert.equal(cov(stale, "nav_stale").matched, 1);
  const o = stale.observations[0];
  assert.equal(o.kind, "nav_stale");
  assert.ok(o.drivers.some((d) => d.label === "سنِ NAV"), "هر مشاهده باید driver داشته باشد");
  assert.ok(o.drivers.some((d) => d.label === "آستانه"), "آستانه هم باید دیده شود، نه پنهان");
});

test("«NAV نیامده» با «NAV کهنه» یکی شمرده نمی‌شود", () => {
  const r = buildDesk({ funds: [fund({ navDate: null, navTime: null })] }, { now: NOW });
  assert.equal(cov(r, "nav_missing").matched, 1);
  assert.equal(cov(r, "nav_stale").matched, 0);
  assert.equal(cov(r, "nav_stale").examined, 0, "صندوقی که ساعت ندارد اصلاً سنجیده نشده");
  assert.equal(r.observations[0].kind, "nav_missing");
});

test("دقتِ زمانِ NAV در driver می‌آید — «فقط روز» پنهان نمی‌شود", () => {
  const { navDate } = navAgo(NAV_STALE_HOURS + 30);
  const r = buildDesk({ funds: [fund({ navDate, navTime: null })] }, { now: NOW });
  const o = r.observations.find((x) => x.kind === "nav_stale");
  assert.ok(o, "با تاریخِ بدونِ ساعت هم باید سنجیده شود");
  assert.equal(o!.drivers.find((d) => d.label === "دقتِ زمان")!.value, "فقط روز");
});

/* ── حباب هم‌نوع ─────────────────────────────────────────────────────────── */

test("مقایسهٔ حباب فقط درونِ هم‌نوع است", () => {
  const funds: DeskFund[] = [
    fund({ id: "ط۱", type: "طلا", bubblePercent: 1 }),
    fund({ id: "ط۲", type: "طلا", bubblePercent: 2 }),
    fund({ id: "ط۳", type: "طلا", bubblePercent: 3 }),
    // این یکی در گروهِ دیگری است و نباید میانهٔ «طلا» را جابه‌جا کند.
    fund({ id: "س۱", type: "سهامی", bubblePercent: 90 }),
  ];
  const r = buildDesk({ funds }, { now: NOW });
  assert.equal(cov(r, "premium_outlier").matched, 0,
    "هیچ‌کدام از طلاها بیش از آستانه از میانهٔ طلا فاصله ندارند");
});

test("گروهِ کم‌جمعیت آمار نمی‌گیرد و علتش نوشته می‌شود", () => {
  const r = buildDesk({ funds: [
    fund({ id: "ط۱", type: "طلا", bubblePercent: 1 }),
    fund({ id: "ط۲", type: "طلا", bubblePercent: 50 }),
  ] }, { now: NOW });
  const c = cov(r, "premium_outlier");
  assert.equal(c.matched, 0);
  assert.ok(c.blocked && c.blocked.length > 0, "«چرا نشد» باید نوشته شود، نه سکوت");
});

test("حبابِ دور از میانهٔ هم‌نوع مشاهده می‌سازد و فاصله را می‌گوید", () => {
  const funds: DeskFund[] = [
    fund({ id: "ط۱", type: "طلا", bubblePercent: 0 }),
    fund({ id: "ط۲", type: "طلا", bubblePercent: 1 }),
    fund({ id: "ط۳", type: "طلا", bubblePercent: 2 }),
    fund({ id: "ط۴", type: "طلا", bubblePercent: 1 + PREMIUM_GAP_PP + 0.5 }),
  ];
  const r = buildDesk({ funds }, { now: NOW });
  const o = r.observations.find((x) => x.kind === "premium_outlier");
  assert.ok(o, "باید یک مشاهده بسازد");
  assert.equal(o!.symbol, "ط۴");
  assert.ok(o!.drivers.some((d) => d.label === "جایگاه در گروه"));
  assert.ok(o!.drivers.some((d) => d.label.includes("میانه")));
});

test("صندوقِ بدونِ حباب در شمارشِ «سنجیده‌شده» نمی‌آید", () => {
  const funds: DeskFund[] = [
    fund({ id: "ط۱", type: "طلا", bubblePercent: 0 }),
    fund({ id: "ط۲", type: "طلا", bubblePercent: 1 }),
    fund({ id: "ط۳", type: "طلا", bubblePercent: 2 }),
    fund({ id: "ط۴", type: "طلا", bubblePercent: null }),
  ];
  const c = cov(buildDesk({ funds }, { now: NOW }), "premium_outlier");
  assert.equal(c.candidates, 4);
  assert.equal(c.examined, 3, "چهارمی داده نداشت — نامزد بود ولی سنجیده نشد");
});

/* ── دامنه و تابلو ───────────────────────────────────────────────────────── */

test("نزدیکیِ دامنه دقیقاً روی آستانه گرفته می‌شود و فراتر از آن نه", () => {
  // اعداد عمداً صحیح‌اند تا فاصله **دقیقاً** برابرِ آستانه شود. با
  // `1000 * (1 + 1.5/100)` نتیجه ۱۴٫۹۹۹…٪ می‌شد و تست دیگر نمی‌توانست
  // `<=` را از `<` تشخیص دهد — یعنی مرزی را ادعا می‌کرد که نمی‌سنجید.
  assert.equal(((1015 - 1000) / 1000) * 100, BAND_EDGE_PCT, "چیدمانِ تست واقعاً روی مرز است");

  const on = buildDesk({ stocks: [stock({ price: 1000, bandHigh: 1015 })] }, { now: NOW });
  assert.equal(cov(on, "band_edge").matched, 1, "روی خودِ آستانه باید گرفته شود");
  const off = buildDesk({ stocks: [stock({ price: 1000, bandHigh: 1016 })] }, { now: NOW });
  assert.equal(cov(off, "band_edge").matched, 0, "یک واحد آن‌طرف‌تر نباید گرفته شود");
});

test("سهمِ بدونِ آستانهٔ دامنه اصلاً سنجیده نمی‌شود", () => {
  const c = cov(buildDesk({ stocks: [stock({ bandHigh: null, bandLow: null })] }, { now: NOW }), "band_edge");
  assert.equal(c.candidates, 1);
  assert.equal(c.examined, 0, "«نتوانستیم بسنجیم» با «مشکلی نبود» یکی نیست");
});

test("فاصلهٔ آخرین معامله و پایانی روی آستانه گرفته می‌شود", () => {
  assert.equal(((1020 - 1000) / 1000) * 100, BOARD_GAP_PCT, "چیدمانِ تست واقعاً روی مرز است");
  const on = buildDesk({ stocks: [stock({ price: 1020, closingPrice: 1000 })] }, { now: NOW });
  assert.equal(cov(on, "board_gap").matched, 1, "روی خودِ آستانه گرفته می‌شود");
  const off = buildDesk({ stocks: [stock({ price: 1019, closingPrice: 1000 })] }, { now: NOW });
  assert.equal(cov(off, "board_gap").matched, 0, "یک واحد این‌طرف‌تر نه");
});

test("فاصلهٔ منفی هم گرفته می‌شود و علامتش درست گزارش می‌شود", () => {
  const r = buildDesk({ stocks: [stock({ price: 1000 * (1 - (BOARD_GAP_PCT + 1) / 100), closingPrice: 1000 })] }, { now: NOW });
  const o = r.observations.find((x) => x.kind === "board_gap")!;
  assert.ok(o.drivers.find((d) => d.label === "فاصله")!.value.startsWith("−"), "کاهش باید منفی دیده شود");
});

/* ── ترکیب و صداقتِ شمارش ────────────────────────────────────────────────── */

test("میزِ خالی با میزِ نادیده اشتباه نمی‌شود", () => {
  const nothingWrong = buildDesk({ funds: [fund()], stocks: [stock()] }, { now: NOW });
  assert.equal(nothingWrong.observations.length, 0);
  assert.ok(cov(nothingWrong, "board_gap").examined > 0, "سنجیده شد و چیزی نبود");

  const cannotSee = buildDesk({ funds: [], stocks: [] }, { now: NOW });
  assert.equal(cannotSee.observations.length, 0);
  assert.equal(cov(cannotSee, "board_gap").examined, 0, "اصلاً چیزی برای سنجیدن نبود");
});

test("limit فقط نمایش را می‌برد — شمارشِ پوشش کامل می‌ماند", () => {
  const stocks = Array.from({ length: 20 }, (_, i) =>
    stock({ id: `س${i}`, price: 1000 * (1 + (BOARD_GAP_PCT + 1 + i) / 100), closingPrice: 1000 }));
  const r = buildDesk({ stocks }, { now: NOW, limit: 3 });
  assert.equal(r.observations.length, 3, "نمایش بریده شد");
  assert.equal(cov(r, "board_gap").matched, 20, "ولی شمارش کامل گزارش شد");
});

test("مرتب‌سازی باندِ کیفی را بر بزرگی مقدم می‌داند", () => {
  const stocks = [
    stock({ id: "کم", price: 1000 * (1 + (BOARD_GAP_PCT + 0.1) / 100), closingPrice: 1000 }),
    stock({ id: "زیاد", price: 1000 * (1 + (BOARD_GAP_PCT * 4) / 100), closingPrice: 1000 }),
  ];
  const r = buildDesk({ stocks }, { now: NOW });
  assert.equal(r.observations[0].symbol, "زیاد");
  assert.equal(r.observations[0].band, "قابل‌توجه");
  assert.equal(r.observations[1].band, "خفیف");
});

test("هیچ مشاهده‌ای بدونِ driver ساخته نمی‌شود", () => {
  const r = buildDesk({
    funds: [
      fund({ id: "ط۱", type: "طلا", bubblePercent: 0 }),
      fund({ id: "ط۲", type: "طلا", bubblePercent: 1 }),
      fund({ id: "ط۳", type: "طلا", bubblePercent: 2 }),
      fund({ id: "ط۴", type: "طلا", bubblePercent: 40, ...navAgo(NAV_STALE_HOURS + 5) }),
      fund({ id: "ط۵", type: "طلا", bubblePercent: 1, navDate: null }),
    ],
    stocks: [
      stock({ id: "س۹", price: 1100, closingPrice: 1000, bandHigh: 1105 }),
    ],
  }, { now: NOW, limit: 50 });
  assert.ok(r.observations.length >= 4);
  for (const o of r.observations) {
    assert.ok(o.drivers.length > 0, `${o.id} بدونِ driver است`);
    assert.ok(o.headline.length > 0);
    assert.ok(o.symbol.length > 0);
  }
});

test("ابزارِ بدونِ قیمت در شمارشِ «غیرقابل‌استفاده» دیده می‌شود، نه حذفِ خاموش", () => {
  const r = buildDesk({
    funds: [fund({ price: null })],
    stocks: [stock({ price: null })],
  }, { now: NOW });
  assert.equal(r.unusable, 2);
});
