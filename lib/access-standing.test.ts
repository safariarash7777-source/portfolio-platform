// تستِ تفکیکِ «منقضی» از «هیچ‌وقت نداشته» — و از «ندیدیم».
//
// این سه حالت تا امروز همه `registered` با `via: null` بودند، یعنی UI هیچ
// راهی برای تفکیکشان نداشت و به هر سه یک پیام می‌داد.
import { strict as assert } from "node:assert";
import test from "node:test";
import { __standingOf as standingOf } from "./access";

const NOW = "2026-09-12T12:00:00.000Z";
const row = (o: Partial<{ expires_at: string; revoked_at: string | null; starts_at: string }> = {}) => ({
  expires_at: "2026-01-01T00:00:00.000Z",
  revoked_at: null,
  starts_at: "2025-01-01T00:00:00.000Z",
  ...o,
});

/** کلاینتِ آزمایشی با همان زنجیرهٔ فراخوانیِ Supabase. */
function fakeClient(result: { data: unknown[] | null; error: unknown }) {
  const chain = {
    select: () => chain, eq: () => chain, order: () => chain,
    limit: () => Promise.resolve(result),
  };
  return { from: () => chain } as unknown as Parameters<typeof standingOf>[0];
}

test("هیچ ردیفی نیست → never", async () => {
  const r = await standingOf(fakeClient({ data: [], error: null }), "u1", NOW);
  assert.equal(r.standing, "never");
  assert.equal(r.standingSince, null);
});

test("ردیفِ گذشته → expired، با تاریخِ آخرین انقضا", async () => {
  const r = await standingOf(fakeClient({
    data: [row({ expires_at: "2026-08-01T00:00:00.000Z" }), row({ expires_at: "2026-03-01T00:00:00.000Z" })],
    error: null,
  }), "u1", NOW);
  assert.equal(r.standing, "expired");
  assert.equal(r.standingSince, "2026-08-01T00:00:00.000Z", "آخرین انقضا، نه اولین");
});

test("همهٔ ردیف‌ها لغو شده → revoked، نه expired", async () => {
  // لغو یک **تصمیم** است و انقضا یک اتفاقِ تقویمی. پیامِ کاربر باید فرق کند.
  const r = await standingOf(fakeClient({
    data: [row({ revoked_at: "2026-05-05T00:00:00.000Z" }), row({ revoked_at: "2026-07-07T00:00:00.000Z" })],
    error: null,
  }), "u1", NOW);
  assert.equal(r.standing, "revoked");
  assert.equal(r.standingSince, "2026-07-07T00:00:00.000Z");
});

test("ردیفِ لغوشده در کنارِ ردیفِ منقضیِ سالم → expired", async () => {
  // فقط وقتی **همه** لغو شده‌اند، وضعیت «لغو» است.
  const r = await standingOf(fakeClient({
    data: [row({ revoked_at: "2026-05-05T00:00:00.000Z" }), row({ expires_at: "2026-06-06T00:00:00.000Z" })],
    error: null,
  }), "u1", NOW);
  assert.equal(r.standing, "expired");
  assert.equal(r.standingSince, "2026-06-06T00:00:00.000Z");
});

test("تاریخِ شروعِ آینده → scheduled، نه never و نه expired", async () => {
  const r = await standingOf(fakeClient({
    data: [row({ starts_at: "2026-10-01T00:00:00.000Z", expires_at: "2027-01-01T00:00:00.000Z" })],
    error: null,
  }), "u1", NOW);
  assert.equal(r.standing, "scheduled");
  assert.equal(r.standingSince, "2026-10-01T00:00:00.000Z");
});

test("خطای خواندن → null، نه never", async () => {
  // مهم‌ترین تستِ این فایل. اگر خطا را «هیچ‌وقت نداشته» بگیریم، روزی که
  // خواندن می‌شکند به هر مشترکِ واقعی می‌گوییم شما هرگز دسترسی نداشتید.
  const r = await standingOf(fakeClient({ data: null, error: { message: "boom" } }), "u1", NOW);
  assert.equal(r.standing, null, "«ندیدیم» با «نبود» یکی نیست");
  assert.equal(r.standingSince, null);
});

test("خطا حتی وقتی data آرایهٔ خالی است → باز هم null", async () => {
  const r = await standingOf(fakeClient({ data: [], error: { message: "rls" } }), "u1", NOW);
  assert.equal(r.standing, null);
});
