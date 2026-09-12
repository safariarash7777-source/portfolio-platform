/**
 * دو نوع تست، برای دو نوع شکست:
 *
 * ۱. **رفتاری** — وقتی بودجه رد می‌کند، آیا درخواست واقعاً فرستاده نمی‌شود؟
 *    (اگر شمارنده *بعد از* `fetch` صدا زده شود این تست می‌افتد.)
 * ۲. **ساختاری** — آیا نقطهٔ تماسِ تازه‌ای بدونِ شمارنده اضافه شده؟
 *    فهرستِ زیر قرارداد است: هر endpointِ BrsApi در `relay/` باید اینجا باشد.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { setBrsapiMeter, meterBrsapi, brsapiMeterSnapshot, resetBrsapiMeterForTest } from "./brsapi-meter.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

/* ── ۱. قلاب ───────────────────────────────────────────────────────────────── */

test("بی‌قلاب: مصرف نامرئی نمی‌ماند، شمرده می‌شود", async () => {
  resetBrsapiMeterForTest();
  await meterBrsapi("x", "bulk");
  await meterBrsapi("x", "bulk");
  const s = brsapiMeterSnapshot();
  assert.equal(s.hooked, false);
  assert.equal(s.unregistered.x, 2);
});

test("با قلاب: producer و طبقه عیناً منتقل می‌شوند و خطا عبور می‌کند", async () => {
  resetBrsapiMeterForTest();
  const seen = [];
  setBrsapiMeter(async (p, c) => { seen.push([p, c]); if (p === "boom") throw new Error("budget"); });
  await meterBrsapi("ok", "critical");
  assert.deepEqual(seen, [["ok", "critical"]]);
  await assert.rejects(() => meterBrsapi("boom", "bulk"), /budget/);
  assert.equal(brsapiMeterSnapshot().unregistered.ok, undefined);
  resetBrsapiMeterForTest();
});

/* ── ۲. رفتار: رد‌شدن یعنی «فرستاده نشد»، نه «فرستاده شد و بعد شمرده شد» ──── */

/** `fetch` را می‌گیرد و می‌شمارد چند بار واقعاً صدا زده شد. */
function trapFetch() {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    return { ok: true, status: 200, async json() { return []; }, async text() { return "[]"; } };
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

test("آپشن: بودجهٔ رد‌کننده یعنی هیچ درخواستی به upstream نمی‌رود", async () => {
  const { fetchOptions, optionsStatus } = await import("./options.mjs");
  const f = trapFetch();
  try {
    resetBrsapiMeterForTest();
    setBrsapiMeter(async () => { throw new Error("daily budget exhausted"); });
    const out = await fetchOptions("https://example.invalid", "k");
    assert.deepEqual(out, []);
    assert.equal(f.calls.length, 0, "درخواست نباید فرستاده می‌شد");
    assert.match(String(optionsStatus.error), /budget/);
  } finally { f.restore(); resetBrsapiMeterForTest(); }
});

test("آپشن: بودجهٔ پذیرنده یعنی دقیقاً یک درخواست، با طبقهٔ standard", async () => {
  const { fetchOptions } = await import("./options.mjs");
  const f = trapFetch();
  const seen = [];
  try {
    resetBrsapiMeterForTest();
    setBrsapiMeter(async (p, c) => { seen.push([p, c]); });
    await fetchOptions("https://example.invalid", "k");
    assert.equal(f.calls.length, 1);
    assert.deepEqual(seen, [["options", "standard"]]);
  } finally { f.restore(); resetBrsapiMeterForTest(); }
});

test("کدال: هر تلاش — از جمله تلاشِ دوم — یک واحد می‌خورد", async () => {
  const { fetchAnnouncementsPage } = await import("./codal.mjs");
  const f = trapFetch();
  const seen = [];
  try {
    resetBrsapiMeterForTest();
    setBrsapiMeter(async (p, c) => { seen.push([p, c]); });
    await fetchAnnouncementsPage({ l18: "فولاد", producer: "codal-engine" });
    await fetchAnnouncementsPage({ l18: "فولاد", producer: "codal-engine" }); // همان retry
    assert.equal(f.calls.length, 2);
    assert.deepEqual(seen, [["codal-engine", "bulk"], ["codal-engine", "bulk"]]);
  } finally { f.restore(); resetBrsapiMeterForTest(); }
});

test("کدال: رد‌شدنِ بودجه پیش از fetch اتفاق می‌افتد", async () => {
  const { fetchAnnouncementsPage } = await import("./codal.mjs");
  const f = trapFetch();
  try {
    resetBrsapiMeterForTest();
    setBrsapiMeter(async () => { throw new Error("daily budget exhausted"); });
    await assert.rejects(() => fetchAnnouncementsPage({ l18: "فولاد" }), /budget/);
    assert.equal(f.calls.length, 0);
  } finally { f.restore(); resetBrsapiMeterForTest(); }
});

/* ── ۳. ساختار: فهرستِ نقاط تماس قرارداد است ──────────────────────────────── */

/**
 * هر endpointِ BrsApi در `relay/`، با فایلش. اگر نقطهٔ تازه‌ای اضافه شود و
 * اینجا نیاید، تست می‌افتد — همان چیزی که «۷ از ۱۲» را ساخته بود.
 *
 * `metered: false` فقط یک‌جا مجاز است و دلیلش نوشته شده.
 */
const INVENTORY = [
  { file: "server.mjs",           endpoint: "Market/Gold_Currency.php", metered: true },
  { file: "server.mjs",           endpoint: "Tsetmc/AllSymbols.php",    metered: true },
  { file: "server.mjs",           endpoint: "Tsetmc/Nav.php",           metered: true },
  { file: "server.mjs",           endpoint: "Tsetmc/Symbol.php",        metered: true },
  { file: "server.mjs",           endpoint: "Tsetmc/Index.php",         metered: true },
  { file: "symbol-detail.mjs",    endpoint: "Tsetmc/Symbol.php",        metered: true },
  { file: "options.mjs",          endpoint: "Tsetmc/Option.php",        metered: true },
  { file: "candle-backfill.mjs",  endpoint: "Tsetmc/Candlestick.php",   metered: true },
  { file: "codal.mjs",            endpoint: "Codal/Announcement.php",   metered: true },
  { file: "ime.mjs",              endpoint: "IME/Certificate.php",      metered: true },
  { file: "ime.mjs",              endpoint: "IME/Physical.php",         metered: true },
  // کلیدِ جدا (`BRSAPI_COMMODITY_KEY`) و سهمیهٔ جدا (~۱۵۰۰/روز) — بردنش به
  // بودجهٔ کلیدِ اصلی عدد را **غلط** می‌کند، نه دقیق‌تر. شمارندهٔ روزانهٔ
  // خودش (`commodityStatus().reqToday`) مشاهده‌پذیری را تأمین می‌کند.
  { file: "commodity.mjs",        endpoint: "Market/Commodity.php",     metered: false },
];

const ENDPOINT_RE = /\b(Tsetmc|Market|Codal|IME)\/[A-Za-z_]+\.php/g;
const METER_RE = /countLegacy\(|meterBrsapi\(|\.request\(\{/;

function relayFiles() {
  return readdirSync(HERE)
    .filter((f) => f.endsWith(".mjs") && !f.includes(".test."))
    .filter((f) => !["brsapi-meter.mjs", "brsapi-legacy-meter.mjs", "brsapi-budget-store.mjs", "brsapi-client.mjs"].includes(f));
}

test("هیچ نقطهٔ تماسِ ثبت‌نشده‌ای در relay/ نمانده", () => {
  const found = new Set();
  for (const f of relayFiles()) {
    const src = readFileSync(join(HERE, f), "utf8");
    // فقط خطوطی که واقعاً URL می‌سازند — نه کامنت‌ها و نه نگاشتِ endpoint.
    for (const line of src.split("\n")) {
      if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) continue;
      if (!line.includes("${") && !line.includes("fetch(")) continue;
      for (const m of line.matchAll(ENDPOINT_RE)) found.add(`${f}::${m[0]}`);
    }
  }
  const declared = new Set(INVENTORY.map((i) => `${i.file}::${i.endpoint}`));
  const undeclared = [...found].filter((k) => !declared.has(k));
  assert.deepEqual(undeclared, [], `نقطهٔ تماسِ تازه بدونِ ثبت در INVENTORY: ${undeclared.join(", ")}`);
});

test("هر نقطهٔ تماسِ ثبت‌شده، در همان فایل شمارنده دارد", () => {
  for (const item of INVENTORY) {
    const src = readFileSync(join(HERE, item.file), "utf8");
    const hasMeter = METER_RE.test(src);
    assert.equal(
      hasMeter, item.metered,
      `${item.file} (${item.endpoint}): انتظارِ metered=${item.metered} بود`,
    );
  }
});
