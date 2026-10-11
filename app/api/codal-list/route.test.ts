import { test } from "node:test";
import assert from "node:assert/strict";
import { GET } from "./route";

test("announcement list reads feed metadata, including unparsed notices, without fetching financial reports or relay", async () => {
  const previous = { fetch: globalThis.fetch, url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://database.example.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-key";
  const requests: URL[] = [];
  globalThis.fetch = async (input) => {
    requests.push(new URL(String(input)));
    return Response.json([
      { id: 5, title: "شفاف‌سازی دریافت‌شده", report_code: "ن-۲۰", sent_date: "۱۴۰۵/۰۷/۱۹", sent_time: "۱۱:۰۴:۳۷", link: "https://codal.ir/notice-a" },
      { id: 6, title: "تکرار همان اطلاعیه", link: "https://codal.ir/notice-a" },
      { id: 7, title: "اطلاعیه بدون زمان ارسال", sent_date: null, publish_date: "۱۴۰۵/۰۴/۳۱", link: "https://codal.ir/notice-b" },
    ]);
  };
  try {
    const response = await GET(new Request("https://site.example.test/api/codal-list?symbol=" + encodeURIComponent("نماد")));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].pathname, "/rest/v1/codal_feed");
    assert.equal(requests[0].searchParams.get("symbol"), "eq.نماد");
    assert.equal(requests[0].searchParams.get("order"), "sent_date.desc.nullslast,sent_time.desc.nullslast,id.desc");
    assert.doesNotMatch(requests[0].searchParams.get("select")!, /(?:^|,)(raw|data|publish_date)(?:,|$)/);
    assert.equal(body.source, "codal_feed");
    assert.equal(body.coverage, "stored-announcements");
    assert.equal(body.data.length, 2);
    assert.equal(body.data[0].kind, "ن-۲۰");
    assert.equal(body.data[0].dateKind, "sent");
    assert.equal(body.data[1].date, null, "reporting period must not masquerade as source time");
  } finally {
    globalThis.fetch = previous.fetch;
    if (previous.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previous.key;
  }
});

test("missing symbol is rejected before DB or provider access", async () => {
  assert.equal((await GET(new Request("https://site.example.test/api/codal-list"))).status, 400);
});
