import assert from "node:assert/strict";
import test from "node:test";
import { signInAndReturn } from "./loginFlow";

test("ورود موفق دقیقاً به مقصد محلی حفظ‌شده برمی‌گردد", async () => {
  const navigations: string[] = [];
  let refreshed = false;
  const error = await signInAndReturn(
    {
      signIn: async () => ({ error: null }),
      navigate: (destination) => navigations.push(destination),
      refresh: () => { refreshed = true; },
    },
    { email: "member@example.com", password: "secret" },
    "/market/funds?type=طلا#table",
  );

  assert.equal(error, null);
  assert.deepEqual(navigations, ["/market/funds?type=طلا#table"]);
  assert.equal(refreshed, true);
});

test("مقصد بیرونی حتی پس از ورود موفق به داشبورد امن برمی‌گردد", async () => {
  const navigations: string[] = [];
  await signInAndReturn(
    {
      signIn: async () => ({ error: null }),
      navigate: (destination) => navigations.push(destination),
      refresh: () => undefined,
    },
    { email: "member@example.com", password: "secret" },
    "https://evil.example/steal",
  );
  assert.deepEqual(navigations, ["/dashboard"]);
});

test("ورود ناموفق نه جابه‌جا می‌شود و نه صفحه را refresh می‌کند", async () => {
  let navigated = false;
  let refreshed = false;
  const error = await signInAndReturn(
    {
      signIn: async () => ({ error: { message: "Invalid login credentials" } }),
      navigate: () => { navigated = true; },
      refresh: () => { refreshed = true; },
    },
    { email: "member@example.com", password: "wrong" },
    "/market",
  );
  assert.equal(error?.message, "Invalid login credentials");
  assert.equal(navigated, false);
  assert.equal(refreshed, false);
});
