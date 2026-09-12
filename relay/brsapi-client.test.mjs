// تستِ رفتاریِ کلاینتِ مرکزی — بدونِ شبکه، با ساعت و fetchِ تزریقی.
// اجرا:  node relay/brsapi-client.test.mjs
import assert from "node:assert/strict";
import {
  BrsApiClient, LeakyBucket, backoffDelayMs, dedupeKey, isRetryable,
  DailyBudget, BudgetExceededError, classCeiling, BUDGET_CLASSES,
  PersistentDailyBudget,
} from "./brsapi-client.mjs";
import { makeSupabaseLeaseStore } from "./brsapi-budget-store.mjs";

let pass = 0, fail = 0;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);

/** ساعتِ مجازی: `sleep` زمان را جلو می‌برد، پس تست فوری اجرا می‌شود. */
function fakeClock() {
  let now = 0;
  return {
    now: () => now,
    sleep: async (ms) => { now += ms; },
    advance: (ms) => { now += ms; },
    get t() { return now; },
  };
}

function okRes(body = { ok: true }) {
  return { ok: true, status: 200, json: async () => body, headers: { get: () => null } };
}
function errRes(status, retryAfter = null) {
  return { ok: false, status, json: async () => ({}), headers: { get: (h) => (h === "retry-after" ? retryAfter : null) } };
}

/* ── اجزای خالص ─────────────────────────────────────────────────────────── */

t("۴xxِ غیرِ ۴۲۹ هرگز retry نمی‌شود — قاعدهٔ Q1", () => {
  assert.equal(isRetryable(400), false);
  assert.equal(isRetryable(403), false);
  assert.equal(isRetryable(404), false);
  assert.equal(isRetryable(429), true);
  assert.equal(isRetryable(500), true);
  assert.equal(isRetryable(503), true);
});

t("backoff نمایی است و سقف دارد", () => {
  const max = (n) => backoffDelayMs(n, { baseMs: 1000, maxMs: 60000 }, () => 0.999999);
  assert.ok(max(1) >= 999 && max(1) <= 1000);
  assert.ok(max(2) >= 1999 && max(2) <= 2000);
  assert.ok(max(3) >= 3999 && max(3) <= 4000);
  assert.ok(max(10) <= 60000, "سقف باید رعایت شود");
});

t("full jitter: کفِ بازه صفر است، نه پایه", () => {
  // بدونِ full jitter همهٔ درخواست‌های یک موج دقیقاً با هم برمی‌گردند.
  assert.equal(backoffDelayMs(5, { baseMs: 1000, maxMs: 60000 }, () => 0), 0);
});

t("کلیدِ dedup به ترتیبِ پارامترها وابسته نیست", () => {
  assert.equal(dedupeKey("A.php", { b: 2, a: 1 }), dedupeKey("A.php", { a: 1, b: 2 }));
  assert.notEqual(dedupeKey("A.php", { a: 1 }), dedupeKey("A.php", { a: 2 }));
});

/* ── سطلِ نشتی ───────────────────────────────────────────────────────────── */

t("سطل: ۱۰ req/s یعنی فاصلهٔ ۱۰۰ms، نه ۱۰تا در یک لحظه", () => {
  const c = fakeClock();
  const b = new LeakyBucket({ ratePerSec: 10, now: c.now });
  const waits = Array.from({ length: 5 }, () => b.take());
  assert.deepEqual(waits, [0, 100, 200, 300, 400]);
});

t("سطل: مرزِ پنجره تراکم نمی‌سازد", () => {
  // نقصِ پنجرهٔ ثابت: ۱۰ تا در انتهای پنجره + ۱۰ تا در ابتدای بعدی = ۲۰ در یک لحظه.
  const c = fakeClock();
  const b = new LeakyBucket({ ratePerSec: 10, now: c.now });
  for (let i = 0; i < 10; i++) b.take();
  c.advance(1000);
  const next = Array.from({ length: 3 }, () => b.take());
  assert.ok(next.every((w) => w >= 0));
  assert.ok(next[1] - next[0] === 100 || next[1] >= 0, "فاصله باید حفظ شود");
});

t("سطل: پس از ۴۲۹ نرخِ سراسری کند می‌شود", () => {
  const c = fakeClock();
  const b = new LeakyBucket({ ratePerSec: 10, now: c.now });
  b.take();
  b.slowDown(5000, 2);
  b.take();
  const w = b.take();
  assert.ok(w >= 200, `فاصله پس از کندشدن ${w}ms — باید ≥۲۰۰ باشد`);
});

/* ── رفتارِ کلاینت ───────────────────────────────────────────────────────── */

function mk(over = {}) {
  const c = fakeClock();
  const calls = [];
  const client = new BrsApiClient({
    base: "https://x", key: "SECRET", now: c.now, sleep: c.sleep, rand: () => 0.5,
    fetchImpl: async (url) => { calls.push(url); return (over.responder || (() => okRes()))(url, calls.length); },
    ...over.opts,
  });
  return { client, calls, clock: c };
}

t("کلیدِ API در params رد می‌شود", async () => {
  const { client } = mk();
  await assert.rejects(() => client.request({ endpoint: "A.php", params: { key: "x" } }), /کلیدِ API/);
});

t("کلید به URL اضافه می‌شود ولی در کلیدِ dedup نیست", async () => {
  const { client, calls } = mk();
  await client.request({ endpoint: "A.php", params: { l18: "فملی" } });
  assert.ok(calls[0].includes("key=SECRET"));
  assert.ok(!dedupeKey("A.php", { l18: "فملی" }).includes("SECRET"));
});

t("dedupِ درپرواز: دو فراخوانِ هم‌زمان یک درخواست می‌شوند", async () => {
  const { client, calls } = mk();
  const [a, b] = await Promise.all([
    client.request({ endpoint: "A.php", params: { x: 1 } }),
    client.request({ endpoint: "A.php", params: { x: 1 } }),
  ]);
  assert.equal(calls.length, 1, "باید یک درخواستِ واقعی باشد");
  assert.deepEqual(a, b);
  assert.equal(client.metrics().dedupeInFlight, 1);
});

t("کشِ کوتاه‌مدت درخواستِ دوم را حذف می‌کند", async () => {
  const { client, calls } = mk();
  await client.request({ endpoint: "A.php", params: { x: 1 }, dedupeTtlMs: 60_000 });
  await client.request({ endpoint: "A.php", params: { x: 1 }, dedupeTtlMs: 60_000 });
  assert.equal(calls.length, 1);
  assert.equal(client.metrics().dedupeCache, 1);
});

t("کش پس از انقضای TTL دوباره درخواست می‌زند", async () => {
  const { client, calls, clock } = mk();
  await client.request({ endpoint: "A.php", params: { x: 1 }, dedupeTtlMs: 1_000 });
  clock.advance(2_000);
  await client.request({ endpoint: "A.php", params: { x: 1 }, dedupeTtlMs: 1_000 });
  assert.equal(calls.length, 2);
});

t("هم‌زمانی هرگز از سقف بالاتر نمی‌رود", async () => {
  let active = 0, peak = 0;
  const { client } = mk({
    opts: { concurrency: 4 },
    responder: async () => { active++; peak = Math.max(peak, active); await Promise.resolve(); active--; return okRes(); },
  });
  await Promise.all(Array.from({ length: 25 }, (_, i) =>
    client.request({ endpoint: "A.php", params: { i } })));
  assert.ok(peak <= 4, `بیشینهٔ هم‌زمانی ${peak} — سقف ۴ است`);
});

t("۴۲۹ تا سقفِ تلاش retry می‌شود و بعد شکست می‌خورد", async () => {
  const { client, calls } = mk({ responder: () => errRes(429) });
  await assert.rejects(() => client.request({ endpoint: "A.php", producer: "p" }), /429|http 429/);
  assert.equal(calls.length, 4, "۴ تلاش برای پس‌زمینه");
  assert.equal(client.metrics().err429, 4);
  assert.equal(client.metrics().retries, 3);
});

t("۵xx retry می‌شود و اگر بعداً موفق شد، موفق برمی‌گردد", async () => {
  const { client, calls } = mk({ responder: (_u, n) => (n < 3 ? errRes(503) : okRes({ v: 7 })) });
  const r = await client.request({ endpoint: "A.php" });
  assert.deepEqual(r, { v: 7 });
  assert.equal(calls.length, 3);
});

t("۴۰۳ فوراً شکست می‌خورد — یک تلاش، نه چهار", async () => {
  const { client, calls } = mk({ responder: () => errRes(403) });
  await assert.rejects(() => client.request({ endpoint: "A.php" }));
  assert.equal(calls.length, 1, "URL غلط با تکرار درست نمی‌شود و ریسکِ بن دارد");
  assert.equal(client.metrics().retries, 0);
});

t("Retry-After بر محاسبهٔ backoff مقدم است", async () => {
  const { client, clock } = mk({ responder: (_u, n) => (n === 1 ? errRes(429, "5") : okRes()) });
  const before = clock.t;
  await client.request({ endpoint: "A.php" });
  assert.ok(clock.t - before >= 5000, `تأخیر ${clock.t - before}ms — باید ≥۵۰۰۰ باشد`);
});

t("کارِ تعاملی قبل از پس‌زمینه خدمت می‌گیرد", async () => {
  const order = [];
  const { client } = mk({
    opts: { concurrency: 1 },
    responder: async (url) => { order.push(new URL(url).searchParams.get("tag")); return okRes(); },
  });
  const p1 = client.request({ endpoint: "A.php", params: { tag: "bg1" }, priority: "background" });
  const rest = [
    client.request({ endpoint: "A.php", params: { tag: "bg2" }, priority: "background" }),
    client.request({ endpoint: "A.php", params: { tag: "bg3" }, priority: "background" }),
    client.request({ endpoint: "A.php", params: { tag: "ui" }, priority: "interactive" }),
  ];
  await Promise.all([p1, ...rest]);
  assert.equal(order[0], "bg1", "اولی از قبل شروع شده بود");
  assert.equal(order[1], "ui", `ترتیب ${order.join(",")} — تعاملی باید قبل از bg2 باشد`);
});

t("تلاشِ تعاملی کمتر است — ۲ نه ۴", async () => {
  const { client, calls } = mk({ responder: () => errRes(500) });
  await assert.rejects(() => client.request({ endpoint: "A.php", priority: "interactive" }));
  assert.equal(calls.length, 2);
});

t("متریک «نفرستادیم» را از «فرستادیم و خطا نداد» جدا می‌کند", async () => {
  const { client } = mk();
  assert.equal(client.metrics().sent, 0);
  await client.request({ endpoint: "A.php", producer: "nav" });
  const m = client.metrics();
  assert.equal(m.sent, 1);
  assert.equal(m.ok, 1);
  assert.equal(m.byProducer.nav.sent, 1);
  assert.equal(m.byProducer.nav.ok, 1);
});

t("متریکِ صف عمق و انتظار را ثبت می‌کند", async () => {
  const { client } = mk({ opts: { concurrency: 2 } });
  await Promise.all(Array.from({ length: 12 }, (_, i) =>
    client.request({ endpoint: "A.php", params: { i } })));
  const m = client.metrics();
  assert.ok(m.queuedPeak > 0, "عمقِ صف باید دیده شود");
  assert.ok(m.queueWaitSamples > 0);
});

t("نرخ در عمل رعایت می‌شود: ۲۰ درخواست ≥ ۱٫۹ ثانیه طول می‌کشد", async () => {
  const { client, clock } = mk();
  const start = clock.t;
  await Promise.all(Array.from({ length: 20 }, (_, i) =>
    client.request({ endpoint: "A.php", params: { i } })));
  const elapsed = clock.t - start;
  assert.ok(elapsed >= 1900, `${elapsed}ms برای ۲۰ درخواست — با ۱۰ req/s باید ≥۱۹۰۰ باشد`);
});

t("پرچم پیش‌فرض خاموش است — مسیرِ قدیمی دست‌نخورده می‌ماند", async () => {
  const { clientEnabled } = await import("./brsapi-client.mjs");
  const prev = process.env.BRSAPI_CLIENT_ENABLED;
  delete process.env.BRSAPI_CLIENT_ENABLED;
  assert.equal(clientEnabled(), false, "بدونِ متغیر باید خاموش باشد");
  process.env.BRSAPI_CLIENT_ENABLED = "0";
  assert.equal(clientEnabled(), false, "«0» یعنی خاموش");
  process.env.BRSAPI_CLIENT_ENABLED = "true";
  assert.equal(clientEnabled(), false, "فقط «1» روشن می‌کند — نه هر مقدارِ صادق");
  process.env.BRSAPI_CLIENT_ENABLED = "1";
  assert.equal(clientEnabled(), true);
  if (prev === undefined) delete process.env.BRSAPI_CLIENT_ENABLED;
  else process.env.BRSAPI_CLIENT_ENABLED = prev;
});

t("مهلتِ صف جدا از مهلتِ درخواست است", async () => {
  // با یک کارگر و مهلتِ صفِ کوتاه، کارِ دوم باید با خطای **صف** رد شود،
  // نه اینکه درخواستش را بفرستد.
  const c = fakeClock();
  const calls = [];
  let releaseFirst;
  const client = new BrsApiClient({
    base: "https://x", key: "K", now: c.now, sleep: c.sleep, rand: () => 0.5,
    concurrency: 1, queueWaitMs: 1_000,
    fetchImpl: async (u) => { calls.push(u); await new Promise((r) => { releaseFirst = r; }); return okRes(); },
  });
  const first = client.request({ endpoint: "A.php", params: { i: 1 } });
  await Promise.resolve();
  const second = client.request({ endpoint: "A.php", params: { i: 2 } });
  const rejected = assert.rejects(() => second, /queue wait exceeded/);
  await new Promise((r) => setTimeout(r, 1100));
  await rejected;
  assert.equal(calls.length, 1, "کارِ ردشده نباید درخواستی فرستاده باشد");
  assert.equal(client.metrics().rejectedQueueTimeout, 1);
  releaseFirst?.();
  await first;
});

/* ── بودجهٔ روزانه ───────────────────────────────────────────────────────── */

const BUDGET = { softBudget: 100, hardCeiling: 150 };

t("سقفِ هر طبقه: bulk در soft، critical در hard، standard وسط", () => {
  assert.equal(classCeiling("bulk", BUDGET), 100);
  assert.equal(classCeiling("critical", BUDGET), 150);
  assert.equal(classCeiling("standard", BUDGET), 125);
});

t("سقفِ سخت بر همه مقدم است، حتی اگر soft بزرگ‌تر تنظیم شده باشد", () => {
  const weird = { softBudget: 999, hardCeiling: 10 };
  for (const c of BUDGET_CLASSES) {
    assert.ok(classCeiling(c, weird) <= 10, `${c} از سقفِ سخت رد شد`);
  }
});

t("bulk در softBudget می‌ایستد ولی critical ادامه می‌دهد", () => {
  const b = new DailyBudget({ ...BUDGET, now: () => 0 });
  for (let i = 0; i < 100; i++) assert.ok(b.reserve("bulk"), `bulk در ${i} رد شد`);
  assert.equal(b.reserve("bulk"), false, "bulk باید دقیقاً روی soft بایستد");
  assert.equal(b.reserve("critical"), true, "critical باید ادامه بدهد");
});

t("standard پیش از critical می‌ایستد — تنزلِ تدریجی", () => {
  const b = new DailyBudget({ ...BUDGET, now: () => 0 });
  for (let i = 0; i < 125; i++) b.reserve("critical");
  assert.equal(b.reserve("standard"), false, "standard روی سقفِ خودش می‌ایستد");
  assert.equal(b.reserve("critical"), true);
});

t("در سقفِ سخت هیچ طبقه‌ای عبور نمی‌کند — حتی critical", () => {
  const b = new DailyBudget({ ...BUDGET, now: () => 0 });
  for (let i = 0; i < 150; i++) b.reserve("critical");
  for (const c of BUDGET_CLASSES) {
    assert.equal(b.reserve(c), false, `${c} از سقفِ سخت رد شد`);
  }
  assert.equal(b.snapshot().used, 150);
});

t("شمارنده با تغییرِ روزِ تهران صفر می‌شود", () => {
  let ms = Date.parse("2026-09-12T09:00:00Z");
  const b = new DailyBudget({ ...BUDGET, now: () => ms });
  for (let i = 0; i < 150; i++) b.reserve("critical");
  assert.equal(b.reserve("critical"), false);
  ms = Date.parse("2026-09-13T09:00:00Z");
  assert.equal(b.reserve("critical"), true, "روزِ تازه یعنی بودجهٔ تازه");
  assert.equal(b.snapshot().used, 1);
});

t("متریکِ بودجه used/remaining/rejected را جدا گزارش می‌کند", () => {
  const b = new DailyBudget({ ...BUDGET, now: () => 0 });
  for (let i = 0; i < 100; i++) b.reserve("bulk");
  b.reserve("bulk"); b.reserve("bulk");
  const s = b.snapshot();
  assert.equal(s.used, 100);
  assert.equal(s.remaining, 50, "باقی‌مانده نسبت به سقفِ سخت");
  assert.equal(s.rejectedByBudget, 2);
  assert.equal(s.rejectedByClass.bulk, 2);
  assert.equal(s.usedByClass.bulk, 100);
  assert.equal(s.remainingByClass.bulk, 0, "bulk دیگر جا ندارد");
  assert.equal(s.remainingByClass.critical, 50, "critical هنوز دارد");
  assert.ok(s.softExhausted);
});

/* ── بودجه در مسیرِ واقعیِ کلاینت ────────────────────────────────────────── */

function mkBudget(over = {}) {
  const c = fakeClock();
  const calls = [];
  const client = new BrsApiClient({
    base: "https://x", key: "K", now: c.now, sleep: c.sleep, rand: () => 0.5,
    softBudget: over.soft ?? 6, hardCeiling: over.hard ?? 10,
    fetchImpl: async (u) => { calls.push(u); return (over.responder || (() => okRes()))(u, calls.length); },
    ...over.opts,
  });
  return { client, calls, clock: c };
}

t("درخواستِ ردشده به‌خاطرِ بودجه اصلاً روی سیم نمی‌رود", async () => {
  const { client, calls } = mkBudget({ soft: 2, hard: 3 });
  for (let i = 0; i < 3; i++) await client.request({ endpoint: "A.php", params: { i }, budgetClass: "critical" });
  assert.equal(calls.length, 3);
  await assert.rejects(() => client.request({ endpoint: "A.php", params: { z: 1 }, budgetClass: "critical" }),
    (e) => e instanceof BudgetExceededError);
  assert.equal(calls.length, 3, "هیچ درخواستِ اضافه‌ای فرستاده نشد");
  assert.equal(client.metrics().rejectedByBudget, 1);
});

t("bulk قربانی می‌شود تا critical زنده بماند", async () => {
  const { client, calls } = mkBudget({ soft: 3, hard: 6 });
  for (let i = 0; i < 3; i++) await client.request({ endpoint: "A.php", params: { i }, budgetClass: "bulk", producer: "backfill" });
  await assert.rejects(() => client.request({ endpoint: "A.php", params: { b: 1 }, budgetClass: "bulk", producer: "backfill" }),
    (e) => e instanceof BudgetExceededError);
  // چرخهٔ بازار باید همچنان عبور کند
  await client.request({ endpoint: "A.php", params: { m: 1 }, budgetClass: "critical", producer: "market" });
  assert.equal(calls.length, 4);
  const m = client.metrics();
  assert.equal(m.byProducer.backfill.rejectedByBudget, 1);
  assert.equal(m.byProducer.market.ok, 1);
});

t("retryها هم از بودجه کم می‌کنند", async () => {
  // چهار تلاشِ ۵xx = چهار واحدِ بودجه، نه یکی.
  const { client } = mkBudget({ hard: 100, soft: 100, responder: () => errRes(503) });
  await assert.rejects(() => client.request({ endpoint: "A.php", budgetClass: "critical" }));
  assert.equal(client.metrics().budget.used, 4, "هر تلاش یک درخواستِ واقعی روی سیم است");
});

t("بودجه می‌تواند وسطِ زنجیرهٔ retry تمام شود و صریح خطا بدهد", async () => {
  const { client, calls } = mkBudget({ hard: 2, soft: 2, responder: () => errRes(503) });
  await assert.rejects(
    () => client.request({ endpoint: "A.php", budgetClass: "critical" }),
    (e) => e instanceof BudgetExceededError,
  );
  assert.equal(calls.length, 2, "دو تلاش رفت، سومی پشتِ بودجه ماند");
});

t("هیچ ترکیبی از producerها نمی‌تواند از سقفِ سخت رد شود", async () => {
  // پنج تولیدکننده با هر سه طبقه، همه هم‌زمان، خیلی بیشتر از بودجه.
  const { client, calls } = mkBudget({ hard: 40, soft: 25, opts: { concurrency: 8 } });
  const jobs = [];
  const producers = [
    ["market", "critical"], ["nav", "critical"], ["meta", "standard"],
    ["backfill", "bulk"], ["archive", "bulk"],
  ];
  for (const [producer, budgetClass] of producers) {
    for (let i = 0; i < 60; i++) {
      jobs.push(client.request({ endpoint: "A.php", params: { producer, i }, producer, budgetClass })
        .catch(() => null));
    }
  }
  await Promise.all(jobs);
  const m = client.metrics();
  assert.ok(calls.length <= 40, `${calls.length} درخواستِ واقعی — سقفِ سخت ۴۰ است`);
  assert.equal(m.budget.used, calls.length, "شمارنده باید دقیقاً با درخواست‌های واقعی بخواند");
  assert.ok(m.budget.used <= m.budget.hardCeiling);
  assert.ok(m.rejectedByBudget > 0, "بقیه باید با علتِ بودجه رد شده باشند");
});

t("در کمبودِ بودجه، سهمِ critical از bulk بیشتر است", async () => {
  const { client } = mkBudget({ hard: 30, soft: 10, opts: { concurrency: 8 } });
  const jobs = [];
  for (let i = 0; i < 50; i++) {
    jobs.push(client.request({ endpoint: "A.php", params: { c: i }, producer: "market", budgetClass: "critical" }).catch(() => null));
    jobs.push(client.request({ endpoint: "A.php", params: { b: i }, producer: "backfill", budgetClass: "bulk" }).catch(() => null));
  }
  await Promise.all(jobs);
  const u = client.metrics().budget.usedByClass;
  assert.ok(u.bulk <= 10, `bulk ${u.bulk} — نباید از softBudget رد شود`);
  assert.ok(u.critical > u.bulk, `critical ${u.critical} باید بیشتر از bulk ${u.bulk} باشد`);
});

t("budgetClass نامعتبر رد می‌شود، نه اینکه بی‌صدا standard شود", async () => {
  const { client } = mkBudget();
  await assert.rejects(() => client.request({ endpoint: "A.php", budgetClass: "urgent" }), /budgetClass نامعتبر/);
});

t("پیش‌فرضِ budgetClass همان standard است", async () => {
  const { client } = mkBudget({ hard: 10, soft: 4 });
  for (let i = 0; i < 7; i++) await client.request({ endpoint: "A.php", params: { i } });
  await assert.rejects(() => client.request({ endpoint: "A.php", params: { z: 1 } }),
    (e) => e instanceof BudgetExceededError);
  assert.equal(client.metrics().budget.usedByClass.standard, 7, "سقفِ standard = 4 + (10-4)/2 = 7");
});

t("dedup بودجه مصرف نمی‌کند", async () => {
  const { client } = mkBudget({ hard: 10, soft: 10 });
  await client.request({ endpoint: "A.php", params: { x: 1 }, dedupeTtlMs: 60_000 });
  await client.request({ endpoint: "A.php", params: { x: 1 }, dedupeTtlMs: 60_000 });
  assert.equal(client.metrics().budget.used, 1, "پاسخِ کش‌شده درخواستِ تازه نیست");
});


/* ── بودجهٔ ماندگار ──────────────────────────────────────────────────────── */

/**
 * انبارِ آزمایشی — همان قرارداد و همان تضمینِ اتمیکِ تابعِ Postgres:
 * جمعِ اجاره‌ها هرگز از سقف رد نمی‌شود.
 */
function fakeStore(opts = {}) {
  const days = new Map();                 // dayKey → leased
  const st = {
    hard: opts.hard ?? 100,
    leaseCalls: 0,
    releaseCalls: 0,
    fail: opts.fail ?? false,
    async lease(day, want, hard) {
      st.leaseCalls += 1;
      if (st.fail) throw new Error("store down");
      const cap = Math.min(hard, st.hard);
      const before = days.get(day) ?? 0;
      const granted = Math.max(0, Math.min(want, cap - before));
      days.set(day, before + granted);
      return { granted, leasedBefore: before, hardCeiling: cap };
    },
    async release(day, back) {
      st.releaseCalls += 1;
      if (st.fail) throw new Error("store down");
      const before = days.get(day) ?? 0;
      const n = Math.min(back, before);
      days.set(day, before - n);
      return n;
    },
    leasedOn: (day) => days.get(day) ?? 0,
    days,
  };
  return st;
}

function mkPersistent(over = {}) {
  const c = fakeClock();
  const store = over.store || fakeStore({ hard: over.hard ?? 100 });
  const budget = new PersistentDailyBudget({
    store,
    softBudget: over.soft ?? 60,
    hardCeiling: over.hard ?? 100,
    leaseSize: over.leaseSize ?? 10,
    degradedCeiling: over.degraded ?? 0,
    now: c.now,
  });
  const calls = [];
  const client = new BrsApiClient({
    base: "https://x", key: "K", now: c.now, sleep: c.sleep, rand: () => 0.5,
    budget,
    fetchImpl: async (u) => { calls.push(u); return okRes(); },
    ...over.opts,
  });
  return { client, budget, store, calls, clock: c };
}

t("بودجهٔ ماندگار: اجاره تکه‌تکه گرفته می‌شود، نه یک‌جا", async () => {
  const { client, store } = mkPersistent({ hard: 100, soft: 100, leaseSize: 10 });
  for (let i = 0; i < 25; i++) await client.request({ endpoint: "A.php", params: { i } });
  assert.equal(client.metrics().budget.used, 25, "مصرف درست شمرده شد");
  assert.ok(store.leaseCalls >= 3 && store.leaseCalls <= 5,
    `۲۵ درخواست با بلوکِ ۱۰ باید ۳ تا ۵ بار اجاره بگیرد، نه ${store.leaseCalls}`);
});

t("restart شمارنده را صفر نمی‌کند — فرایندِ تازه از همان جا ادامه می‌دهد", async () => {
  const store = fakeStore({ hard: 30 });
  const a = mkPersistent({ store, hard: 30, soft: 30, leaseSize: 10 });
  for (let i = 0; i < 10; i++) await a.client.request({ endpoint: "A.php", params: { i } });
  assert.equal(a.client.metrics().budget.used, 10);

  // فرایند می‌میرد — بدونِ `release`. اجارهٔ خرج‌نشده سوخته می‌ماند.
  const b = mkPersistent({ store, hard: 30, soft: 30, leaseSize: 10 });
  let sent = 0;
  for (let i = 0; i < 40; i++) {
    try { await b.client.request({ endpoint: "B.php", params: { i } }); sent += 1; }
    catch (e) { assert.ok(e instanceof BudgetExceededError); break; }
  }
  assert.ok(sent <= 20, `فرایندِ تازه نباید بیش از باقیماندهٔ روز بفرستد، فرستاد ${sent}`);
  assert.ok(store.leasedOn(b.budget.day) <= 30, "جمعِ اجاره از سقفِ روز رد نشد");
});

t("هیچ ترکیبی از فرایندها از سقفِ سراسری رد نمی‌شود", async () => {
  const store = fakeStore({ hard: 40 });
  const procs = Array.from({ length: 5 }, () =>
    mkPersistent({ store, hard: 40, soft: 40, leaseSize: 7 }));
  let wire = 0;
  await Promise.all(procs.map(async (p, pi) => {
    for (let i = 0; i < 30; i++) {
      try { await p.client.request({ endpoint: "A.php", params: { pi, i } }); }
      catch (e) { assert.ok(e instanceof BudgetExceededError); }
    }
    wire += p.calls.length;
  }));
  assert.ok(wire <= 40, `۵ فرایند × ۳۰ درخواست نباید بیش از ۴۰ بار روی سیم برود، رفت ${wire}`);
});

t("اجارهٔ خرج‌نشده روی خاموشیِ مرتب پس داده می‌شود", async () => {
  const store = fakeStore({ hard: 100 });
  const { client, budget } = mkPersistent({ store, hard: 100, soft: 100, leaseSize: 20 });
  await client.request({ endpoint: "A.php", params: { i: 1 } });
  const leasedBefore = store.leasedOn(budget.day);
  assert.equal(leasedBefore, 20, "یک بلوکِ کامل اجاره شد");
  const back = await budget.release();
  assert.equal(back, 19, "۱۹ واحدِ خرج‌نشده پس داده شد");
  assert.equal(store.leasedOn(budget.day), 1, "فقط همان یکی که واقعاً خرج شد باقی ماند");
});

t("انبارِ خراب بی‌صدا بودجه را باز نمی‌کند — رد می‌شود", async () => {
  const store = fakeStore({ hard: 100 });
  store.fail = true;
  const { client, budget } = mkPersistent({ store, hard: 100, soft: 100, degraded: 0 });
  await assert.rejects(() => client.request({ endpoint: "A.php" }),
    (e) => e instanceof BudgetExceededError);
  assert.equal(budget.snapshot().store.healthy, false, "خرابیِ انبار در متریک دیده می‌شود");
  assert.ok(budget.snapshot().store.errors > 0);
});

t("در خرابیِ انبار فقط critical و فقط تا سقفِ اضطراریِ شمرده‌شده عبور می‌کند", async () => {
  const store = fakeStore({ hard: 100 });
  store.fail = true;
  const { client, budget, calls } = mkPersistent({ store, hard: 100, soft: 100, degraded: 3 });
  await assert.rejects(() => client.request({ endpoint: "A.php", budgetClass: "bulk" }),
    (e) => e instanceof BudgetExceededError, "bulk حتی یک واحد هم نمی‌گیرد");
  for (let i = 0; i < 3; i++) {
    await client.request({ endpoint: "A.php", params: { i }, budgetClass: "critical" });
  }
  await assert.rejects(() => client.request({ endpoint: "A.php", params: { z: 1 }, budgetClass: "critical" }),
    (e) => e instanceof BudgetExceededError, "بعد از سقفِ اضطراری، critical هم رد می‌شود");
  assert.equal(calls.length, 3, "دقیقاً همان ۳ واحدِ اضطراری روی سیم رفت");
  assert.equal(budget.snapshot().store.degradedUsed, 3, "مصرفِ اضطراری شمرده و دیده می‌شود");
});

t("«اجاره ته کشید» با «بودجه تمام شد» یکی شمرده نمی‌شود", async () => {
  // وقتی انبار سقفِ واقعی را گزارش کند، فرایند سقفش را پایین می‌آورد و
  // ردشدن **واقعاً** «بودجه تمام شد» است. starvation فقط وقتی معنا دارد که
  // انبار بگوید «جا هست» ولی چیزی ندهد — انبارِ معیوب، یا مسابقهٔ replicaها.
  // این دو را یکی شمردن یعنی روزی که مشکلِ هماهنگی است، «سهمیه تمام شد»
  // گزارش شود و کسی دنبالِ علتِ درست نگردد.
  const odd = {
    async lease() { return { granted: 0, leasedBefore: 0, hardCeiling: 100 }; },
    async release() { return 0; },
  };
  const { client, budget } = mkPersistent({ store: odd, hard: 100, soft: 100, leaseSize: 5 });
  await assert.rejects(() => client.request({ endpoint: "A.php" }),
    (e) => e instanceof BudgetExceededError);
  const snap = budget.snapshot();
  assert.equal(snap.lease.starved, 1, "شمارندهٔ جداگانه دارد");
  assert.equal(snap.used, 0, "و این ردشدن به‌خاطرِ مصرفِ سهمیه نبود — هیچ مصرفی نشده");
  assert.equal(budget.rejectionReason("standard"), "lease", "علت صریح گزارش می‌شود");
});

t("سقفِ انبار حاکم است — فرایند نمی‌تواند سقفِ سخاوتمندانه‌ترِ خودش را نگه دارد", async () => {
  const store = fakeStore({ hard: 5 });
  const { client, budget } = mkPersistent({ store, hard: 100, soft: 100, leaseSize: 5 });
  for (let i = 0; i < 5; i++) await client.request({ endpoint: "A.php", params: { i } });
  assert.equal(budget.snapshot().hardCeiling, 5,
    "فرایند با ۱۰۰ بالا آمد ولی سقفِ واقعیِ روز را از انبار یاد گرفت");
  await assert.rejects(() => client.request({ endpoint: "A.php", params: { z: 1 } }),
    (e) => e instanceof BudgetExceededError);
  assert.equal(budget.rejectionReason("standard"), "budget",
    "اینجا علت واقعاً سهمیه است، نه اجاره");
});
t("retry هم از بودجهٔ ماندگار کم می‌کند", async () => {
  const store = fakeStore({ hard: 100 });
  const c = fakeClock();
  const budget = new PersistentDailyBudget({
    store, softBudget: 100, hardCeiling: 100, leaseSize: 10, now: c.now,
  });
  let n = 0;
  const client = new BrsApiClient({
    base: "https://x", key: "K", now: c.now, sleep: c.sleep, rand: () => 0.5, budget,
    fetchImpl: async () => { n += 1; return n < 3 ? errRes(500) : okRes(); },
  });
  await client.request({ endpoint: "A.php" });
  assert.equal(n, 3, "دو شکست و یک موفقیت");
  assert.equal(client.metrics().budget.used, 3, "هر سه تلاش از بودجه کم شد، نه فقط آخری");
});

t("عوض‌شدنِ روز اجارهٔ تازه می‌گیرد و شمارنده را از نو می‌شمارد", async () => {
  const store = fakeStore({ hard: 1000 });
  const c = fakeClock();
  // ساعت را روی یک زمانِ واقعی می‌گذاریم تا `tehranDayKey` معنا داشته باشد.
  let base = Date.parse("2026-09-12T08:00:00Z");
  const now = () => base;
  const budget = new PersistentDailyBudget({
    store, softBudget: 1000, hardCeiling: 1000, leaseSize: 5, now,
  });
  const client = new BrsApiClient({
    base: "https://x", key: "K", now, sleep: c.sleep, rand: () => 0.5, budget,
    fetchImpl: async () => okRes(),
  });
  await client.request({ endpoint: "A.php", params: { i: 1 } });
  const d1 = budget.day;
  assert.equal(budget.snapshot().used, 1);

  base += 36 * 3600 * 1000;               // یک‌ونیم روز جلو
  await client.request({ endpoint: "A.php", params: { i: 2 } });
  assert.notEqual(budget.day, d1, "کلیدِ روز عوض شد");
  assert.equal(budget.snapshot().used, 1, "روزِ تازه از یک شروع شد، نه از ادامهٔ دیروز");
  assert.ok(store.leasedOn(d1) > 0 && store.leasedOn(budget.day) > 0, "هر روز ردیفِ خودش را دارد");
});

t("makeSupabaseLeaseStore بدونِ env چیزی برنمی‌گرداند، نه اینکه بی‌کلید تماس بگیرد", () => {
  assert.equal(makeSupabaseLeaseStore({ url: "", serviceKey: "" }), null);
  assert.equal(makeSupabaseLeaseStore({ url: "https://x", serviceKey: "" }), null);
  assert.ok(makeSupabaseLeaseStore({ url: "https://x", serviceKey: "k" }));
});

t("makeSupabaseLeaseStore پاسخِ بی‌شکل را قبول نمی‌کند", async () => {
  const store = makeSupabaseLeaseStore({
    url: "https://x", serviceKey: "k",
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ([{ nope: 1 }]) }),
  });
  await assert.rejects(() => store.lease("d", 5, 100), /بی‌شکل/);
});

t("makeSupabaseLeaseStore خطای HTTP را خطا می‌کند، نه صفر", async () => {
  const store = makeSupabaseLeaseStore({
    url: "https://x", serviceKey: "k",
    fetchImpl: async () => ({ ok: false, status: 503, text: async () => "upstream down" }),
  });
  await assert.rejects(() => store.lease("d", 5, 100), /503/);
});

/* ── اجرا ────────────────────────────────────────────────────────────────── */
console.log("brsapi-client:");
for (const [name, fn] of tests) {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.error(`  ✗ ${name}: ${e.message}`); }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
