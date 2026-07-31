import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DESK_SECTIONS,
  DESK_SECTION_LABEL,
  briefPublishBlockReason,
  buildDeskView,
  buildPanel,
  canPublishBrief,
  classifyPanel,
  deskAgeMinutes,
  rollupDeskState,
  type DeskPanel,
  type PanelSpec,
} from "@/lib/desk/contracts";

const NOW = new Date("2026-07-31T12:00:00Z");
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();
const RULE = { okWithinMinutes: 60, staleWithinMinutes: 24 * 60 };

test("every declared section has a label", () => {
  assert.equal(DESK_SECTIONS.length, 5);
  for (const key of DESK_SECTIONS) {
    assert.ok(DESK_SECTION_LABEL[key], `${key} has no label`);
  }
});

// The whole reason this module exists: an unavailable source and an empty
// source must never collapse into the same state.
test("unavailable and empty are distinct states, never merged", () => {
  const unavailable = classifyPanel({ available: false, count: 0 }, RULE, NOW);
  const empty = classifyPanel({ available: true, count: 0 }, RULE, NOW);
  assert.equal(unavailable.state, "unavailable");
  assert.equal(empty.state, "empty");
  assert.notEqual(unavailable.state, empty.state);
  assert.match(empty.detail, /خالی|صفر|هیچ رکورد/);
});

test("an unavailable panel keeps its stated reason", () => {
  const result = classifyPanel(
    { available: false, count: 0, unavailableReason: "جدول اجرا نشده" },
    RULE,
    NOW
  );
  assert.equal(result.detail, "جدول اجرا نشده");
});

test("freshness splits ready from stale, and age is reported either way", () => {
  const fresh = classifyPanel({ available: true, count: 3, lastAt: ago(10) }, RULE, NOW);
  const old = classifyPanel({ available: true, count: 3, lastAt: ago(600) }, RULE, NOW);
  assert.equal(fresh.state, "ready");
  assert.equal(fresh.ageMinutes, 10);
  assert.equal(old.state, "stale");
  assert.equal(old.ageMinutes, 600);
});

test("a section with records but no time dimension is ready, not stale", () => {
  const result = classifyPanel({ available: true, count: 4 }, null, NOW);
  assert.equal(result.state, "ready");
  assert.equal(result.ageMinutes, null);
});

test("a future timestamp is clamped to zero rather than reported as negative", () => {
  assert.equal(deskAgeMinutes(new Date(NOW.getTime() + 60_000), NOW), 0);
  assert.equal(deskAgeMinutes(null, NOW), null);
  assert.equal(deskAgeMinutes("not a date", NOW), null);
});

// Deliberately not the intuitive order: empty outranks stale because stale data
// existed at least once, and unavailable outranks both because it says nothing
// about reality at all.
test("rollup takes the worst state, ranking unavailable above empty above stale", () => {
  const panel = (state: DeskPanel["state"]): DeskPanel => ({
    key: "today", label: "x", state, detail: "", sources: [], metrics: [], ageMinutes: null,
  });
  assert.equal(rollupDeskState([panel("ready"), panel("stale")]), "stale");
  assert.equal(rollupDeskState([panel("stale"), panel("empty")]), "empty");
  assert.equal(rollupDeskState([panel("empty"), panel("unavailable")]), "unavailable");
  assert.equal(rollupDeskState([panel("ready"), panel("ready")]), "ready");
  assert.equal(rollupDeskState([]), "unavailable");
});

test("an unavailable panel shows no metrics that could be mistaken for data", () => {
  const spec: PanelSpec = {
    key: "reference",
    sources: ["intel_reference_positions"],
    rule: null,
    metrics: [{ key: "weight", label: "وزن", value: "۴۵٪" }],
  };
  const unavailable = buildPanel(spec, { available: false, count: 0 }, NOW);
  const ready = buildPanel(spec, { available: true, count: 1 }, NOW);
  assert.deepEqual(unavailable.metrics, []);
  assert.equal(ready.metrics.length, 1);
});

test("every panel names the existing asset it reads from", () => {
  const spec: PanelSpec = {
    key: "today",
    sources: ["ir_market_snapshots", "fx_rates"],
    rule: RULE,
    metrics: [],
  };
  const panel = buildPanel(spec, { available: true, count: 2, lastAt: ago(5) }, NOW);
  assert.deepEqual(panel.sources, ["ir_market_snapshots", "fx_rates"]);
  assert.ok(panel.detail.length > 0, "a ready panel still explains itself");
});

test("the view stamps its own generation time and rolls up its panels", () => {
  const panels: DeskPanel[] = [
    { key: "today", label: "a", state: "ready", detail: "", sources: [], metrics: [], ageMinutes: 1 },
    { key: "reference", label: "b", state: "unavailable", detail: "", sources: [], metrics: [], ageMinutes: null },
  ];
  const view = buildDeskView(panels, NOW);
  assert.equal(view.generatedAt, NOW.toISOString());
  assert.equal(view.overall, "unavailable");
  assert.equal(view.panels.length, 2);
});

// DD-023 lives here rather than in the UI so a future page cannot route around it.
test("a brief never publishes straight from internal draft", () => {
  assert.equal(canPublishBrief("internal_draft", true), false);
  assert.equal(canPublishBrief("pending_approval", true), true);
  assert.equal(canPublishBrief("pending_approval", false), false);
  assert.equal(canPublishBrief("published", true), false);
});

test("the publish block always states a reason a human can act on", () => {
  assert.match(briefPublishBlockReason("internal_draft", true) ?? "", /تأیید/);
  assert.match(briefPublishBlockReason("pending_approval", false) ?? "", /ادمین/);
  assert.equal(briefPublishBlockReason("pending_approval", true), null);
});
