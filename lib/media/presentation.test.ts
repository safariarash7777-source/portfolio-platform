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

test("Telegram dedupe normalizes channel case and trailing slash without merging case-sensitive post IDs", () => {
  const item = { id: "one", platform: "telegram" as const, kind: "post" as const, title: null, description: null, published_at: null, content_url: "https://t.me/Public_Channel/123" };
  const rows = [item, { ...item, id: "two", content_url: "https://t.me/public_channel/123/" }, { ...item, id: "three", content_url: "https://t.me/PUBLIC_CHANNEL/123/?track=1" }];
  assert.equal(uniqueMedia(rows).length, 1);
  assert.equal(rows.length, 3);
  const instagram = { ...item, platform: "instagram" as const };
  assert.equal(uniqueMedia([{ ...instagram, content_url: "https://www.instagram.com/p/CaseID/" }, { ...instagram, id: "different", content_url: "https://www.instagram.com/p/caseid/" }]).length, 2);
});

test("public Twitter aliases retain path case and deduplicate to X while rejecting spoofed hosts and private Telegram", () => {
  assert.equal(sourceUrl("https://twitter.com/Person/status/AbC?tracking=1"), "https://x.com/Person/status/AbC");
  assert.equal(sourceUrl("https://www.twitter.com/Person/status/AbC"), "https://x.com/Person/status/AbC");
  assert.equal(sourceUrl("https://www.x.com/Person/status/AbC"), "https://x.com/Person/status/AbC");
  const item = { id: "one", platform: "twitter" as const, kind: "post" as const, title: null, description: null, published_at: null, content_url: "https://twitter.com/Person/status/AbC" };
  assert.equal(uniqueMedia([item, { ...item, id: "two", content_url: "https://x.com/Person/status/AbC/" }]).length, 1);
  for (const url of ["https://twitter.com.evil.test/u/1", "https://twitter.com@evil.test/u/1", "https://t.me/C/123/456", "https://t.me/JoinChat/private", "https://t.me/+invite"]) assert.equal(sourceUrl(url), null);
});
