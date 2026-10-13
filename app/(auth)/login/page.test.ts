import assert from "node:assert/strict";
import test from "node:test";
import { deferred, loginPageHost } from "../../../scripts/testing/auth-page-test-host";

test("a stalled real login page ends busy UI, exposes full reload, and prevents parallel retry", async () => {
  const response = deferred<{ error: null }>();
  const host = loginPageHost(() => response.promise, "next=%2Fadmin%2Fresearch%3Ftab%3Dnotes");
  const page = host.mount(); page.fill();
  const oldSubmit = page.submitHandler();
  const pending = page.submit(); page.render();
  assert.equal(page.find("button", node => node.props.type === "submit").props.disabled, true);
  host.advance(7999); page.render(); assert.match(page.text(), /در حال ورود/);
  host.advance(1); page.render();
  assert.doesNotMatch(page.text(), /در حال ورود/);
  assert.match(page.text(), /درخواست را لغو نمی‌کند/);
  assert.match(page.html(), /role="alert"/);
  assert.equal(page.find("input", node => node.props.id === "login-email").props.disabled, false);
  assert.equal(page.find("button", node => node.props.type === "submit").props.disabled, true);
  await oldSubmit({ preventDefault() {} });
  assert.equal(host.calls.length, 1);
  const recovery = page.find("button", node => node.props.type === "button" && String(node.props.children).includes("بارگذاری دوباره"));
  (recovery.props.onClick as () => void)();
  assert.deepEqual(host.navigation, ["/login?next=%2Fadmin%2Fresearch%3Ftab%3Dnotes"]);
  response.resolve({ error: null }); await pending;
  assert.equal(host.navigation.length, 1, "late result cannot override the recovery navigation");
});

test("two submissions through the same captured page handler start only one SDK call", async () => {
  const response = deferred<{ error: null }>(), host = loginPageHost(() => response.promise);
  const page = host.mount(); page.fill(); const submit = page.submitHandler();
  const first = submit({ preventDefault() {} });
  void submit({ preventDefault() {} });
  assert.equal(host.calls.length, 1);
  response.resolve({ error: null }); await first;
  assert.deepEqual(host.navigation, ["/dashboard"]);
  assert.equal(host.timerCount, 0);
});

test("successful navigation stays terminal while location.assign does not unload the document", async () => {
  const host = loginPageHost(async () => ({ error: null }), "next=%2Fadmin%2Fresearch");
  const page = host.mount(); page.fill(); const oldSubmit = page.submitHandler();
  await page.submit(); page.render();
  await oldSubmit({ preventDefault() {} });
  await page.submit();
  await oldSubmit({ preventDefault() {} });
  page.render(); host.advance(8000); page.render();
  assert.equal(host.calls.length, 1);
  assert.deepEqual(host.navigation, ["/admin/research"]);
  assert.equal(host.timerCount, 0);
  assert.equal(page.find("button", node => node.props.type === "submit").props.disabled, true);
  assert.match(page.text(), /در حال انتقال/);
  assert.doesNotMatch(page.text(), /بارگذاری دوباره/);
});

test("a login component remount preserves terminal navigation until the document unloads", async () => {
  const host = loginPageHost(async () => ({ error: null }));
  const first = host.mount(); first.fill(); await first.submit(); first.unmount();
  const next = host.mount(); next.fill(); await next.submit(); next.render();
  assert.equal(host.calls.length, 1);
  assert.deepEqual(host.navigation, ["/dashboard"]);
  assert.equal(next.find("button", node => node.props.type === "submit").props.disabled, true);
  assert.match(next.text(), /در حال انتقال/);
});

for (const outcome of ["success", "error", "rejection"] as const) {
  test("after a UI deadline, late " + outcome + " cannot navigate or offer same-document retry", async () => {
    const response = deferred<{ error: { message: string } | null }>();
    let sdkSessionCommitted = false;
    const host = loginPageHost(async () => {
      const result = await response.promise;
      // Model the SDK's session side effect BEFORE its promise resolves.
      if (!result.error) sdkSessionCommitted = true;
      return result;
    });
    const page = host.mount(); page.fill(); const pending = page.submit();
    host.advance(8000); page.render(); const message = page.text();
    if (outcome === "rejection") response.reject(new Error("private service detail"));
    else response.resolve({ error: outcome === "error" ? { message: "Invalid login credentials" } : null });
    await pending; page.render();
    assert.deepEqual(host.navigation, []);
    assert.equal(sdkSessionCommitted, outcome === "success");
    assert.equal(page.text(), message, "UI deadline is not an SDK cancellation/session rollback");
    await page.submit(); assert.equal(host.calls.length, 1);
    assert.equal(page.find("button", node => node.props.type === "submit").props.disabled, true);
    assert.equal(host.timerCount, 0);
  });
}

for (const outcome of ["success", "error", "rejection"] as const) {
  test("unmount clears the deadline and ignores later " + outcome, async () => {
    const response = deferred<{ error: { message: string } | null }>();
    const host = loginPageHost(() => response.promise), page = host.mount(); page.fill();
    const pending = page.submit(); page.unmount();
    assert.equal(host.timerCount, 0); host.advance(8000);
    if (outcome === "rejection") response.reject(new Error("offline"));
    else response.resolve({ error: outcome === "error" ? { message: "Invalid login credentials" } : null });
    await pending;
    assert.deepEqual(host.navigation, []); assert.equal(page.lateUpdates, 0);
  });
}

test("a remounted page cannot start another login while the old SDK request remains pending", async () => {
  const response = deferred<{ error: null }>(), host = loginPageHost(() => response.promise);
  const first = host.mount(); first.fill(); const pending = first.submit(); first.unmount();
  const next = host.mount(); next.fill();
  assert.match(next.text(), /بارگذاری/);
  assert.equal(next.find("button", node => node.props.type === "submit").props.disabled, true);
  await next.submit(); assert.equal(host.calls.length, 1);
  response.resolve({ error: null }); await pending;
  assert.deepEqual(host.navigation, []); assert.equal(first.lateUpdates, 0);
});

test("effect cleanup/setup replay leaves the page usable before any request", async () => {
  const host = loginPageHost(async () => ({ error: null })), page = host.mount();
  page.replayEffects(); page.fill(); await page.submit();
  assert.deepEqual(host.navigation, ["/dashboard"]);
});

test("wrong password shows a safe page error and allows retry only after the request settles", async () => {
  let tries = 0;
  const host = loginPageHost(async () => ({ error: ++tries === 1 ? { message: "Invalid login credentials private-debug" } : null }));
  const page = host.mount(); page.fill(); await page.submit(); page.render();
  assert.match(page.text(), /ایمیل یا رمز عبور اشتباه است/);
  assert.doesNotMatch(page.text(), /private-debug/);
  assert.deepEqual(host.navigation, []); assert.equal(host.timerCount, 0);
  assert.equal(page.find("button", node => node.props.type === "submit").props.disabled, false);
  await page.submit(); assert.equal(host.calls.length, 2); assert.deepEqual(host.navigation, ["/dashboard"]);
});

test("transport rejection is generic and releases busy UI", async () => {
  const host = loginPageHost(async () => { throw new Error("private endpoint details"); });
  const page = host.mount(); page.fill(); await page.submit(); page.render();
  assert.match(page.text(), /خطا در اتصال/); assert.doesNotMatch(page.text(), /private endpoint/);
  assert.equal(page.find("button", node => node.props.type === "submit").props.disabled, false);
  assert.equal(host.timerCount, 0); assert.deepEqual(host.navigation, []);
});

test("missing credentials never call the SDK", async () => {
  const host = loginPageHost(async () => ({ error: null })), page = host.mount();
  await page.submit(); page.render(); assert.equal(host.calls.length, 0);
  assert.match(page.text(), /ایمیل الزامی/); assert.match(page.text(), /رمز عبور الزامی/);
});

for (const destination of ["/admin/research?tab=notes#item", "/symbol/طلا?tab=overview#chart", "https://evil.example", "//evil.example", "/\\evil.example", "/market\nnext", "javascript:alert(1)"]) {
  test("real login navigation uses sanitized next: " + JSON.stringify(destination), async () => {
    const host = loginPageHost(async () => ({ error: null }), "next=" + encodeURIComponent(destination));
    const page = host.mount(); page.fill(); await page.submit();
    assert.deepEqual(host.navigation, [destination.startsWith("/admin/") || destination.startsWith("/symbol/") ? destination : "/dashboard"]);
  });
}
