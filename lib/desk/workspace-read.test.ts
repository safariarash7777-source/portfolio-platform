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
