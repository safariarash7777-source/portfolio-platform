import test from "node:test";
import assert from "node:assert/strict";
import {
  validateShaInput,
  validateResolvedSha,
  decidePublish,
  evaluateFlags,
  evaluateDebug,
  summarize,
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

// ── ۳) پذیرش: بدونِ phase28، کلاینتِ روشن هم رد است ──────────────────────────

test("پذیرش: brsapiClient.enabled=true بدونِ phase28 رد می‌شود", () => {
  const r = evaluateDebug(dbg({ brsapiClient: { enabled: true } }));
  assert.equal(r.ok, false);
  assert.match(r.failures.join(" "), /brsapi_budget_lease/);
});

test("پذیرش: با phase28 اجراشده، هر دو پرچمِ روشن مانع نیستند", () => {
  const r = evaluateDebug(dbg({ brsapiLegacy: { enforced: true }, brsapiClient: { enabled: true } }), {
    phase28Applied: true,
  });
  assert.equal(r.ok, true, r.failures.join(" | "));
});

test("پذیرش: بدونِ phase28، هر دو مستقل از هم رد می‌کنند", () => {
  assert.equal(evaluateDebug(dbg({ brsapiLegacy: { enforced: true } })).ok, false);
  assert.equal(evaluateDebug(dbg({ brsapiClient: { enabled: true } })).ok, false);
  const both = evaluateDebug(dbg({ brsapiLegacy: { enforced: true }, brsapiClient: { enabled: true } }));
  assert.equal(both.failures.length, 2, "هر دو باید جداگانه گزارش شوند");
});

// ── ۲) زمانِ تلاش ≠ موفقیتِ انتشار ────────────────────────────────────────────

test("گزارش: published_at موجود ولی گامِ publish شکست‌خورده «منتشر شد» نیست", () => {
  const r = summarize({
    gateAction: "publish",
    publishOutcome: "failure",
    startedAt: "2026-09-14T11:00:00Z",
    publishedAt: "2026-09-14T11:00:00Z", // باقی‌ماندهٔ یک تلاشِ ناموفق
  });
  assert.equal(r.publish.state, "failed");
  assert.match(r.publish.text, /شکست/);
  assert.equal(r.acceptance.state, "not-attempted", "پذیرشِ انتشارِ نشده معنا ندارد");
});

test("گزارش: فقط outcome موفق + زمانِ انتشار «منتشر شد» می‌سازد", () => {
  const ok = summarize({
    gateAction: "publish",
    publishOutcome: "success",
    startedAt: "2026-09-14T11:00:00Z",
    publishedAt: "2026-09-14T11:02:00Z",
    acceptance: "passed",
  });
  assert.equal(ok.publish.state, "done");
  assert.match(ok.publish.text, /11:02/);
  assert.equal(ok.acceptance.state, "passed");

  // موفق ولی بدونِ زمانِ انتشار → همچنان «منتشر شد» نیست.
  assert.equal(
    summarize({ gateAction: "publish", publishOutcome: "success", startedAt: "x" }).publish.state,
    "failed",
  );
});

test("گزارش: دروازه که رد کند، انتشار «انجام نشد» است نه شکست", () => {
  const r = summarize({ gateAction: "skip", gateCode: "no-relay-change" });
  assert.equal(r.publish.state, "not-attempted");
  assert.match(r.publish.text, /no-relay-change/);
  assert.equal(r.acceptance.state, "not-attempted");
});

test("گزارش: پذیرشِ ناموفق و در انتظار از هم جدا می‌مانند", () => {
  const base = { gateAction: "publish", publishOutcome: "success", publishedAt: "t" };
  assert.equal(summarize({ ...base, acceptance: "failed" }).acceptance.state, "failed");
  assert.equal(summarize({ ...base, acceptance: "pending" }).acceptance.state, "pending");
  assert.equal(summarize({ ...base }).acceptance.state, "pending", "پیش‌فرض موفق نیست");
  assert.equal(summarize({ ...base, acceptance: "bogus" }).acceptance.state, "pending");
});

test("گزارش: بازگشت، پذیرشِ نسخهٔ هدف را «اعمال‌نشدنی» ثبت می‌کند نه رد", () => {
  const r = summarize({ gateAction: "publish", publishOutcome: "success", publishedAt: "t", rollback: true });
  assert.equal(r.acceptance.state, "not-applicable");
});

// ── ۱) قیدِ منبعِ منطقِ دروازه در workflow ────────────────────────────────────
// این‌ها قراردادِ خودِ فایلِ workflow‌اند؛ منطقشان در YAML است، پس اینجا روی
// متنِ همان فایل ادعا می‌شود تا رگرسیونِ خاموش ممکن نباشد.

import { readFileSync } from "node:fs";
const WF = readFileSync(new URL("../../.github/workflows/deploy-relay.yml", import.meta.url), "utf8");

test("workflow: checkout صریحاً به main مقید است", () => {
  assert.match(WF, /uses: actions\/checkout@v4\s*\n\s*with:\s*\n\s*ref: main\b/);
});

test("workflow: SHAِ منطقِ دروازه ثبت و گزارش می‌شود", () => {
  assert.match(WF, /gate_sha=\$\(git rev-parse HEAD\)/);
  assert.match(WF, /GATE_SHA: \$\{\{ steps\.gatesrc\.outputs\.gate_sha \}\}/);
});

test("workflow: گزارش به outcome واقعیِ گامِ publish نگاه می‌کند", () => {
  assert.match(WF, /PUBLISH_OUTCOME: \$\{\{ steps\.publish\.outcome \}\}/);
});

test("workflow: published_at پس از دستورِ deploy نوشته می‌شود، نه پیش از آن", () => {
  const deployAt = WF.indexOf("deploy \\");
  const publishedAt = WF.indexOf('echo "published_at=');
  const startedAt = WF.indexOf('echo "started_at=');
  assert.ok(startedAt > -1 && startedAt < deployAt, "started_at باید پیش از deploy باشد");
  assert.ok(publishedAt > deployAt, "published_at باید پس از deploy باشد");
});

test("workflow: پذیرش همان واقعیتِ phase28 را می‌گیرد", () => {
  assert.match(WF, /accept "\{\\"phase28Applied\\": \$\{PHASE28_APPLIED\}\}"/);
});

test("گزارش: متنِ بازگشت، بررسیِ سلامت و تازگی را کنار نمی‌گذارد", () => {
  const r = summarize({ gateAction: "publish", publishOutcome: "success", publishedAt: "t", rollback: true });
  assert.equal(r.acceptance.state, "not-applicable");
  assert.match(r.acceptance.text, /سلامت و تازگیِ داده همچنان بررسی شود/);
});
