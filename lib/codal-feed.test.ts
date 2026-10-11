import { test } from "node:test";
import assert from "node:assert/strict";
import { codalFeedFailure, codalFeedItems } from "./codal-feed";

test("permission, column and transport failures cannot claim that an existing feed is uninstalled", () => {
  assert.equal(codalFeedFailure(null), null);
  for (const code of ["42501", "42703", "PGRST204", "", undefined]) assert.equal(codalFeedFailure({ code }), "unavailable");
  for (const code of ["42P01", "PGRST205"]) assert.equal(codalFeedFailure({ code }), "missing");
});

test("malformed response fails rather than presenting a false empty feed", () => {
  assert.throws(() => codalFeedItems({ error: "unavailable" }));
  assert.deepEqual(codalFeedItems([]), []);
});
