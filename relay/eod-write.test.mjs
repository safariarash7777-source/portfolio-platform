import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planEodHistory, writeEodHistory, writtenAfterClose, MIN_EOD_ROWS } from "./eod.mjs";

/**
 * B-055 — شبیه‌سازیِ گذار، retry، restart، تعطیلی و فیدِ کهنه روی یک PostgRESTِ
 * جعلی که **همان کلیدِ یکتای Production** را اعمال می‌کند: `(symbol, trade_date)`
 * بدونِ `source`، و append-only (هیچ UPDATE/DELETE). زمانِ `captured_at` مثلِ
 * Production پیش‌فرضِ `now()` است و از ساعتِ آزمون می‌آید.
 *
 * زمان‌ها: تهران UTC+03:30. ۱۴:۳۰ تهران = ۱۱:۰۰Z؛ ۰۰:۰۶ تهران = ۲۰:۳۶Zِ روزِ قبل.
 */
function fakePostgrest() {
  const rows = new Map(); // `${symbol}|${trade_date}` → row
  const snapshots = new Map();
  const clock = { now: new Date(0) };
  const faults = { failInsertBatches: 0 };
  const calls = [];
  const json = (status, body) => ({ ok: status < 300, status, json: async () => body });

  async function request(method, path, body, prefer = "") {
    calls.push(`${method} ${path.split("?")[0]}`);
    const [table, qs = ""] = path.split("?");
    const q = new URLSearchParams(qs);
    if (method === "GET" && table === "symbol_history") {
      let list = [...rows.values()];
      for (const [k, v] of q) {
        if (k === "select" || k === "limit" || k === "order") continue;
        const [op, val] = [v.slice(0, v.indexOf(".")), v.slice(v.indexOf(".") + 1)];
        if (op === "eq") list = list.filter((r) => String(r[k]) === val);
        if (op === "lt") list = list.filter((r) => String(r[k]) < val);
      }
      if (q.get("order") === "trade_date.desc") list.sort((a, b) => (a.trade_date < b.trade_date ? 1 : -1));
      if (q.get("limit")) list = list.slice(0, Number(q.get("limit")));
      return json(200, list.map((r) => ({ ...r })));
    }
    if (method === "POST" && table === "symbol_history") {
      if (faults.failInsertBatches > 0) {
        faults.failInsertBatches -= 1;
        return json(503, { message: "injected" }); // دسته اتمیک است: هیچ ردیفی اعمال نشد
      }
      const ignore = prefer.includes("resolution=ignore-duplicates") && q.get("on_conflict") === "symbol,trade_date";
      const conflict = body.some((r) => rows.has(`${r.symbol}|${r.trade_date}`));
      if (conflict && !ignore) return json(409, { code: "23505" });
      for (const r of body) {
        const k = `${r.symbol}|${r.trade_date}`;
        if (!rows.has(k)) rows.set(k, { ...r, captured_at: clock.now.toISOString() });
      }
      return json(201, null);
    }
    if (method === "POST" && table === "ir_market_snapshots") {
      assert.ok(prefer.includes("merge-duplicates"), "snapshot باید upsert باشد");
      for (const s of body) snapshots.set(s.key, s.payload);
      return json(201, null);
    }
    return json(400, { message: `unexpected ${method} ${path}` });
  }
  return { rows, snapshots, clock, faults, calls, request };
}

const SYMS = (n, tag) =>
  Array.from({ length: n }, (_, i) => ({
    id: `ت${i}م`, // به حرف ختم می‌شود — نمادِ رقم‌پایان زیرنماد است و Z1 بیرونش می‌گذارد
    value: 1_000_000 + i + tag * 7,
    closingPrice: 1_000 + i + tag,
    price: 1_010 + i + tag,
    volume: 10 + i,
  }));
const payload = (jdate, n, tag) => ({ indices: { date: jdate }, stocks: SYMS(n, tag), funds: [] });

async function cycle(db, atUtc, p) {
  db.clock.now = new Date(atUtc);
  const plan = planEodHistory(p, db.clock.now, 14);
  if (plan.skip) return { skip: plan.skip };
  return writeEodHistory({ plan, request: db.request, now: db.clock.now, afterHour: 14 });
}

/** ردیف‌هایی که کدِ قبلی برای برچسبِ L ساعتِ ۰۰:۰۶ تهران می‌نوشت (محتوا: جلسهٔ قبل). */
function seedOldCode(db, label, capturedUtc, n, tag) {
  for (const s of SYMS(n, tag)) {
    db.rows.set(`${s.id}|${label}`, {
      symbol: s.id, trade_date: label, close: s.closingPrice * 10, last_price: s.price * 10,
      volume: s.volume, value_traded: s.value, source: "relay_eod", captured_at: capturedUtc,
    });
  }
}

const N = 1100; // سه دستهٔ ۵۰۰تایی — مثلِ Production

test("writtenAfterClose: ۰۰:۰۶ همان روز پیش از بسته‌شدن است؛ ۱۴:۳۰ و روزِ بعد پس از آن", () => {
  assert.equal(writtenAfterClose("2026-09-15T20:36:00Z", "2026-09-16"), false); // ۰۰:۰۶ ۰۹-۱۶
  assert.equal(writtenAfterClose("2026-09-16T11:00:00Z", "2026-09-16"), true); //  ۱۴:۳۰ ۰۹-۱۶
  assert.equal(writtenAfterClose("2026-09-17T05:00:00Z", "2026-09-16"), true); //  روزِ بعد
});

test("گذار: برچسبِ اشغال‌شده با ردیفِ پیش از بسته‌شدن — پایانیِ جلسه دور ریخته نمی‌شود", async () => {
  const db = fakePostgrest();
  seedOldCode(db, "2026-09-15", "2026-09-14T20:36:00Z", N, 1); // برچسبِ سه‌شنبه، محتوای دوشنبه
  seedOldCode(db, "2026-09-16", "2026-09-15T20:36:00Z", N, 2); // برچسبِ چهارشنبه، محتوای سه‌شنبه
  const before = db.rows.size;

  // استقرار صبحِ چهارشنبه؛ نخستین چرخهٔ پس از بسته‌شدن
  const r = await cycle(db, "2026-09-16T11:00:00Z", payload("1405/06/25", N, 3));
  assert.equal(r.tradeDate, "2026-09-16");
  assert.equal(r.inserted, 0);
  assert.equal(r.displaced, N);
  assert.equal(r.complete, true);
  assert.equal(db.rows.size, before, "تاریخچه دست نخورد — append-only");
  const stash = db.snapshots.get("eod_displaced:2026-09-16");
  assert.equal(stash.count, N);
  assert.equal(stash.rows[0].close, (1_000 + 3) * 10, "پایانیِ واقعیِ چهارشنبه نگه داشته شد");
});

test("restart در همان روز: هیچ ردیفِ تکراری، stash همان", async () => {
  const db = fakePostgrest();
  seedOldCode(db, "2026-09-16", "2026-09-15T20:36:00Z", N, 2);
  await cycle(db, "2026-09-16T11:00:00Z", payload("1405/06/25", N, 3));
  const size = db.rows.size;
  const stash = JSON.stringify(db.snapshots.get("eod_displaced:2026-09-16").rows);
  // فرایندِ تازه (حالتِ حافظه صفر) — همان payload
  const r = await cycle(db, "2026-09-16T11:30:00Z", payload("1405/06/25", N, 3));
  assert.equal(db.rows.size, size);
  assert.equal(r.inserted, 0);
  assert.equal(JSON.stringify(db.snapshots.get("eod_displaced:2026-09-16").rows), stash);
});

test("نیمه‌شبِ بعد: هیچ نوشتنی؛ جلسهٔ بعد ساعتِ ۱۴:۳۰ با برچسبِ درست", async () => {
  const db = fakePostgrest();
  const mid = await cycle(db, "2026-09-18T20:36:00Z", payload("1405/06/25", N, 3)); // ۰۰:۰۶ شنبه
  assert.deepEqual(mid, { skip: "before-close" });
  assert.equal(db.rows.size, 0);
  const r = await cycle(db, "2026-09-19T11:00:00Z", payload("1405/06/28", N, 4)); // ۱۴:۳۰ شنبه
  assert.equal(r.inserted, N);
  assert.equal(r.complete, true);
  const one = db.rows.get(`${SYMS(1, 4)[0].id}|2026-09-19`);
  assert.equal(writtenAfterClose(one.captured_at, "2026-09-19"), true);
});

test("تعطیلی: شاخص همان جلسهٔ قبل را می‌گوید — برچسبِ تازه ساخته نمی‌شود", async () => {
  const db = fakePostgrest();
  await cycle(db, "2026-09-19T11:00:00Z", payload("1405/06/28", N, 4));
  const size = db.rows.size;
  // کدِ قبلی در Production روزِ ۰۸-۰۴/۰۸-۱۲/۰۸-۳۰ دقیقاً همین را برچسبِ تازه زد.
  const r = await cycle(db, "2026-09-20T11:00:00Z", payload("1405/06/28", N, 4));
  assert.equal(r.tradeDate, "2026-09-19");
  assert.equal(r.inserted, 0);
  assert.equal(r.alreadyDone, N);
  assert.equal(db.rows.size, size);
  assert.equal([...db.rows.values()].some((x) => x.trade_date === "2026-09-20"), false);
});

test("فیدِ کهنه: شاخص جلو رفته ولی نمادها همان جلسهٔ قبل‌اند — نوشته نمی‌شود", async () => {
  const db = fakePostgrest();
  await cycle(db, "2026-09-19T11:00:00Z", payload("1405/06/28", N, 4));
  const size = db.rows.size;
  const r = await cycle(db, "2026-09-20T11:00:00Z", payload("1405/06/29", N, 4)); // tag یکسان = دادهٔ کهنه
  assert.equal(r.inserted, 0);
  assert.equal(r.complete, false);
  assert.equal(r.stale.previousSession, "2026-09-19");
  assert.equal(r.stale.identicalShare, 1);
  assert.equal(db.rows.size, size);
  // وقتی دادهٔ تازه رسید، همان جلسه نوشته می‌شود
  const ok = await cycle(db, "2026-09-20T11:05:00Z", payload("1405/06/29", N, 5));
  assert.equal(ok.inserted, N);
  assert.equal(ok.complete, true);
});

test("retry: شکستِ دستهٔ دوم جلسه را قفل نمی‌کند؛ تلاشِ بعد فقط غایب‌ها را درج می‌کند", async () => {
  const db = fakePostgrest();
  db.faults.failInsertBatches = 0;
  // دستهٔ اول موفق، دستهٔ دوم شکست
  let calls = 0;
  const orig = db.request;
  db.request = async (m, p, b, pr) => {
    if (m === "POST" && p.startsWith("symbol_history") && ++calls === 2) return { ok: false, status: 503, json: async () => ({}) };
    return orig(m, p, b, pr);
  };
  await assert.rejects(() => cycle(db, "2026-09-21T11:00:00Z", payload("1405/06/30", N, 6)), /@batch 500/);
  assert.equal(db.rows.size, 500, "فقط دستهٔ اول");
  const r = await cycle(db, "2026-09-21T11:05:00Z", payload("1405/06/30", N, 6));
  assert.equal(r.alreadyDone, 500);
  assert.equal(r.inserted, N - 500);
  assert.equal(r.complete, true);
  assert.equal(db.rows.size, N, "بدونِ تکرار و بدونِ جاافتاده");
});

test("ردیفِ منبعِ دیگر (کندل) دسته را نمی‌شکند و بازنویسی نمی‌شود", async () => {
  const db = fakePostgrest();
  const [first] = SYMS(1, 7);
  db.rows.set(`${first.id}|2026-09-22`, {
    symbol: first.id, trade_date: "2026-09-22", close: 1, source: "brsapi_candle", captured_at: "2026-09-22T12:00:00Z",
  });
  const r = await cycle(db, "2026-09-22T11:00:00Z", payload("1405/06/31", N, 7));
  assert.equal(r.occupiedByOtherSource, 1);
  assert.equal(r.inserted, N - 1);
  assert.equal(r.complete, true);
  assert.equal(db.rows.get(`${first.id}|2026-09-22`).source, "brsapi_candle");
});

test("کمتر از کفِ ردیف: نوشته می‌شود ولی جلسه کامل علامت نمی‌خورد", async () => {
  const db = fakePostgrest();
  const r = await cycle(db, "2026-09-22T11:00:00Z", payload("1405/06/31", MIN_EOD_ROWS - 1, 8));
  assert.equal(r.inserted, MIN_EOD_ROWS - 1);
  assert.equal(r.complete, false);
});

test("کلیدِ یکتای جعلی واقعاً اعمال می‌شود: درجِ بی ignore-duplicates روی تکراری 409 می‌دهد", async () => {
  // تا آزمون‌های بالا روی جعلیِ بی‌دندان سبز نشوند.
  const db = fakePostgrest();
  seedOldCode(db, "2026-09-16", "2026-09-15T20:36:00Z", 1, 2);
  const [s] = SYMS(1, 2);
  const res = await db.request("POST", "symbol_history", [{ symbol: s.id, trade_date: "2026-09-16" }], "return=minimal");
  assert.equal(res.status, 409);
});

// ── سیم‌کشیِ server.mjs ────────────────────────────────────────────────────
const SERVER = readFileSync(new URL("./server.mjs", import.meta.url), "utf8")
  .split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");

test("server.mjs: نوشتن از writeEodHistory، و چرخهٔ ناقص (بودجه) چیزی نمی‌نویسد", () => {
  const fn = SERVER.slice(SERVER.indexOf("async function pushDailyHistory("), SERVER.indexOf("\n}\n", SERVER.indexOf("async function pushDailyHistory(")));
  assert.match(fn, /writeEodHistory\(/);
  assert.match(fn, /if \(!cycleComplete\)/);
  assert.match(fn, /lastDate: r\.complete \? r\.tradeDate : eodStatus\.lastDate/);
  assert.match(SERVER, /pushDailyHistory\(body, \{ cycleComplete: !budgetStop\.active \}\)/);
  assert.doesNotMatch(fn, /select=id&trade_date/, "میان‌برِ «یک ردیف هست ⇒ تمام» برگشته");
});
