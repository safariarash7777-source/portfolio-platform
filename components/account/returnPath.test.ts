import { strict as assert } from "node:assert";
import test from "node:test";
import { accountEntryHref, normalizeReturnPath } from "./returnPath";

test("مسیر محلی همراه query و hash حفظ می‌شود", () => {
  assert.equal(normalizeReturnPath("/symbol/طلا?tab=overview#chart"), "/symbol/طلا?tab=overview#chart");
});

test("آدرس بیرونی و protocol-relative رد می‌شود", () => {
  assert.equal(normalizeReturnPath("https://evil.example", "/market"), "/market");
  assert.equal(normalizeReturnPath("//evil.example", "/market"), "/market");
});

test("backslash و نویسهٔ کنترلی رد می‌شود", () => {
  assert.equal(normalizeReturnPath("/\\evil.example", "/market"), "/market");
  assert.equal(normalizeReturnPath("/market\nnext", "/market"), "/market");
});

test("لینک ورود مقصد را دقیق و URL-encoded حمل می‌کند", () => {
  assert.equal(accountEntryHref("/login", "/market/funds?type=طلا"), "/login?next=%2Fmarket%2Ffunds%3Ftype%3D%D8%B7%D9%84%D8%A7");
});
