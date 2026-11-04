import test from "node:test";
import assert from "node:assert/strict";
import { filterMediaByRecordedPeriod, patchArchiveHash, recordedPeriodFrom } from "./archive-filters";

// Synthetic fixtures only; no live feed, account data or market timestamps.
const now = Date.parse("2026-11-03T12:00:00Z");
const row = (id: string, published_at: string | null) => ({ id, published_at });

test("rolling period includes both bounds and normalizes explicit timezones", () => {
  const items = [
    row("start", "2026-10-27T12:00:00Z"),
    row("same-start-offset", "2026-10-27T15:30:00+03:30"),
    row("before", "2026-10-27T11:59:59.999Z"),
    row("end", "2026-11-03T12:00:00Z"),
    row("future", "2026-11-03T12:00:00.001Z"),
  ];
  assert.deepEqual(filterMediaByRecordedPeriod(items, "7d", now).map(r => r.id), ["start", "same-start-offset", "end"]);
});

test("30 and 90 days have their own inclusive lower bound", () => {
  const items = [row("30", "2026-10-04T12:00:00Z"), row("90", "2026-08-05T12:00:00Z"), row("91", "2026-08-04T12:00:00Z")];
  assert.deepEqual(filterMediaByRecordedPeriod(items, "30d", now).map(r => r.id), ["30"]);
  assert.deepEqual(filterMediaByRecordedPeriod(items, "90d", now).map(r => r.id), ["30", "90"]);
});

test("missing, impossible and timezone-less dates stay unknown; epoch zero is valid", () => {
  const items = [row("missing", null), row("empty", ""), row("impossible", "2026-02-30T00:00:00Z"), row("no-zone", "2026-11-03T12:00:00"), row("epoch", "1970-01-01T00:00:00Z")];
  assert.deepEqual(filterMediaByRecordedPeriod(items, "unknown", now).map(r => r.id), ["missing", "empty", "impossible", "no-zone"]);
  assert.deepEqual(filterMediaByRecordedPeriod(items, "7d", now), []);
  assert.deepEqual(filterMediaByRecordedPeriod(items, "7d", 0).map(r => r.id), ["epoch"]);
  assert.deepEqual(filterMediaByRecordedPeriod(items, "7d", NaN), []);
});

test("all periods operate on the loaded subset without mutation, fabricated items or sorting", () => {
  const a = Object.freeze(row("one", null));
  const b = Object.freeze(row("two", "2026-11-03T12:00:00Z"));
  const items = Object.freeze([a, b]);
  const all = filterMediaByRecordedPeriod(items, "all", now);
  assert.deepEqual(all, [a, b]);
  assert.notEqual(all, items);
  assert.equal(filterMediaByRecordedPeriod(items, "7d", now)[0], b);
  assert.deepEqual(items, [a, b]);
});

test("hash edits and clearing preserve unrelated layout, anchor and unknown parameters", () => {
  const hash = "#layout=3&anchor=card-12&future=keep&q=gold&network=telegram&kind=post";
  const updated = patchArchiveHash(hash, { period: "30d" });
  const params = new URLSearchParams(updated);
  assert.equal(params.get("layout"), "3");
  assert.equal(params.get("anchor"), "card-12");
  assert.equal(params.get("future"), "keep");
  assert.equal(params.get("q"), "gold");
  assert.equal(recordedPeriodFrom(params.get("period")), "30d");
  const cleared = new URLSearchParams(patchArchiveHash(updated, { network: "all", kind: "all", q: "", period: "all" }));
  assert.deepEqual([...cleared], [["layout", "3"], ["anchor", "card-12"], ["future", "keep"]]);
  assert.equal(recordedPeriodFrom("invented"), "all");
  assert.equal(recordedPeriodFrom(null), "all");
});
