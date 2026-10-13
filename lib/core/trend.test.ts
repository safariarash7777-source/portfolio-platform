// تست‌های روند طلا/دلار — T8. دادهٔ مصنوعی قطعی؛ بدون شبکه.

import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDailySeries, getGoldUsdTrend } from "./trend";

function row(capturedAt: string, section: string, payload: object[]) {
  return { captured_at: capturedAt, section, payload } as Parameters<typeof extractDailySeries>[0][number];
}

test("history pagination retains recent samples despite a server row cap and separates cached windows", async () => {
  const previous = { fetch: globalThis.fetch, url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://database.example.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-key";
  const offsets: number[] = [];
  const data = [
    row("2026-07-14T16:00:00Z", "gold", [{ id: "IR_GOLD_18K", price: 30 }]),
    row("2026-07-14T09:00:00Z", "gold", [{ id: "IR_GOLD_18K", price: 20 }]),
    row("2026-07-13T09:00:00Z", "gold", [{ id: "IR_GOLD_18K", price: 10 }]),
  ];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get("order"), "captured_at.desc,section.asc");
    assert.ok(url.searchParams.get("and")?.includes("captured_at.lte."));
    assert.equal(init?.cache, "no-store");
    const offset = Number(url.searchParams.get("offset"));
    offsets.push(offset);
    return Response.json(data.slice(offset, offset + 2));
  };
  try {
    const result = await getGoldUsdTrend(180);
    assert.deepEqual(result[0].points, [{ date: "2026-07-13", price: 10 }, { date: "2026-07-14", price: 30 }]);
    assert.deepEqual(offsets, [0, 2, 3]);
    await getGoldUsdTrend(180);
    assert.equal(offsets.length, 3);
    await getGoldUsdTrend(30);
    assert.equal(offsets.length, 6, "a different window must not reuse the 180-day cache");
  } finally {
    globalThis.fetch = previous.fetch;
    if (previous.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previous.key;
  }
});

test("extractDailySeries: آخرین نمونهٔ هر روز برنده می‌شود", () => {
  const rows = [
    row("2026-07-13T08:00:00+00:00", "gold", [{ id: "IR_GOLD_18K", faName: "طلای 18 عیار", price: 18000000, unit: "toman" }]),
    row("2026-07-13T12:00:00+00:00", "gold", [{ id: "IR_GOLD_18K", faName: "طلای 18 عیار", price: 18100000, unit: "toman" }]),
    row("2026-07-14T09:00:00+00:00", "gold", [{ id: "IR_GOLD_18K", faName: "طلای 18 عیار", price: 18250000, unit: "toman" }]),
  ];
  const series = extractDailySeries(rows);
  assert.equal(series.length, 1);
  assert.equal(series[0].id, "IR_GOLD_18K");
  assert.deepEqual(series[0].points, [
    { date: "2026-07-13", price: 18100000 },
    { date: "2026-07-14", price: 18250000 },
  ]);
});

test("extractDailySeries: دلار از بخش currency جدا استخراج می‌شود", () => {
  const rows = [
    row("2026-07-13T10:00:00+00:00", "currency", [
      { id: "USD", faName: "دلار", price: 188600, unit: "toman" },
      { id: "EUR", faName: "یورو", price: 216110, unit: "toman" },
    ]),
    row("2026-07-13T10:00:00+00:00", "gold", [{ id: "IR_GOLD_18K", faName: "طلای 18 عیار", price: 18245100, unit: "toman" }]),
  ];
  const series = extractDailySeries(rows);
  assert.equal(series.length, 2);
  const usd = series.find((s) => s.id === "USD");
  assert.ok(usd);
  assert.equal(usd.faName, "دلار");
  assert.equal(usd.points[0].price, 188600);
  // یورو هدف نیست
  assert.ok(!series.some((s) => s.id === "EUR"));
});

test("extractDailySeries: قیمت نامعتبر (صفر/منفی/غایب) نادیده گرفته می‌شود", () => {
  const rows = [
    row("2026-07-13T10:00:00+00:00", "gold", [{ id: "IR_GOLD_18K", price: 0 }]),
    row("2026-07-14T10:00:00+00:00", "gold", [{ id: "IR_GOLD_18K", price: -5 }]),
    row("2026-07-15T10:00:00+00:00", "currency", [{ id: "USD" }]),
  ];
  assert.deepEqual(extractDailySeries(rows), []);
});

test("extractDailySeries: ورودی خالی → خروجی خالی (بدون عدد ساختگی)", () => {
  assert.deepEqual(extractDailySeries([]), []);
});
