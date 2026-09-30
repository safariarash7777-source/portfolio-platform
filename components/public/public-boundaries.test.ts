import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("public event UI cannot publish a private meeting URL or confirm payment from callback query", () => {
  const source = readFileSync("components/public/WebinarsContent.tsx", "utf8");
  assert.doesNotMatch(source, /platform_url/);
  assert.doesNotMatch(source, /پرداخت موفق|ثبت‌نام شما تأیید شد/);
  assert.match(source, /تأیید پرداخت یا عضویت دوره نیست/);
});
test("consultation uses the established email-only lead contract and clears input only on explicit success", () => {
  const source = readFileSync("components/landing/WaitlistForm.tsx", "utf8").replace(/\s+/g, " ");
  assert.match(source, /fetch\("\/api\/waitlist"/);
  assert.match(source, /JSON\.stringify\(\{ email \}\)/);
  assert.match(source, /if \(result\.ok\) \{ setStatus\("success"\); setEmail\(""\); \}/);
  assert.doesNotMatch(source, /preferredTime|riskScore|portfolio/);
});
