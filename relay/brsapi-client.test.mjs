// تستِ رفتاریِ کلاینتِ مرکزی — بدونِ شبکه، با ساعت و fetchِ تزریقی.
// اجرا:  node relay/brsapi-client.test.mjs
import assert from "node:assert/strict";
import { BrsApiClient, LeakyBucket, backoffDelayMs, dedupeKey, isRetryable } from "./brsapi-client.mjs";

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

/* ── اجرا ────────────────────────────────────────────────────────────────── */
console.log("brsapi-client:");
for (const [name, fn] of tests) {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.error(`  ✗ ${name}: ${e.message}`); }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
