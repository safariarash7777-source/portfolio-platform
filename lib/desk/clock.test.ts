import { test } from "node:test";
import assert from "node:assert/strict";
import { classifySource, type DeskSource } from "@/lib/desk/contracts";
import { UNKNOWN_TIME, clockTime, relativeAge, sourceClocks } from "@/lib/desk/clock";

const NOW = new Date("2026-08-24T09:00:00.000Z");
const ago = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

test("age is spoken at a scale a human can judge a feed by", () => {
  assert.equal(relativeAge(0), "همین حالا");
  assert.equal(relativeAge(12), "۱۲ دقیقه پیش");
  assert.equal(relativeAge(59), "۵۹ دقیقه پیش");
  assert.equal(relativeAge(60), "۱ ساعت پیش");
  assert.equal(relativeAge(1439), "۲۳ ساعت پیش");
  assert.equal(relativeAge(1440), "۱ روز پیش");
  assert.equal(relativeAge(4320), "۳ روز پیش");
});

/**
 * قاعدهٔ اصلیِ این ماژول. اگر `null` روزی «همین حالا» یا «۰ دقیقه» شود، یک
 * منبعِ بی‌زمان تازه‌ترین منبعِ میز به‌نظر می‌رسد.
 */
test("an unknown age says so and never collapses to zero or now", () => {
  assert.equal(relativeAge(null), UNKNOWN_TIME);
  assert.equal(relativeAge(Number.NaN), UNKNOWN_TIME);
  assert.notEqual(relativeAge(null), relativeAge(0));
});

test("an unreadable timestamp is unknown, not the epoch and not today", () => {
  assert.equal(clockTime(null), UNKNOWN_TIME);
  assert.equal(clockTime("not-a-date"), UNKNOWN_TIME);
  assert.equal(clockTime(""), UNKNOWN_TIME);
});

test("the wall clock is Tehran's, so the number means one thing", () => {
  // ۰۹:۰۰ UTC = ۱۲:۳۰ تهران (‎+03:30).
  assert.equal(clockTime("2026-08-24T09:00:00.000Z"), "۱۲:۳۰");
});

/**
 * ── سختِ‌ترین ادعای این فایل ─────────────────────────────────────────────
 * منبعی که هیچ زمانی نداده، **نباید** ساعتِ خواندنِ ما را به‌عنوانِ زمانِ
 * داده‌اش نشان دهد. این دقیقاً همان خطایی است که یک مهرِ زمانیِ سراسری
 * مرتکب می‌شود، فقط در مقیاسِ یک ردیف.
 */
test("a source with no time of its own never borrows the time we asked at", () => {
  const spec = { table: "entitlements", label: "دسترسی", rule: null };
  const source = classifySource(spec, { available: true, count: 7 }, NOW);
  const clocks = sourceClocks(source);

  assert.equal(clocks.observedValue, UNKNOWN_TIME);
  assert.notEqual(clocks.observedValue, clocks.fetchedValue);
  // و ساعتِ خواندن همچنان واقعی است — «نمی‌دانیم» فقط دربارهٔ خودِ داده است.
  assert.equal(clocks.fetchedValue, "۱۲:۳۰");
});

test("a source with a real time reports that time, not ours", () => {
  const spec = { table: "fx_rates", label: "ارز", rule: { freshWithinMinutes: 1560 } };
  const source = classifySource(spec, { available: true, count: 3, lastAt: ago(95) }, NOW);
  const clocks = sourceClocks(source);
  assert.equal(clocks.observedValue, "۱ ساعت پیش");
  assert.equal(source.observedAt, ago(95));
});

/** دو زمان دو برچسبِ متفاوت دارند، وگرنه خواننده یکی را جای دیگری می‌خوانَد. */
test("the two clocks are labelled apart and never merged into one phrase", () => {
  const source: DeskSource = {
    key: "t", table: "t", label: "l", state: "ready", detail: "",
    count: 1, ageMinutes: 5, observedAt: ago(5), fetchedAt: NOW.toISOString(),
  };
  const clocks = sourceClocks(source);
  assert.notEqual(clocks.observedLabel, clocks.fetchedLabel);
  assert.ok(clocks.observedLabel.length > 0 && clocks.fetchedLabel.length > 0);
});
