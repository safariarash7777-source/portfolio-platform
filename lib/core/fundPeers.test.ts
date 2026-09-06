import { test } from "node:test";
import assert from "node:assert/strict";
import {
  peerGroupStats, peerPosition, liquidityStats,
  MIN_PEERS_FOR_STATS, MIN_DAYS_FOR_LIQUIDITY,
  type PeerRow, type LiquidityDay,
} from "./fundPeers";

/* ── گروه‌بندی ─────────────────────────────────────────────────────────── */

const GOLD = "صندوق کالایی مبتنی بر طلا";
const LEV = "صندوق های سرمایه گذاری اهرمی";

const ROWS: PeerRow[] = [
  { id: "طلا۱", type: GOLD, value: 2 },
  { id: "طلا۲", type: GOLD, value: 5 },
  { id: "طلا۳", type: GOLD, value: 8 },
  { id: "طلا۴", type: GOLD, value: 11 },
  { id: "طلا۵", type: GOLD, value: null },   // بدونِ NAV
  { id: "اهرم۱", type: LEV, value: 40 },
  { id: "اهرم۲", type: LEV, value: 45 },
];

test("گروه‌بندی: هر نوع جدا؛ صندوقِ اهرمی وارد آمارِ طلا نمی‌شود", () => {
  const s = peerGroupStats(ROWS);
  const g = s.get(GOLD)!;
  assert.equal(g.max, 11, "بیشینهٔ طلا نباید ۴۵ (اهرمی) باشد");
  assert.equal(g.median, 6.5);
});

test("گروه‌بندی: عضوِ بدونِ مقدار در members شمرده می‌شود ولی در آمار نه", () => {
  const g = peerGroupStats(ROWS).get(GOLD)!;
  assert.equal(g.members, 5, "هر ۵ صندوقِ طلا عضوِ گروه‌اند");
  assert.equal(g.withValue, 4, "ولی فقط ۴ تا مقدار دارند");
});

test("گروه‌بندی: گروهِ کم‌جمعیت اصلاً آمار نمی‌گیرد، نه آمارِ ضعیف", () => {
  const s = peerGroupStats(ROWS);
  assert.equal(s.has(LEV), false, `۲ عضو < ${MIN_PEERS_FOR_STATS}`);
  const three = peerGroupStats([...ROWS, { id: "اهرم۳", type: LEV, value: 50 }]);
  assert.ok(three.has(LEV), "با ۳ عضو آمار می‌گیرد");
});

test("گروه‌بندی: نوعِ خالی یا null کنار گذاشته می‌شود، گروهِ «سایر» ساخته نمی‌شود", () => {
  const s = peerGroupStats([
    { id: "a", type: null, value: 1 },
    { id: "b", type: "  ", value: 2 },
    { id: "c", type: "", value: 3 },
  ]);
  assert.equal(s.size, 0);
});

/* ── جایگاه ───────────────────────────────────────────────────────────── */

test("جایگاه: رتبه، فاصله از میانه و چارک", () => {
  const s = peerGroupStats(ROWS);
  const p = peerPosition({ id: "طلا۴", type: GOLD, value: 11 }, s, ROWS)!;
  assert.equal(p.rank, 4);
  assert.equal(p.of, 4);
  assert.equal(p.median, 6.5);
  assert.equal(p.vsMedian, 4.5);
  assert.equal(p.quartile, 4);
});

test("جایگاه: کمترین مقدار رتبهٔ ۱ و چارکِ ۱ می‌گیرد", () => {
  const s = peerGroupStats(ROWS);
  const p = peerPosition({ id: "طلا۱", type: GOLD, value: 2 }, s, ROWS)!;
  assert.equal(p.rank, 1);
  assert.equal(p.quartile, 1);
});

test("جایگاه: بدونِ مقدار یا بدونِ گروهِ آماری → null، نه رتبهٔ صفر", () => {
  const s = peerGroupStats(ROWS);
  assert.equal(peerPosition({ id: "طلا۵", type: GOLD, value: null }, s, ROWS), null);
  assert.equal(peerPosition({ id: "اهرم۱", type: LEV, value: 40 }, s, ROWS), null);
  assert.equal(peerPosition({ id: "x", type: null, value: 1 }, s, ROWS), null);
});

/* ── نقدشوندگی ────────────────────────────────────────────────────────── */

function days(n: number, valueRial: number | null, volume: number | null = 1000): LiquidityDay[] {
  return Array.from({ length: n }, (_, i) => ({
    trade_date: `2026-08-${String(i + 1).padStart(2, "0")}`,
    value_traded: valueRial,
    volume,
  }));
}

test("نقدشوندگی: تبدیلِ واحد ریال → میلیون تومان یک‌بار و درست", () => {
  // ۱e9 ریال = ۱e8 تومان = ۱۰۰ میلیون تومان
  const s = liquidityStats(days(12, 1e9))!;
  assert.equal(s.medianDailyValueMTom, 100);
});

test("نقدشوندگی: کمتر از حداقلِ روز → null، نه میانهٔ دو روزه", () => {
  assert.equal(liquidityStats(days(MIN_DAYS_FOR_LIQUIDITY - 1, 1e9)), null);
  assert.ok(liquidityStats(days(MIN_DAYS_FOR_LIQUIDITY, 1e9)) !== null);
});

test("نقدشوندگی: روزِ بدونِ رکورد صفر گرفته نمی‌شود — شمرده و کنار می‌رود", () => {
  const mixed: LiquidityDay[] = [...days(10, 1e9), ...days(3, null)];
  const s = liquidityStats(mixed)!;
  assert.equal(s.observedDays, 10, "فقط روزهای دارای رکورد");
  assert.equal(s.daysWithoutRecord, 3);
  assert.equal(s.medianDailyValueMTom, 100, "میانه با صفرهای ساختگی پایین نیامد");
});

test("نقدشوندگی: روزِ بدونِ معامله با روزِ بدونِ رکورد یکی نیست", () => {
  const s = liquidityStats([
    ...days(10, 5e9, 1000),
    ...days(2, 0, 0),      // واقعاً معامله نشد — رکورد هست
  ])!;
  assert.equal(s.zeroVolumeDays, 2);
  assert.equal(s.daysWithoutRecord, 0);
  assert.equal(s.observedDays, 12);
  assert.ok(Math.abs(s.tradedDayRatio - 10 / 12) < 1e-9);
  assert.equal(s.minDailyValueMTom, 0, "کمینه واقعاً صفر است و پنهان نمی‌شود");
});

test("نقدشوندگی: میانه در برابرِ یک روزِ پرت مقاوم است", () => {
  const s = liquidityStats([...days(11, 1e9), ...days(1, 1e13)])!;
  assert.equal(s.medianDailyValueMTom, 100, "یک روزِ پرت میانه را جابه‌جا نمی‌کند");
});

test("نقدشوندگی: مقدارِ منفی رکوردِ خراب است، نه معاملهٔ منفی", () => {
  const s = liquidityStats([...days(10, 1e9), ...days(2, -5)])!;
  assert.equal(s.daysWithoutRecord, 2);
  assert.equal(s.observedDays, 10);
});
