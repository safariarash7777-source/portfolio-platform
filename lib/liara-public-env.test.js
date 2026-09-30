const test = require("node:test");
const assert = require("node:assert/strict");
const { liaraPublicEnv } = require("./liara-public-env.js");
const key = (role, exp = 4102444800) => "fixture." + Buffer.from(JSON.stringify({ role, iss: "supabase", exp })).toString("base64url") + ".fixture";
const env = { NEXT_PUBLIC_LIARA_API_URL: "https://example.invalid/api", NEXT_PUBLIC_LIARA_ANON_KEY: key("anon") };
test("legacy configuration remains untouched when the override is disabled", () => assert.deepEqual(liaraPublicEnv({}), {}));
test("partial or insecure configuration fails before a bundle is built", () => {
  assert.throws(() => liaraPublicEnv({ NEXT_PUBLIC_LIARA_API_URL: env.NEXT_PUBLIC_LIARA_API_URL }), /together/);
  assert.throws(() => liaraPublicEnv({ ...env, NEXT_PUBLIC_LIARA_API_URL: "http://example.invalid" }), /HTTPS/);
});
test("server credentials and expired credentials cannot enter a public bundle", () => {
  assert.throws(() => liaraPublicEnv({ ...env, NEXT_PUBLIC_LIARA_ANON_KEY: key("service_role") }), /server keys/);
  assert.throws(() => liaraPublicEnv({ ...env, NEXT_PUBLIC_LIARA_ANON_KEY: key("anon", 1) }), /unexpired/);
});
test("both client settings resolve to the same selected backend", () => assert.deepEqual(liaraPublicEnv(env), {
  NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_LIARA_API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: env.NEXT_PUBLIC_LIARA_ANON_KEY,
}));
