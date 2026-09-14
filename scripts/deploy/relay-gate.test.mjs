import test from "node:test";
import assert from "node:assert/strict";
import {
  validateShaInput,
  validateResolvedSha,
  decidePublish,
  evaluateFlags,
  evaluateDebug,
} from "./relay-gate.mjs";

// ── SHA ─────────────────────────────────────────────────────────────────────

test("SHA: تزریقِ فرمان و ورودیِ مبهم رد می‌شوند", () => {
  for (const bad of ["", "abc", "1d7e8f1; rm -rf /", "$(whoami)", "../../etc", "z".repeat(40)]) {
    assert.equal(validateShaInput(bad).ok, false, `باید رد شود: ${bad}`);
  }
  assert.deepEqual(validateShaInput("1D7E8F1").value, "1d7e8f1");
});

test("SHA: فقط ۴۰ رقمِ کامل به‌عنوان resolve‌شده پذیرفته می‌شود", () => {
  assert.equal(validateResolvedSha("1d7e8f1").ok, false, "مخففْ resolve‌شده نیست");
  assert.equal(validateResolvedSha("1d7e8f11084dec6fd43c81fe46a49baed6fe15bf").ok, true);
});

// ── دروازهٔ انتشار ───────────────────────────────────────────────────────────

const A = "a".repeat(40); // مستقر
const B = "b".repeat(40); // جدیدتر
const OLD = "c".repeat(40); // قدیمی‌تر
const base = { event: "workflow_run", isAncestorOfMain: true, ciSuccess: true };

test("انتشار: SHAِ بیرونِ تاریخچهٔ main رد می‌شود — پیش از لمسِ توکن", () => {
  const r = decidePublish({ ...base, sha: B, baseline: A, isAncestorOfMain: false });
  assert.equal(r.action, "fail");
  assert.equal(r.code, "sha-not-in-main");
});

test("انتشار: بدونِ CIِ موفقِ همان SHA رد می‌شود، و test:relay جایگزینش نیست", () => {
  const r = decidePublish({ ...base, sha: B, baseline: A, ciSuccess: false });
  assert.equal(r.action, "fail");
  assert.equal(r.code, "no-successful-ci");
  assert.match(r.reason, /test:relay/);
});

test("انتشار: ترتیبِ دروازه‌ها — تاریخچه پیش از CI بررسی می‌شود", () => {
  const r = decidePublish({ ...base, sha: B, baseline: A, isAncestorOfMain: false, ciSuccess: false });
  assert.equal(r.code, "sha-not-in-main");
});

test("انتشار: CIِ دیرتمام‌شدهٔ کامیتِ قدیمی نسخهٔ جدیدتر را عقب نمی‌برد", () => {
  const r = decidePublish({
    ...base,
    sha: OLD,
    baseline: A,
    isAncestorOfBaseline: true,
    relayChangedSinceBaseline: true,
  });
  assert.equal(r.action, "skip");
  assert.equal(r.code, "older-than-deployed");
});

test("انتشار: بازگشتِ صریح اجازهٔ رفتن به کامیتِ قدیمی‌تر را می‌دهد — ولی CI همچنان لازم است", () => {
  const ok = decidePublish({
    ...base,
    event: "workflow_dispatch",
    sha: OLD,
    baseline: A,
    isAncestorOfBaseline: true,
    allowOlder: true,
  });
  assert.equal(ok.action, "publish");
  assert.equal(ok.code, "rollback");

  const blocked = decidePublish({
    ...base,
    event: "workflow_dispatch",
    sha: OLD,
    baseline: A,
    isAncestorOfBaseline: true,
    allowOlder: true,
    ciSuccess: false,
  });
  assert.equal(blocked.action, "fail", "بازگشت هم از دروازهٔ CI رد نمی‌شود");
});

test("انتشار: مبنا آخرین انتشارِ موفق است، نه HEAD^ — pushِ چندکامیتی جا نمی‌ماند", () => {
  // تغییرِ relay در کامیتِ ماقبلِ آخر بود: HEAD^..HEAD چیزی نمی‌دید.
  const r = decidePublish({ ...base, sha: B, baseline: A, relayChangedSinceBaseline: true });
  assert.equal(r.action, "publish");
  assert.equal(r.code, "relay-changed");

  const none = decidePublish({ ...base, sha: B, baseline: A, relayChangedSinceBaseline: false });
  assert.equal(none.action, "skip");
  assert.equal(none.code, "no-relay-change");
});

test("انتشار: بدونِ مبنا، فقط اجرای دستی منتشر می‌کند", () => {
  assert.equal(decidePublish({ ...base, sha: B, baseline: null }).code, "no-baseline");
  assert.equal(
    decidePublish({ ...base, event: "workflow_dispatch", sha: B, baseline: null }).action,
    "publish",
  );
});

test("انتشار: همان SHAِ مستقر دوباره منتشر نمی‌شود", () => {
  assert.equal(decidePublish({ ...base, sha: A, baseline: A }).code, "already-published");
});

// ── پیش‌پرواز ────────────────────────────────────────────────────────────────

const okFlags = {
  node: "v22.11.0",
  PORT: "3400",
  IR_HISTORY_SECTIONS: null,
  BRSAPI_CLIENT_ENABLED: null,
  BRSAPI_BUDGET_ENFORCE_LEGACY: null,
  BRSAPI_KEY_SET: true,
  SUPABASE_URL_SET: true,
  SUPABASE_SERVICE_ROLE_KEY_SET: true,
  RELAY_TOKEN_SET: true,
};
const flags = (over = {}) => JSON.stringify({ ...okFlags, ...over });

test("پیش‌پرواز: وضعیتِ سالم عبور می‌کند", () => {
  const r = evaluateFlags(flags());
  assert.equal(r.ok, true, r.failures.join(" | "));
  assert.deepEqual(r.flags.effectiveSections, ["gold", "currency"]);
  assert.equal(r.flags.debugReachable, true);
});

test("پیش‌پرواز: خروجیِ بدشکل رد می‌شود — «پیدا شدنِ FLAGS» کافی نیست", () => {
  for (const bad of ["", "not json", "[]", "null", '"FLAGS"', "{}"]) {
    assert.equal(evaluateFlags(bad).ok, false, `باید رد شود: ${bad}`);
  }
});

test("پیش‌پرواز: کلیدِ مفقود رد می‌شود", () => {
  const { BRSAPI_BUDGET_ENFORCE_LEGACY, ...rest } = okFlags;
  const r = evaluateFlags(JSON.stringify(rest));
  assert.equal(r.ok, false);
  assert.match(r.failures.join(" "), /BRSAPI_BUDGET_ENFORCE_LEGACY/);
});

test("پیش‌پرواز: نوعِ اشتباه رد می‌شود", () => {
  assert.equal(evaluateFlags(flags({ BRSAPI_KEY_SET: "yes" })).ok, false);
  assert.equal(evaluateFlags(flags({ node: "22" })).ok, false);
  assert.equal(evaluateFlags(flags({ PORT: 3400 })).ok, false);
});

test("پیش‌پرواز: بدونِ phase28، هر دو پرچم انتشار را رد می‌کنند", () => {
  const a = evaluateFlags(flags({ BRSAPI_BUDGET_ENFORCE_LEGACY: "1" }));
  assert.equal(a.ok, false);
  assert.match(a.failures.join(" "), /بی‌شمارش/);

  const b = evaluateFlags(flags({ BRSAPI_CLIENT_ENABLED: "1" }));
  assert.equal(b.ok, false);
  assert.match(b.failures.join(" "), /brsapi_budget_lease/);

  // با phase28 اجراشده، همان مقادیر دیگر مانع نیستند.
  assert.equal(
    evaluateFlags(flags({ BRSAPI_CLIENT_ENABLED: "1", BRSAPI_BUDGET_ENFORCE_LEGACY: "1" }), {
      phase28Applied: true,
    }).ok,
    true,
  );
});

test("پیش‌پرواز: سکرتِ حیاتیِ غایب رد می‌شود", () => {
  assert.equal(evaluateFlags(flags({ BRSAPI_KEY_SET: false })).ok, false);
  assert.equal(evaluateFlags(flags({ SUPABASE_SERVICE_ROLE_KEY_SET: false })).ok, false);
});

test("پیش‌پرواز: IR_HISTORY_SECTIONS بیرونِ هدف رد می‌شود، برابرِ هدف نه", () => {
  const bad = evaluateFlags(flags({ IR_HISTORY_SECTIONS: "gold,currency,stocks" }));
  assert.equal(bad.ok, false);
  assert.match(bad.failures.join(" "), /stocks/);

  assert.equal(evaluateFlags(flags({ IR_HISTORY_SECTIONS: "gold, currency" })).ok, true);
  assert.equal(evaluateFlags(flags({ IR_HISTORY_SECTIONS: "gold" })).ok, true, "زیرمجموعه مانع نیست");
});

test("پیش‌پرواز: نبودِ RELAY_TOKEN انتشار را رد نمی‌کند ولی پذیرش را غیرِممکن اعلام می‌کند", () => {
  const r = evaluateFlags(flags({ RELAY_TOKEN_SET: false }));
  assert.equal(r.ok, true);
  assert.equal(r.flags.debugReachable, false);
});

// ── پذیرش ───────────────────────────────────────────────────────────────────

const okDebug = {
  historySections: { written: ["gold", "currency"], missing: [] },
  brsapiLegacy: { enforced: false },
  brsapiClient: { enabled: false },
};
const dbg = (over = {}) => JSON.stringify({ ...okDebug, ...over });

test("پذیرش: پاسخِ سالم قبول می‌شود", () => {
  const r = evaluateDebug(dbg());
  assert.equal(r.ok, true, r.failures.join(" | "));
});

test("پذیرش: {} رد می‌شود", () => {
  const r = evaluateDebug("{}");
  assert.equal(r.ok, false);
  assert.match(r.failures.join(" "), /خالی/);
});

test("پذیرش: نبودِ historySections یعنی نسخهٔ قدیمی — رد", () => {
  const { historySections, ...rest } = okDebug;
  const r = evaluateDebug(JSON.stringify(rest));
  assert.equal(r.ok, false);
  assert.match(r.failures.join(" "), /کدِ هدف نیست/);
});

test("پذیرش: written نامطلوب رد می‌شود", () => {
  for (const w of [["gold", "currency", "stocks"], ["gold"], []]) {
    const r = evaluateDebug(dbg({ historySections: { written: w, missing: [] } }));
    assert.equal(r.ok, false, `باید رد شود: ${JSON.stringify(w)}`);
  }
  // ترتیب نباید مهم باشد.
  assert.equal(evaluateDebug(dbg({ historySections: { written: ["currency", "gold"], missing: [] } })).ok, true);
});

test("پذیرش: missing ناخالی رد می‌شود", () => {
  assert.equal(evaluateDebug(dbg({ historySections: { written: ["gold", "currency"], missing: ["funds"] } })).ok, false);
});

test("پذیرش: فیلدِ مفقود یا نوعِ اشتباه رد می‌شود", () => {
  const { brsapiLegacy, ...rest } = okDebug;
  assert.equal(evaluateDebug(JSON.stringify(rest)).ok, false);
  assert.equal(evaluateDebug(dbg({ brsapiLegacy: { enforced: "false" } })).ok, false);
  assert.equal(evaluateDebug(dbg({ brsapiClient: {} })).ok, false);
});

test("پذیرش: enforced=true رد می‌شود", () => {
  assert.equal(evaluateDebug(dbg({ brsapiLegacy: { enforced: true } })).ok, false);
});

test("پذیرش: پاسخِ بدشکل رد می‌شود", () => {
  for (const bad of ["", "ok", "[]", "null"]) assert.equal(evaluateDebug(bad).ok, false);
});

// ── قراردادِ CLI ─────────────────────────────────────────────────────────────
// stdoutِ زیرفرمان‌هایی که به `$GITHUB_OUTPUT` هدایت می‌شوند باید **فقط**
// `key=value` باشد. یک خطِ `::notice::` آنجا فایلِ خروجی را خراب می‌کند.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const GATE = fileURLToPath(new URL("./relay-gate.mjs", import.meta.url));
const run = (args, input) => spawnSync(process.execPath, [GATE, ...args], { input, encoding: "utf8" });
const onlyPairs = (out) =>
  out.split("\n").filter((l) => l.trim() !== "").every((l) => /^[a-z_]+=/.test(l));

test("CLI: stdoutِ هر زیرفرمانِ خروجی‌ساز فقط key=value است", () => {
  const cases = [
    [["sha", "1d7e8f1"], undefined],
    [["resolved", "1d7e8f11084dec6fd43c81fe46a49baed6fe15bf"], undefined],
    [["flags", '{"phase28Applied":false}'], flags()],
    [["decide", JSON.stringify({ ...base, sha: B, baseline: A, relayChangedSinceBaseline: true })], undefined],
    [["decide", JSON.stringify({ ...base, sha: A, baseline: A })], undefined],
  ];
  for (const [args, input] of cases) {
    const r = run(args, input);
    assert.equal(r.status, 0, `${args[0]} باید موفق باشد: ${r.stderr}`);
    assert.ok(onlyPairs(r.stdout), `${args[0]} خطِ غیرِ key=value نوشت:\n${r.stdout}`);
  }
});

test("CLI: شکستِ دروازه کدِ خروجِ ۱ می‌دهد و چیزی روی stdout نمی‌ریزد", () => {
  const bad = [
    [["decide", JSON.stringify({ ...base, sha: B, baseline: A, ciSuccess: false })], undefined],
    [["flags", "{}"], "not json"],
    [["accept", "{}"], "{}"],
    [["sha", "nope"], undefined],
  ];
  for (const [args, input] of bad) {
    const r = run(args, input);
    assert.equal(r.status, 1, `${args[0]} باید رد شود`);
    assert.ok(onlyPairs(r.stdout), `${args[0]} روی stdout نوشت:\n${r.stdout}`);
  }
});
