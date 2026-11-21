import { test } from "node:test";
import assert from "node:assert/strict";
import { collectDeskReads, type DeskReaders } from "./workspace-read";

const clock = () => new Date("2026-10-17T12:00:00Z");
const healthy: DeskReaders = {
  market: async () => ({
    data: null,
    availability: {
      state: "empty",
      sourceAt: null,
      receivedAt: null,
      validAt: null,
      readAt: clock().getTime(),
    },
  }),
  chart: async () => ({
    state: "ready",
    data: [
      {
        id: "total",
        faName: "synthetic",
        points: [{ jdate: "1405/07/25", value: 100 }],
      },
    ],
    reason: null,
  }),
  reports: async () => ({
    state: "ready",
    data: [
      {
        id: "test-report",
        symbol: "TEST",
        title: "synthetic",
        category: null,
        sourceDate: null,
        sourceTime: null,
        recordedAt: null,
        url: null,
      },
    ],
    reason: null,
  }),
  research: async () => ({
    drafts: [],
    invalidCount: 2,
    unavailableReason: null,
  }),
};
for (const source of ["market", "chart", "reports", "research"] as const) {
  test(`unexpected ${source} failure does not erase other source results or become authorization failure`, async () => {
    const data = await collectDeskReads(
      {
        ...healthy,
        [source]: () => {
          throw new Error("synthetic failure");
        },
      },
      clock,
    );
    assert.equal(data.readAt, clock().toISOString());
    if (source === "market") {
      assert.equal(data.market.availability.state, "error");
      assert.equal(data.market.availability.receivedAt, null);
    } else assert.equal(data.market.availability.state, "empty");
    if (source === "chart") assert.equal(data.chart.state, "unavailable");
    else assert.equal(data.chart.data[0].points[0].value, 100);
    if (source === "reports") assert.equal(data.reports.state, "unavailable");
    else assert.equal(data.reports.data[0].id, "test-report");
    if (source === "research") assert.ok(data.research.unavailableReason);
    else assert.equal(data.research.invalidCount, 2);
  });
}
test("all source failures preserve separate unavailable states and unknown source clocks", async () => {
  const fail = async () => {
    throw new Error("synthetic");
  };
  const data = await collectDeskReads(
    { market: fail, chart: fail, reports: fail, research: fail },
    clock,
  );
  assert.equal(data.market.data, null);
  assert.equal(data.market.availability.sourceAt, null);
  assert.equal(data.market.availability.validAt, null);
  assert.equal(data.chart.state, "unavailable");
  assert.equal(data.reports.state, "unavailable");
  assert.ok(data.research.unavailableReason);
});

for (const stalled of [["chart"], ["reports"], ["chart", "reports"]] as const) {
  test(`only stalled ${stalled.join(" and ")} time out, then a new read recovers`, async t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const signals = new Map<string, AbortSignal>(), late: Array<() => void> = [];
    const calls: string[] = [];
    function section<K extends "chart" | "reports">(source: K) {
      return async (signal: AbortSignal): Promise<Awaited<ReturnType<DeskReaders[K]>>> => {
        calls.push(source);
        signals.set(source, signal);
        const result = await healthy[source](signal);
        if ((stalled as readonly string[]).includes(source)) {
          // Like an SDK body that does not settle when the transport is aborted.
          await new Promise<void>(resolve => { late.push(resolve); });
        }
        return result as Awaited<ReturnType<DeskReaders[K]>>;
      };
    }
    const request = collectDeskReads({ ...healthy, chart: section("chart"), reports: section("reports") }, clock);
    // Flush the healthy siblings through Promise.race/finally first.
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.deepEqual(calls, ["chart", "reports"]);
    assert.notEqual(signals.get("chart"), signals.get("reports"), "no shared abort controller");
    let settled = false;
    void request.then(() => { settled = true; });
    t.mock.timers.tick(3999);
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(settled, false);
    t.mock.timers.tick(1);
    const page = await request;
    assert.equal(page.readAt, clock().toISOString());
    assert.equal(page.market.availability.state, "empty");
    assert.equal(page.market.availability.validAt, null);
    assert.equal(page.research.invalidCount, 2);
    for (const source of ["chart", "reports"] as const) {
      const timedOut = (stalled as readonly string[]).includes(source);
      assert.equal(signals.get(source)?.aborted, timedOut);
      assert.equal(page[source].state, timedOut ? "unavailable" : "ready");
      if (timedOut) {
        assert.match(page[source].reason ?? "", /در مهلت مقرر کامل نشد/);
        assert.deepEqual(page[source].data, []);
      }
    }
    assert.equal(calls.length, 2, "no retries");
    late.forEach(release => release());
    const refreshed = await collectDeskReads(healthy, clock);
    assert.equal(refreshed.chart.state, "ready");
    assert.equal(refreshed.reports.state, "ready");
    for (const source of stalled) assert.equal(page[source].state, "unavailable");
  });
}
