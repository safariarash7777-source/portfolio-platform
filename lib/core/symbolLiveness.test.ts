/**
 * تست‌های `symbolLiveness`.
 *
 * تمرکز روی همان تمایزهایی که این ماژول برای آن‌ها ساخته شد — نه پوششِ خطی:
 * «عقب‌ماندگیِ لوله» در برابر «نمادِ متوقف»، «بازارِ بسته» در برابر «فیدِ خراب»،
 * و «نداریم» در برابر «صفر».
 */
import test from "node:test";
import { strict as assert } from "node:assert";
import {
  assessFeed, classifySymbol, buildLivenessReport, isoDayNumber, BOARD_DOWN_AFTER_MIN,
  type SymbolRow, type FeedInput,
} from "./symbolLiveness";

const NOW = Date.parse("2026-09-12T10:00:00Z");
const healthyFeed: FeedInput = { boardFetchedAt: NOW - 3 * 60_000, now: NOW, boardSymbols: 1086, boardWithVolume: 900 };

/* ── فید ─────────────────────────────────────────────────────────────────── */

test("تابلوی تازه با معامله = بازار باز", () => {
  const a = assessFeed(healthyFeed);
  assert.equal(a.verdict, "trading");
  assert.equal(a.ageMin, 3);
  assert.match(a.driver, /900/);
});

test("تابلوی تازه بدونِ هیچ حجمی = بازارِ بسته، نه فیدِ خراب", () => {
  const a = assessFeed({ ...healthyFeed, boardWithVolume: 0 });
  assert.equal(a.verdict, "closed");
});

test("تابلوی کهنه = فیدِ خراب، هرچقدر هم ردیف داشته باشد", () => {
  const a = assessFeed({ ...healthyFeed, boardFetchedAt: NOW - (BOARD_DOWN_AFTER_MIN + 1) * 60_000 });
  assert.equal(a.verdict, "feed_down");
});

test("تابلوی تازه ولی خالی = فیدِ خراب، نه بازارِ بسته", () => {
  const a = assessFeed({ ...healthyFeed, boardSymbols: 0, boardWithVolume: 0 });
  assert.equal(a.verdict, "feed_down");
});

test("مهرِ زمانیِ آینده اعتماد نمی‌سازد — «نامعلوم» است، نه «خیلی تازه»", () => {
  const a = assessFeed({ ...healthyFeed, boardFetchedAt: NOW + 10 * 60_000 });
  assert.equal(a.verdict, "unknown");
  assert.equal(a.ageMin, null);
});

test("بدونِ مهرِ زمانی، رأی «نامعلوم» است — نه «تازه»", () => {
  assert.equal(assessFeed({ ...healthyFeed, boardFetchedAt: null }).verdict, "unknown");
});

/* ── تمایزِ اصلی: لولهٔ عقب‌مانده در برابر نمادِ متوقف ────────────────────── */

const LAST_DAY = isoDayNumber("2026-09-12")!;
const TODAY = LAST_DAY;

test("عقب + روی تابلو = عقب‌ماندگیِ لولهٔ ما", () => {
  const r = classifySymbol({ symbol: "الف", lastTradeDate: "2026-09-05", onBoard: true }, LAST_DAY, TODAY, true);
  assert.equal(r.state, "lagging");
  assert.equal(r.behindDays, 7);
  assert.match(r.why, /ثبت نشده/);
});

test("عقب + بیرون از تابلو = متوقف یا حذف‌شده", () => {
  const r = classifySymbol({ symbol: "دتهران", lastTradeDate: "2018-10-29", onBoard: false }, LAST_DAY, TODAY, true);
  assert.equal(r.state, "off_board");
  assert.ok(r.behindDays! > 2800);
});

test("همان دو ورودی، وقتی فید خراب است، به حدس تبدیل نمی‌شوند", () => {
  const onB = classifySymbol({ symbol: "الف", lastTradeDate: "2026-09-05", onBoard: true }, LAST_DAY, TODAY, false);
  const offB = classifySymbol({ symbol: "ب", lastTradeDate: "2026-09-05", onBoard: false }, LAST_DAY, TODAY, false);
  assert.equal(onB.state, "undetermined");
  assert.equal(offB.state, "undetermined");
});

test("«هیچ ردیفی نداریم» با «عقب است» یکی نیست", () => {
  const r = classifySymbol({ symbol: "ج", lastTradeDate: null, onBoard: true }, LAST_DAY, TODAY, true);
  assert.equal(r.state, "never_seen");
  assert.equal(r.behindDays, null, "نبودِ داده عددِ فاصله نمی‌سازد");
});

test("تاریخِ آینده دادهٔ معیوب است، نه تازه‌ترین داده", () => {
  const r = classifySymbol({ symbol: "د", lastTradeDate: "2027-01-01", onBoard: true }, LAST_DAY, TODAY, true);
  assert.equal(r.state, "invalid_date");
});

test("تاریخِ بدشکل هم «نداریم» است، نه صفر", () => {
  const r = classifySymbol({ symbol: "ه", lastTradeDate: "1405/06/21", onBoard: true }, LAST_DAY, TODAY, true);
  assert.equal(r.state, "never_seen");
});

/* ── گزارشِ کامل ─────────────────────────────────────────────────────────── */

const SAMPLE: SymbolRow[] = [
  { symbol: "فولاد", lastTradeDate: "2026-09-12", onBoard: true },
  { symbol: "خودرو", lastTradeDate: "2026-09-12", onBoard: true },
  { symbol: "لاگ", lastTradeDate: "2026-09-05", onBoard: true },
  { symbol: "دتهران", lastTradeDate: "2018-10-29", onBoard: false },
  { symbol: "نو", lastTradeDate: null, onBoard: true },
];

test("گزارش هر پنج حالت را جدا می‌شمارد", () => {
  const rep = buildLivenessReport(SAMPLE, healthyFeed);
  assert.deepEqual(rep.counts, {
    live: 2, lagging: 1, off_board: 1, undetermined: 0, invalid_date: 0, never_seen: 1,
  });
  assert.equal(rep.marketLastTradeDate, "2026-09-12");
  assert.equal(rep.coverageOnLastDay, 2 / 5);
});

test("یک ردیفِ تاریخِ آینده نباید کلِ مجموعه را «عقب» نشان دهد", () => {
  const rep = buildLivenessReport(
    [...SAMPLE, { symbol: "خراب", lastTradeDate: "2030-01-01", onBoard: true }],
    healthyFeed,
  );
  assert.equal(rep.marketLastTradeDate, "2026-09-12", "مبنا نباید به ۲۰۳۰ بپرد");
  assert.equal(rep.counts.live, 2, "بقیه همچنان زنده‌اند");
  assert.equal(rep.counts.invalid_date, 1);
});

test("فیدِ خراب: هیچ نمادی به «متوقف» متهم نمی‌شود", () => {
  const rep = buildLivenessReport(SAMPLE, { ...healthyFeed, boardFetchedAt: NOW - 120 * 60_000 });
  assert.equal(rep.feed.verdict, "feed_down");
  assert.equal(rep.counts.off_board, 0);
  assert.equal(rep.counts.lagging, 0);
  assert.equal(rep.counts.undetermined, 2);
});

test("بازارِ بسته اعتمادِ تابلو را از بین نمی‌برد", () => {
  const rep = buildLivenessReport(SAMPLE, { ...healthyFeed, boardWithVolume: 0 });
  assert.equal(rep.feed.verdict, "closed");
  assert.equal(rep.counts.off_board, 1, "تابلوی تازه هنوز می‌گوید چه کسی هست");
});

test("مجموعهٔ خالی پوششِ صفر نمی‌سازد — پوشش نامعلوم است", () => {
  const rep = buildLivenessReport([], healthyFeed);
  assert.equal(rep.coverageOnLastDay, null);
  assert.equal(rep.marketLastTradeDate, null);
});

/* ── لایهٔ داده ───────────────────────────────────────────────────────────── */

import { composeLiveness, fetchLastTradeDates, getLivenessReport, resetLivenessCache } from "./livenessData";

const BOARD = { ids: ["فولاد", "لاگ", "تازه"], withVolume: 3, fetchedAt: NOW - 60_000 };

test("نمادی که روی تابلو هست ولی تاریخچه ندارد از گزارش نمی‌افتد", () => {
  const rep = composeLiveness(
    [{ symbol: "فولاد", last_trade_date: "2026-09-12" }, { symbol: "لاگ", last_trade_date: "2026-09-05" }],
    BOARD, NOW,
  );
  assert.equal(rep.rows.length, 3);
  assert.equal(rep.rows.find((r) => r.symbol === "تازه")!.state, "never_seen");
  assert.equal(rep.counts.lagging, 1);
});

test("نمادِ بیرون از تابلو با تاریخچهٔ کهنه = متوقف", () => {
  const rep = composeLiveness(
    [{ symbol: "فولاد", last_trade_date: "2026-09-12" }, { symbol: "رفته", last_trade_date: "2019-01-01" }],
    BOARD, NOW,
  );
  assert.equal(rep.rows.find((r) => r.symbol === "رفته")!.state, "off_board");
});

test("نبودِ RPC با خطای RPC یکی نیست", async () => {
  const saved = { u: process.env.NEXT_PUBLIC_SUPABASE_URL, k: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.invalid";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "k";
  try {
    const notFound = await fetchLastTradeDates((async () => ({ status: 404, ok: false })) as unknown as typeof fetch);
    assert.equal(notFound.why, "rpc_missing", "۴۰۴ یعنی phase29 اجرا نشده، نه خطا");
    const broken = await fetchLastTradeDates((async () => ({ status: 500, ok: false })) as unknown as typeof fetch);
    assert.equal(broken.why, "rpc_error");
  } finally {
    process.env.NEXT_PUBLIC_SUPABASE_URL = saved.u;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = saved.k;
  }
});

test("بدونِ تابلو، گزارشِ خوش‌بینانه ساخته نمی‌شود", async () => {
  resetLivenessCache();
  const out = await getLivenessReport(null, NOW);
  assert.equal(out.report, null);
  assert.equal(out.unavailable, "no_board");
});
