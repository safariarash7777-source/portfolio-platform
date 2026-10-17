import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { computeFreshness, computeTickerFreshness, STALE_AFTER_MIN } from "./market-freshness";

const NOW = 1_700_000_000_000;
const minsAgo = (m: number) => NOW - m * 60_000;

test('one rendered origin with no valid clock cannot borrow another origin clock', () => {
  assert.equal(computeFreshness({usesIr:true,usesGlobal:true,irFetchedAt:null,globalFetchedAt:NOW,now:NOW}).state,'unknown');
  assert.equal(computeFreshness({usesIr:true,usesGlobal:true,irFetchedAt:NOW,globalFetchedAt:NOW+3600000,now:NOW}).showLiveDot,false);
});
test('ticker uses selected quote time and retained state, never receipt as quote time', () => {
  const now=Date.parse('2026-10-17T09:00:00Z');
  const row={id:'USD',price:100,sourceDate:'1405/07/25',sourceTime:'12:25'};
  const payload={fetchedAt:now,crypto:[{id:'bitcoin',price:1}],ir:{fetchedAt:now,currency:[row],gold:[{id:'unrendered',price:10,sourceDate:'1405/07/01',sourceTime:'01:00'}]}};
  assert.equal(computeTickerFreshness(payload,now).state,'fresh');
  row.sourceTime='10:00';
  assert.equal(computeTickerFreshness(payload,now).state,'stale');
  row.sourceDate='';
  assert.equal(computeTickerFreshness(payload,now).state,'unknown');
  row.sourceDate='1405/07/25';row.sourceTime='12:25';
  const retained={...payload,ir:{...payload.ir,snapshotQuality:{version:1,state:'partial',families:{currency:{state:'stale',receivedAt:now,retained:true}}}}};
  assert.equal(computeTickerFreshness(retained,now).showLiveDot,false);
  assert.equal(computeTickerFreshness(retained,now).state,'stale');
});

describe("مهرِ زمانیِ منبعِ درست انتخاب می‌شود", () => {
  test('duplicate IDs use the same last valid row as the rendered price', () => {
    const now = Date.parse('2026-10-17T09:00:00Z');
    const row = {id:'USD',price:100,sourceDate:'1405/07/25',sourceTime:'12:25'};
    const payload = {ir:{fetchedAt:now,currency:[{...row,sourceDate:''}],gold:[row,{...row,price:0,sourceDate:''}]}};
    assert.equal(computeTickerFreshness(payload,now).state,'fresh');
  });
  test("وقتی فقط ردیفِ ایران رندر شده، سنِ فیدِ ایران گزارش می‌شود — نه جهانی", () => {
    const f = computeFreshness({
      irFetchedAt: minsAgo(45),
      globalFetchedAt: NOW, // CoinGecko تازه است ولی هیچ ردیفِ جهانی رندر نشده
      usesIr: true,
      usesGlobal: false,
      now: NOW,
    });
    assert.equal(f.ageMin, 45);
    assert.equal(f.state, "stale");
  });

  test("وقتی هر دو رندر شده‌اند، قدیمی‌ترین برنده است", () => {
    const f = computeFreshness({
      irFetchedAt: minsAgo(50),
      globalFetchedAt: minsAgo(2),
      usesIr: true,
      usesGlobal: true,
      now: NOW,
    });
    assert.equal(f.ageMin, 50, "نوار به‌اندازهٔ کهنه‌ترین چیزی که نشان می‌دهد کهنه است");
    assert.equal(f.state, "stale");
  });

  test("رلهٔ خوابیده با CoinGeckoی سالم، «هم‌اکنون» گزارش نمی‌شود", () => {
    const f = computeFreshness({
      irFetchedAt: minsAgo(180),
      globalFetchedAt: NOW,
      usesIr: true,
      usesGlobal: true,
      now: NOW,
    });
    assert.equal(f.state, "stale");
    assert.ok(!f.label.includes("هم‌اکنون"));
  });

  test("منبعی که رندر نشده، در محاسبه دخالت نمی‌کند", () => {
    const f = computeFreshness({
      irFetchedAt: minsAgo(999),
      globalFetchedAt: minsAgo(3),
      usesIr: false,
      usesGlobal: true,
      now: NOW,
    });
    assert.equal(f.ageMin, 3);
    assert.equal(f.state, "fresh");
  });
});

describe("آستانهٔ کهنگی", () => {
  test(`زیرِ ${STALE_AFTER_MIN} دقیقه تازه است`, () => {
    assert.equal(computeFreshness({ irFetchedAt: minsAgo(STALE_AFTER_MIN - 1), usesIr: true, usesGlobal: false, now: NOW }).state, "fresh");
  });
  test(`دقیقاً ${STALE_AFTER_MIN} دقیقه کهنه است`, () => {
    assert.equal(computeFreshness({ irFetchedAt: minsAgo(STALE_AFTER_MIN), usesIr: true, usesGlobal: false, now: NOW }).state, "stale");
  });
  test("نقطهٔ «زنده» فقط روی دادهٔ تازه است", () => {
    assert.equal(computeFreshness({ irFetchedAt: minsAgo(1), usesIr: true, usesGlobal: false, now: NOW }).showLiveDot, true);
    assert.equal(computeFreshness({ irFetchedAt: minsAgo(60), usesIr: true, usesGlobal: false, now: NOW }).showLiveDot, false);
  });
});

describe("مهرِ زمانیِ نامعتبر ⇒ «نامشخص»، نه «تازه»", () => {
  test("نبودِ مهرِ زمانی تازگی را اثبات نمی‌کند", () => {
    for (const bad of [null, undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const f = computeFreshness({ irFetchedAt: bad as number, usesIr: true, usesGlobal: false, now: NOW });
      assert.equal(f.state, "unknown", String(bad));
      assert.equal(f.ageMin, null);
      assert.equal(f.showLiveDot, false);
    }
  });

  test("هیچ منبعی رندر نشده ⇒ نامشخص", () => {
    assert.equal(computeFreshness({ irFetchedAt: NOW, globalFetchedAt: NOW, usesIr: false, usesGlobal: false, now: NOW }).state, "unknown");
  });

  test("مهرِ زمانیِ آینده بی‌اعتماد است، نه «۰ دقیقه»", () => {
    const f = computeFreshness({ irFetchedAt: NOW + 60 * 60_000, usesIr: true, usesGlobal: false, now: NOW });
    assert.equal(f.state, "unknown");
  });

  test("اختلافِ کوچکِ ساعت تحمل می‌شود و صفر گزارش می‌شود", () => {
    const f = computeFreshness({ irFetchedAt: NOW + 30_000, usesIr: true, usesGlobal: false, now: NOW });
    assert.equal(f.state, "fresh");
    assert.equal(f.ageMin, 0);
  });
});

describe("متنِ نمایش", () => {
  test("ارقامِ برچسب فارسی‌اند", () => {
    const f = computeFreshness({ irFetchedAt: minsAgo(12), usesIr: true, usesGlobal: false, now: NOW });
    assert.match(f.label, /[۰-۹]/);
    assert.ok(!/[0-9]/.test(f.label), "رقمِ لاتین نباید در UI باشد");
  });
  test("حالتِ کهنه صراحتاً «کهنه» می‌گوید", () => {
    assert.match(computeFreshness({ irFetchedAt: minsAgo(90), usesIr: true, usesGlobal: false, now: NOW }).label, /کهنه/);
  });
});
