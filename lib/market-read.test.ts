import { test } from "node:test";
import assert from "node:assert/strict";
import { getIndexTrendState } from "./core/indexTrend";
import { getGoldUsdTrendState } from "./core/trend";
import { getFlowTrendState } from "./core/breadthTrend";

test("خواننده‌های روند: خطای منبع با آرایهٔ سالم خالی فرق دارد؛ بدون شبکه", async () => {
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://fixture.invalid";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-test-fixture";
  try {
    for (const reader of [getIndexTrendState, getGoldUsdTrendState, getFlowTrendState]) {
      const fail = await reader(90, async () => new Response(null, { status: 503 }) as never);
      assert.equal(fail.status, "error"); assert.equal(fail.data, null);
      const empty = await reader(90, async () => Response.json([]) as never);
      assert.equal(empty.status, "empty"); assert.equal(empty.data, null);
      const malformed = await reader(90, async () => Response.json({ unexpected: true }) as never);
      assert.equal(malformed.status, "error");
    }
    const index = await getIndexTrendState(90, async () => Response.json([{ jdate: "1405/07/08", total_index: 3_000_000, equal_weight_index: null }]) as never);
    assert.equal(index.status, "ready");
    if (index.status === "ready") assert.equal(index.data[0].points[0].value, 3_000_000);
  } finally {
    if (oldUrl == null) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    if (oldKey == null) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = oldKey;
  }
});
