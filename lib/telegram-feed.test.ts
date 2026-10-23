import { test } from "node:test";
import assert from "node:assert/strict";
import { datedFeedPosts, freshFeedPosts, parseChannelFeed, sourcePublishedAt } from "@/lib/telegram-feed";

test("Telegram publication time requires a real date and explicit timezone", () => {
  assert.equal(sourcePublishedAt("2026-10-17T12:34:56+03:30"), "2026-10-17T09:04:56.000Z");
  assert.equal(sourcePublishedAt("2026-10-17T12:34:56Z"), "2026-10-17T12:34:56.000Z");
  for (const value of [null, "2026-10-17T12:34:56", "2026-02-31T12:34:56Z", "2026-10-17T25:00:00Z"]) {
    assert.equal(sourcePublishedAt(value), null);
  }
});

test("a feed without a source time stays undated after parsing", () => {
  const html = `
    <div data-post="publicchannel/10"><time datetime="2026-10-17T12:34:56+03:30"></time>
      <div class="tgme_widget_message_text">dated</div></div>
    <div data-post="publicchannel/11"><div class="tgme_widget_message_text">undated</div></div>`;
  const posts = parseChannelFeed(html, "publicchannel");
  assert.equal(posts.length, 2);
  assert.equal(sourcePublishedAt(posts[0].publishedAt), "2026-10-17T09:04:56.000Z");
  assert.equal(sourcePublishedAt(posts[1].publishedAt), null);
  const planned = datedFeedPosts(posts);
  assert.equal(planned.skippedUndated, 1);
  assert.deepEqual(planned.eligible.map((post) => post.url), ["https://t.me/publicchannel/10"]);
  assert.equal(freshFeedPosts([...planned.eligible, ...planned.eligible], new Set()).length, 1);
  assert.equal(freshFeedPosts(planned.eligible, new Set([planned.eligible[0].url])).length, 0);
});

test("foreign message boundaries cannot donate publication time, text or video kind", () => {
  const html = `
    <div data-post="PublicChannel/20"></div>
    <div data-post="otherchannel/90">
      <time datetime="2026-10-20T10:00:00Z"></time>
      <div class="tgme_widget_message_text">foreign text</div>
      <div class="tgme_widget_message_video"></div>
    </div>
    <div data-post="publicchannel/21">
      <time datetime="2026-10-19T09:00:00Z"></time>
      <div class="tgme_widget_message_text">own text</div>
    </div>
    <div data-post="anotherchannel/91">
      <div class="tgme_widget_message_video"></div>
    </div>`;
  const posts = parseChannelFeed(html, "@PUBLICCHANNEL");
  assert.deepEqual(posts, [
    { messageId: 20, url: "https://t.me/publicchannel/20", text: "", publishedAt: null, kind: "post" },
    { messageId: 21, url: "https://t.me/publicchannel/21", text: "own text", publishedAt: "2026-10-19T09:00:00Z", kind: "post" },
  ]);
  const planned = datedFeedPosts(posts);
  assert.equal(planned.skippedUndated, 1);
  assert.deepEqual(planned.eligible.map(post => post.messageId), [21]);
});
