// تستِ بودجه‌آگاهیِ چرخش و کرانِ کش — بدونِ شبکه.
// اجرا:  node relay/symbol-detail.test.mjs
import assert from "node:assert/strict";
import { rotationBudgetForCycle, msUntilTehranMidnight } from "./symbol-detail.mjs";

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.error(`  ✗ ${name}: ${e.message}`); }
}

const CYCLE = 5 * 60 * 1000;
const DAY = 86_400_000;

/** شبیه‌سازیِ یک روزِ کامل با بودجهٔ مشخص. */
function simulate(cap, cycles = 288, cycleMs = CYCLE) {
  let credit = 0, total = 0;
  const perCycle = [];
  for (let c = 0; c < cycles; c++) {
    const r = rotationBudgetForCycle({
      remaining: cap - total, msLeft: DAY - c * cycleMs, cycleMs, credit,
    });
    credit = r.credit; total += r.take; perCycle.push(r.take);
  }
  return { total, perCycle };
}

console.log("symbol-detail — بودجهٔ چرخش:");

t("کلِ بودجهٔ روز مصرف می‌شود، نه کمتر", () => {
  const { total } = simulate(500);
  assert.equal(total, 500, `مصرف ${total} از ۵۰۰ — انباشتِ اعشاری نباید سهمیه را هدر بدهد`);
});

t("بودجه در کلِ روز پخش می‌شود، نه در ساعاتِ اول", () => {
  // نقصِ نسخهٔ قبل: ۶ تا در هر چرخه ⇒ ۵۰۰ تا در ۸۴ چرخه (~۷ ساعت) تمام می‌شد.
  const { perCycle } = simulate(500);
  const first7h = perCycle.slice(0, 84).reduce((a, b) => a + b, 0);
  assert.ok(first7h < 200, `در ۷ ساعتِ اول ${first7h} مصرف شد — باید خیلی کمتر از ۵۰۰ باشد`);
  const last7h = perCycle.slice(-84).reduce((a, b) => a + b, 0);
  assert.ok(last7h > 100, `در ۷ ساعتِ آخر ${last7h} مصرف شد — بودجه نباید زودتر تمام شده باشد`);
});

t("هیچ چرخه‌ای از سقفِ انفجار بالاتر نمی‌رود", () => {
  const { perCycle } = simulate(500);
  assert.ok(Math.max(...perCycle) <= 6, `بیشینهٔ چرخه ${Math.max(...perCycle)} — سقف ۶ است`);
});

t("بودجهٔ تمام‌شده صفر می‌دهد، نه عددِ منفی", () => {
  const r = rotationBudgetForCycle({ remaining: 0, msLeft: DAY / 2, cycleMs: CYCLE, credit: 3 });
  assert.deepEqual(r, { take: 0, credit: 0 });
  const neg = rotationBudgetForCycle({ remaining: -5, msLeft: DAY / 2, cycleMs: CYCLE, credit: 0 });
  assert.equal(neg.take, 0);
});

t("در پایانِ روز بودجهٔ باقی‌مانده حبس نمی‌شود", () => {
  // یک چرخه تا نیمه‌شب مانده و ۴ درخواست باقی است ⇒ باید همان چرخه خرج شود.
  const r = rotationBudgetForCycle({ remaining: 4, msLeft: CYCLE, cycleMs: CYCLE, credit: 0 });
  assert.equal(r.take, 4);
});

t("سقفِ انفجار حتی با بودجهٔ زیاد رعایت می‌شود", () => {
  const r = rotationBudgetForCycle({ remaining: 500, msLeft: CYCLE, cycleMs: CYCLE, credit: 0 });
  assert.equal(r.take, 6, "آخرین چرخه هم نباید ۵۰۰ درخواست یک‌جا بفرستد");
});

t("بودجهٔ کوچک‌تر از یک در چرخه نه گم می‌شود، نه به آخرِ روز می‌افتد", () => {
  // ۱۰۰ در روز = ۰٫۳۵ در هر چرخه. بدونِ انباشتِ اعشاری، `floor` تا وقتی
  // `cyclesLeft > remaining` نشود صفر می‌دهد — یعنی کلِ بودجه به **یک‌سومِ
  // آخرِ روز** می‌افتد. جمعِ کل در هر دو حالت ۱۰۰ است، پس فقط سنجیدنِ جمع
  // این نقص را نمی‌گیرد؛ **توزیع** باید سنجیده شود.
  const { total, perCycle } = simulate(100);
  assert.equal(total, 100, `مصرف ${total} از ۱۰۰`);
  const firstThird = perCycle.slice(0, 96).reduce((a, b) => a + b, 0);
  assert.ok(firstThird >= 25,
    `در یک‌سومِ اولِ روز فقط ${firstThird} مصرف شد — بودجه باید از ابتدا جاری باشد`);
});

t("msUntilTehranMidnight در بازهٔ معتبر است", () => {
  const ms = msUntilTehranMidnight(new Date("2026-09-10T12:00:00Z"));
  assert.ok(ms > 0 && ms <= DAY, `مقدار ${ms} خارج از بازه`);
  // ۱۲:۰۰ UTC = ۱۵:۳۰ تهران ⇒ ۸٫۵ ساعت تا نیمه‌شب
  assert.ok(Math.abs(ms - 8.5 * 3600_000) < 60_000, `${ms / 3600000} ساعت، انتظار ۸٫۵`);
});

async function check(name, fn) {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.error(`  ✗ ${name}: ${e.stack}`); }
}

let isolation = 0;
const NOW = Date.parse('2026-10-14T12:00:00Z');
const entry = (symbol, at = NOW - 3600000) => ({ at, data: { l18: symbol, marker: 'stored' } });
const snapshot = details => [{ payload: { at: NOW - 3600000, count: Object.keys(details).length, details } }];
const many = count => Object.fromEntries(Array.from({ length: count }, (_, i) => {
  const symbol = `old${i}x`;
  return [symbol, entry(symbol, NOW - 3600000 + i)];
}));

async function offline({ reads = snapshot(many(120)), source = 'fail', cap }, run) {
  const realFetch = globalThis.fetch, RealDate = Date;
  const previousCap = process.env.SYMBOL_DETAIL_DAILY_CAP;
  if (cap !== undefined) process.env.SYMBOL_DETAIL_DAILY_CAP = String(cap);
  globalThis.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [NOW])); } static now() { return NOW; } };
  let readCount = 0, calls = 0;
  const posts = [];
  globalThis.fetch = async (url, init = {}) => {
    assert.equal(new URL(url).hostname, 'offline.invalid', 'unexpected network destination');
    if (init.method === 'POST') { posts.push(JSON.parse(init.body)); return new Response(null, { status: 201 }); }
    readCount++;
    const result = typeof reads === 'function' ? await reads(readCount) : reads;
    return result instanceof Response ? result : Response.json(result);
  };
  const client = { request: async ({ params }) => {
    calls++;
    if (source === 'fail') throw new Error('offline source failure');
    return typeof source === 'function' ? source(params.l18) : { l18: params.l18, marker: 'new' };
  } };
  try {
    const api = await import(`./symbol-detail.mjs?retention=${isolation++}`);
    const options = { base: 'https://offline.invalid', key: 'offline', headers: {}, supabaseUrl: 'https://offline.invalid', serviceKey: 'offline', symbols: ['old119x'], client };
    await run({ api, options, posts, get reads() { return readCount; }, get calls() { return calls; } });
  } finally {
    globalThis.fetch = realFetch; globalThis.Date = RealDate;
    if (previousCap === undefined) delete process.env.SYMBOL_DETAIL_DAILY_CAP;
    else process.env.SYMBOL_DETAIL_DAILY_CAP = previousCap;
  }
}

await check('cold boot with all source failures preserves 120 stored entries and makes no POST', async () => {
  await offline({}, async h => {
    await h.api.refreshSymbolDetailsRotation(h.options);
    assert.equal(h.api.symbolDetailStatus().cached, 120);
    assert.ok(h.calls > 0); assert.equal(h.reads, 2); assert.equal(h.posts.length, 0);
    const result = await h.api.getSymbolDetail('old119x', h.options);
    assert.equal(result.stale, true); assert.equal(result.data.marker, 'stored');
  });
});

await check('zero rotation budget never empties or refresh-labels a stored snapshot', async () => {
  await offline({ cap: 0 }, async h => {
    await h.api.refreshSymbolDetailsRotation(h.options);
    assert.equal(h.calls, 0); assert.equal(h.posts.length, 0);
    assert.equal(h.api.symbolDetailStatus().cached, 120);
  });
});

await check('partial successful refresh preserves other entries and their individual clocks', async () => {
  const before = many(120);
  await offline({ reads: snapshot(before), source: 'success' }, async h => {
    await h.api.refreshSymbolDetailsRotation(h.options);
    assert.equal(h.posts.length, 1);
    const p = h.posts[0].payload;
    assert.equal(p.count, 120); assert.equal(p.at, NOW);
    assert.equal(p.details.old119x.at, NOW); assert.equal(p.details.old119x.data.marker, 'new');
    for (const [symbol, old] of Object.entries(before)) if (symbol !== 'old119x') assert.deepEqual(p.details[symbol], old);
  });
});

await check('restoration between baseline read and publication is merged; cache remains bounded', async () => {
  await offline({ reads: n => n === 1 ? [] : snapshot(many(120)), source: 'success' }, async h => {
    h.options.symbols = ['fresh'];
    await h.api.refreshSymbolDetailsRotation(h.options);
    const p = h.posts[0].payload;
    assert.equal(p.count, 120); assert.equal(p.details.fresh.at, NOW);
    assert.ok(p.details.old119x); assert.equal(p.details.old0x, undefined);
    assert.equal(h.api.symbolDetailStatus().cached, 120);
  });
});

await check('a later restoration survives a process that previously published only one entry', async () => {
  await offline({ reads: n => n <= 2 ? [] : snapshot(many(120)), source: 'success' }, async h => {
    await h.api.refreshSymbolDetailsRotation(h.options);
    assert.equal(h.posts[0].payload.count, 1);
    await h.api.refreshSymbolDetailsRotation(h.options);
    assert.equal(h.posts.length, 2);
    const p = h.posts[1].payload;
    assert.equal(p.count, 120);
    assert.deepEqual(p.details.old0x, entry('old0x'));
    assert.equal(p.details.old119x.at, NOW);
    assert.equal(p.details.old119x.data.marker, 'new');
  });
});

await check('a newer independent stored entry beats the older local entry on the next publication', async () => {
  let reads = 0;
  await offline({ reads: () => {
    reads++;
    return snapshot({ old119x: { at: NOW - (reads === 1 ? 3600000 : 1000), data: { l18: 'old119x', marker: reads === 1 ? 'old' : 'restored' } } });
  } }, async h => {
    await h.api.refreshSymbolDetailsRotation(h.options);
    assert.equal(h.posts.length, 0);
    const result = await h.api.getSymbolDetail('old119x', h.options);
    assert.equal(result.data.marker, 'restored');
  });
});

await check('unreadable or malformed baseline blocks provider work and every overwrite', async () => {
  const invalid = [new Response(null, { status: 503 }), {}, [{}], [{ payload: {} }],
    [{ payload: { details: [] } }], snapshot({ bad: null }),
    snapshot({ bad: { at: NOW, data: { l18: 'wrong' } } }),
    [{ payload: { count: 2, details: { good: entry('good') } } }],
    snapshot({ bad: { at: 'today', data: { l18: 'bad' } } })];
  for (const reads of invalid) await offline({ reads }, async h => {
    await h.api.refreshSymbolDetailsRotation(h.options);
    assert.equal(h.calls, 0); assert.equal(h.posts.length, 0);
    assert.match(h.api.symbolRotationStatus().lastError, /baseline/);
  });
});

await check('failed final baseline read preserves fresh local data but cannot overwrite DB', async () => {
  await offline({ reads: n => n === 1 ? [] : new Response(null, { status: 503 }), source: 'success' }, async h => {
    await h.api.refreshSymbolDetailsRotation(h.options);
    assert.equal(h.posts.length, 0); assert.equal(h.api.symbolDetailStatus().cached, 1);
    assert.match(h.api.symbolRotationStatus().lastError, /baseline HTTP 503/);
  });
});

await check('missing and future entry clocks never become fresh or borrow snapshot receipt time', async () => {
  for (const at of [null, NOW + 60000]) await offline({ reads: snapshot({ old119x: entry('old119x', at) }), cap: 0 }, async h => {
    await h.api.refreshSymbolDetailsRotation(h.options);
    const result = await h.api.getSymbolDetail('old119x', h.options);
    assert.equal(result.stale, true); assert.equal(h.posts.length, 0);
  });
});

await check('concurrent rotations share one read-refresh-publish cycle', async () => {
  await offline({ reads: [], source: 'success' }, async h => {
    const first = h.api.refreshSymbolDetailsRotation(h.options);
    const second = h.api.refreshSymbolDetailsRotation(h.options);
    assert.equal(first, second); await Promise.all([first, second]);
    assert.equal(h.reads, 2); assert.equal(h.posts.length, 1); assert.equal(h.calls, 1);
  });
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
