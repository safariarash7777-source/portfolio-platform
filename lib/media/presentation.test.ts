import { test } from "node:test";
import assert from "node:assert/strict";
import { appearanceFrom, sourceUrl, uniqueMedia } from "./presentation";
test("appearance accepts only three layouts and bounded identifiers, without access fields", () => {
  assert.deepEqual(appearanceFrom({ layout: 900, covers: "https://evil.test", role: "admin", featured: ["a", "a", 12, "b".repeat(200)] }), { layout: 1, covers: "editorial", featured: ["a"] });
  assert.equal(appearanceFrom(null).layout, 1);
  assert.equal(appearanceFrom({ layout: 3 }).layout, 3);
});
test("source links reject active content, host spoofing and private Telegram invites", () => {
  for (const url of ["javascript:alert(1)", "https://instagram.com.evil.test/x", "https://x.com@evil.test", "https://t.me/+invite", "https://t.me/c/123/4", "https://t.me/joinchat/private", "http://t.me/arash/1"]) assert.equal(sourceUrl(url), null);
  assert.equal(sourceUrl("https://www.instagram.com/reel/one/?stkn=tracking"), "https://www.instagram.com/reel/one/");
});
test("repeated content is shown once without deleting source records", () => {
  const item = { id: "one", platform: "telegram" as const, kind: "post" as const, content_url: "https://t.me/public/1", title: "Public", description: null, published_at: null };
  const list = [item, { ...item, id: "two", content_url: "https://t.me/public/1?tracking=yes" }];
  assert.equal(uniqueMedia(list).length, 1);
  assert.equal(list.length, 2);
});
