import { test } from "node:test";
import assert from "node:assert/strict";
import { readWaitlistResponse } from "./waitlist-response";

test("only an explicit successful receipt confirms the consultation contact request", async () => {
  assert.deepEqual(await readWaitlistResponse(new Response(JSON.stringify({ success: true }), { status: 200 })), { ok: true });
  assert.equal((await readWaitlistResponse(new Response('{}', { status: 200 }))).ok, false);
  assert.equal((await readWaitlistResponse(new Response('upstream HTML', { status: 200 }))).ok, false);
});
test("duplicate, rate limit and server error are actionable without inventing a booking", async () => {
  for (const code of [409, 429, 500]) {
    const result = await readWaitlistResponse(new Response(JSON.stringify({ error: 'private DB detail must not appear' }), { status: code }));
    assert.equal(result.ok, false);
    if (!result.ok) { assert.doesNotMatch(result.message, /private DB/); assert.ok(result.message.length > 20); }
  }
  const duplicate = await readWaitlistResponse(new Response('{}', { status: 409 }));
  if (!duplicate.ok) assert.match(duplicate.message, /تأیید نمی‌کند/);
});
