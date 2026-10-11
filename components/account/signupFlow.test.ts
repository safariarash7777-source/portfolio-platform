import assert from "node:assert/strict";
import test from "node:test";
import { signupAndReturn, signupErrorMessage } from "./signupFlow";

const values = {
  email: "fixture@example.test", password: "test-only-not-a-real-password",
  options: { emailRedirectTo: "https://site.example/auth/callback?next=%2Fwebinars", data: {
    full_name: "Local unit fixture", national_id: "0000000000", phone: "09000000000",
  } },
};
// SDK stubs below exercise outcomes only; not evidence of real signup or acceptance.
test("confirmation response does not navigate or assert account/email delivery", async () => {
  const outcome = await signupAndReturn({ values, returnTo: "/webinars",
    signUp: async sent => { assert.equal(sent, values); return { data: { user: { id: "fixture" }, session: null }, error: null }; },
    navigate: () => assert.fail("confirmation has no session"),
  });
  assert.deepEqual(outcome, { status: "confirmation" });
});

for (const [destination, expected] of [["/webinars", "/webinars"], ["https://evil.example", "/dashboard"]]) {
  test(`SDK session uses normalized return: ${destination}`, async () => {
    const paths: string[] = [];
    const outcome = await signupAndReturn({ values, returnTo: destination,
      signUp: async () => ({ data: { user: {}, session: {} }, error: null }),
      navigate: path => paths.push(path),
    });
    assert.deepEqual(paths, [expected]);
    assert.equal(outcome.status, "signed-in");
  });
}

test("disabled/signup mail failures preserve submitted values and never navigate", async () => {
  const before = structuredClone(values);
  for (const error of [{ code: "signup_disabled" }, { message: "Error sending confirmation email" }, { status: 429 }]) {
    const outcome = await signupAndReturn({ values, returnTo: "/webinars",
      signUp: async () => ({ data: { user: null, session: null }, error }),
      navigate: () => assert.fail("failed signup cannot navigate"),
    });
    assert.equal(outcome.status, "error");
    assert.deepEqual(values, before);
  }
  assert.match(signupErrorMessage({ code: "signup_disabled" }), /غیرفعال/);
  assert.match(signupErrorMessage({ message: "Error sending confirmation email" }), /تأیید ایمیل/);
  assert.match(signupErrorMessage({ status: 429 }), /تعداد درخواست/);
});

test("empty response and transport failure are not signup success", async () => {
  for (const signUp of [async () => ({ data: { user: null, session: null }, error: null }), async () => { throw new Error("offline"); }]) {
    assert.equal((await signupAndReturn({ values, returnTo: "/webinars", signUp,
      navigate: () => assert.fail("no session"),
    })).status, "error");
  }
});

test("account-specific errors do not expose membership or raw service errors", () => {
  assert.equal(signupErrorMessage({ message: "User already registered" }), signupErrorMessage({ message: "internal private diagnostics" }));
});
