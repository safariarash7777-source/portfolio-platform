import assert from "node:assert/strict";
import test from "node:test";
import { loginPageHost } from "../../../scripts/testing/auth-page-test-host";

test("callback failure renders a generic alert while preserving the safe next in registration", () => {
  const host = loginPageHost(async () => ({ error: null }), "error=auth_callback_failed&next=%2Fadmin%2Fresearch");
  const page = host.mount();
  assert.match(page.text(), /تأیید ورود کامل نشد/); assert.match(page.html(), /role="alert"/);
  assert.match(page.html(), /register\?next=%2Fadmin%2Fresearch/);
  assert.doesNotMatch(page.text(), /auth_callback_failed/);
});

test("existing auth unavailable alert remains visible; arbitrary query error is never reflected", () => {
  const unavailable = loginPageHost(async () => ({ error: null }), "error=auth_unavailable").mount();
  assert.match(unavailable.text(), /بررسی نشست در سرور پاسخ نداد/);
  const arbitrary = loginPageHost(async () => ({ error: null }), "error=private-service-payload").mount();
  assert.doesNotMatch(arbitrary.text(), /private-service-payload/);
});
