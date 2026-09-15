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

// ── کاوشِ اپِ زنده: تشخیص باید علت را بگوید، نه فقط «JSON معتبر نیست» ────────
// اجرای واقعیِ 34953490961 در ۱۲ ثانیه با یک جملهٔ بی‌اطلاع شکست خورد، چون
// خروجیِ CLI داخلِ یک متغیر گم می‌شد و کدِ خروجش با لولهٔ `tr` از بین می‌رفت.

import { PROBE_SOURCE, probeCommand, urlHostileChars, sanitiseProbeOutput, classifyProbe } from "./relay-gate.mjs";

test("کاوش: فرمان encode می‌شود، چون CLI خودش نمی‌کند", () => {
  const cmd = probeCommand();
  for (const ch of [" ", "+", "&", '"', "'", "#"]) {
    assert.ok(!cmd.includes(ch), `کاراکترِ خام «${ch}» در فرمانِ encodeشده ماند`);
  }
  assert.ok(cmd.startsWith("node%20-e%20"));
  assert.equal(decodeURIComponent(cmd), `node -e ${PROBE_SOURCE}`, "رفت‌وبرگشت باید دقیق باشد");
});

test("کاوش: منبع هیچ فاصله‌ای ندارد — سرور روی فاصله تکه می‌کند", () => {
  // شاهد: اجرای 34955059014 با exit=0 برگشت و کانتینر گفت
  //   [eval]:1 / const / SyntaxError: Unexpected end of input
  // یعنی `node -e const e=process.env;…` به argv تکه شد و اسکریپت فقط `const`
  // بود. هیچ shellی وسط نیست، پس اسکریپت باید **یک توکنِ بی‌فاصله** باشد.
  assert.deepEqual(PROBE_SOURCE.match(/\s/g), null, "هر فاصله یک argvِ تازه می‌سازد");
  assert.ok(!PROBE_SOURCE.includes("const"), "`const` بدونِ فاصله ممکن نیست — حذف شد");
  assert.match(PROBE_SOURCE, /process\.env\.PORT/, "دسترسی به env باید inline بماند");
});

test("کاوش: فرمانِ کامل دقیقاً سه توکن می‌شود، همان‌طور که سرور تکه می‌کند", () => {
  const argv = decodeURIComponent(probeCommand()).split(/\s+/);
  assert.equal(argv.length, 3, `سرور به ${argv.length} توکن تکه می‌کند: ${argv.slice(0, 4)}`);
  assert.deepEqual(argv.slice(0, 2), ["node", "-e"]);
  assert.equal(argv[2], PROBE_SOURCE, "تکهٔ سوم باید کلِ اسکریپت باشد، نه بخشی از آن");
});

test("کاوش: اسکریپت واقعاً اجرا می‌شود و JSONِ قابلِ تشخیص می‌دهد", () => {
  const r = spawnSync(process.execPath, ["-e", PROBE_SOURCE], { encoding: "utf8" });
  assert.equal(r.status, 0, `اسکریپت نباید بیفتد: ${r.stderr}`);
  const probe = classifyProbe({ exitCode: 0, raw: r.stdout });
  assert.equal(probe.ok, true, "خروجیِ خودِ اسکریپت باید از تشخیص عبور کند");
  assert.equal(evaluateFlags(probe.flagsJson).ok, false, "روی این ماشین سکرت‌ها نیستند — پس رد می‌شود");
  assert.match(JSON.parse(probe.flagsJson).node, /^v\d+\./);
});

test("کاوش: منبع نه `+` دارد نه `&` — همان چیزی که نسخهٔ اولِ کاوش را شکست", () => {
  // `+` هنگامِ decode فاصله می‌شود و `&` رشته را قطع می‌کند؛ حتی با encode هم
  // نگه‌داشتنِ این قید یعنی اگر روزی کسی بدونِ encode بسازدش، بی‌صدا نمی‌شکند.
  assert.ok(!PROBE_SOURCE.includes("+"), "نسخهٔ شکسته `\"FLAGS=\"+JSON.stringify(...)` بود");
  assert.ok(!PROBE_SOURCE.includes("&"));
  assert.ok(!PROBE_SOURCE.includes('"'));
  assert.deepEqual(urlHostileChars(), [], "بعد از حذفِ `const`، هیچ کاراکترِ خصمانه‌ای نماند");
});

test("کاوش: هیچ نامِ سکرتی مقدارش را چاپ نمی‌کند", () => {
  for (const k of ["BRSAPI_KEY", "SUPABASE_SERVICE_ROLE_KEY", "RELAY_TOKEN", "SUPABASE_URL"]) {
    assert.match(PROBE_SOURCE, new RegExp(`Boolean\\(process\\.env\\.${k}\\)`), `${k} باید بولین شود`);
  }
});

test("پاک‌سازی: توکن و شکل‌های شبیهِ سکرت حذف می‌شوند", () => {
  // توکنِ آزمایشی در زمانِ اجرا ساخته می‌شود، نه به‌صورتِ لیترال: وگرنه
  // `scan:secrets` همین فایل را — به‌درستی — به‌عنوانِ JWT علامت می‌زند. قاعدهٔ
  // اسکنر درست است و نباید سست شود؛ این تست است که نباید شبیهِ سکرت بنویسد.
  const tok = ["eyJ", "hbGciOiJIUzI1NiJ9", ".", "eyJzdWIiOiIxMjM0NTY3ODkwIn0", ".", "abcdefghij"].join("");
  const out = sanitiseProbeOutput(`wss://x/v1/exec?token=${tok}&cmd=node\nError: bad`, [tok]);
  assert.ok(!out.includes(tok), "توکن نباید در گزارش بماند");
  assert.match(out, /حذف‌شده/);
  assert.match(out, /Error: bad/, "پیامِ واقعی باید بماند");
});

test("پاک‌سازی: سکرتِ ناشناخته هم با الگو گرفته می‌شود", () => {
  const out = sanitiseProbeOutput("api-token=SuperSecretValue123 rest");
  assert.ok(!out.includes("SuperSecretValue123"));
});

test("پاک‌سازی: خروجیِ بلند بریده می‌شود", () => {
  const big = Array.from({ length: 200 }, (_, i) => `line ${i}`).join("\n");
  const out = sanitiseProbeOutput(big);
  assert.ok(out.split("\n").length <= 20);
  assert.match(out, /line 199/, "آخرین خط‌ها مفیدترند");
});

test("تشخیص: شکستِ اجرا از شکستِ استخراج جدا می‌شود", () => {
  const kind = (exitCode, raw) => classifyProbe({ exitCode, raw }).kind;
  assert.equal(kind(124, ""), "timeout");
  assert.equal(kind(2, " ›   Error: Response code 403 (Forbidden)"), "command-failed");
  assert.equal(kind(1, "connect ECONNREFUSED 1.2.3.4:443"), "command-failed");
  assert.equal(kind(0, ""), "no-output");
  assert.equal(kind(0, "SyntaxError: Unexpected identifier"), "no-marker");
  assert.equal(kind(0, '{"probe":1,'), "no-marker", "JSONِ خراب هم عبور نمی‌کند");
});

test("تشخیص: علتِ شکستِ اجرا نام‌گذاری می‌شود، نه اینکه یک جملهٔ کلی بگیرد", () => {
  const s = (e, r) => classifyProbe({ exitCode: e, raw: r }).summary;
  assert.match(s(2, "Response code 403 (Forbidden)"), /توکن|دسترسی/);
  assert.match(s(2, "Response code 404 (Not Found)"), /اپ پیدا نشد/);
  assert.match(s(1, "ENOTFOUND api.iran.liara.ir"), /اتصال/);
  assert.match(s(9, "weird"), /کدِ خروج 9/, "کدِ خروج باید در گزارش بیاید");
});

test("تشخیص: **هر** حالتِ شکست جلوی انتشار را می‌گیرد", () => {
  for (const [e, r] of [[124, ""], [2, "403"], [0, ""], [0, "junk"], [0, '{"probe":2}']]) {
    assert.equal(classifyProbe({ exitCode: e, raw: r }).ok, false, `(${e}, ${r}) نباید عبور کند`);
  }
});

test("تشخیص: خروجیِ سالم پذیرفته می‌شود، حتی با نویز دور و برش", () => {
  const good = '{"probe":1,"node":"v22.11.0","PORT":"3400"}';
  const r = classifyProbe({ exitCode: 0, raw: `Using proxy server\nnoise\n${good}\nConnection closed` });
  assert.equal(r.ok, true);
  assert.equal(r.flagsJson, good);
});

test("تشخیص: خروجیِ کاوش به evaluateFlags وصل می‌شود و ساختار همان‌جا سنجیده می‌شود", () => {
  const partial = '{"probe":1,"node":"v22.11.0"}';
  const r = classifyProbe({ exitCode: 0, raw: partial });
  assert.equal(r.ok, true, "تشخیص فقط می‌گوید «خواندیم»");
  assert.equal(evaluateFlags(r.flagsJson).ok, false, "کاملِ نبودنِ کلیدها را evaluateFlags می‌گیرد");
});

test("تشخیص: گزارش، خروجیِ پاک‌سازی‌شده را همراه دارد تا تشخیص ممکن باشد", () => {
  const r = classifyProbe({ exitCode: 2, raw: "Error: Response code 403 (Forbidden)" });
  assert.match(r.detail, /403/, "بدونِ متنِ واقعی، تشخیص دوباره کور می‌شود");
});

test("workflow: خروجیِ liara به فایل می‌رود و کدِ خروج جدا نگه داشته می‌شود", () => {
  // نسخهٔ شکسته: OUT=$(… | tr -d '\r') — کدِ خروجِ tr، و OUT هرگز دیده نمی‌شد.
  assert.ok(!/OUT=\$\(timeout/.test(WF), "خروجی دیگر نباید در یک متغیرِ چاپ‌نشده گم شود");
  assert.match(WF, /> "\$RAW" 2>&1\n\s*RC=\$\?/, "کدِ خروجِ خودِ دستور باید ثبت شود");
  assert.match(WF, /relay-gate\.mjs preflight "\$RAW" "\$RC"/);
});

test("workflow: فرمانِ کاوش از ماژول می‌آید، نه دست‌ساز در YAML", () => {
  assert.match(WF, /CMD="\$\(node scripts\/deploy\/relay-gate\.mjs probe-cmd\)"/);
  assert.ok(!/PROBE='const e=process\.env/.test(WF), "رشتهٔ دست‌ساز باید رفته باشد");
});

test("workflow: پیش‌پرواز هنوز راهِ عبور ندارد", () => {
  assert.ok(!/flags_checked/.test(WF), "هر ورودیِ «قبولش کن» یعنی دروازه دور زده می‌شود");
});

// ── درس‌های اجرای واقعیِ 34955555129 ────────────────────────────────────────
// انتشار موفق شد، ولی دفترداری وسط راه شکست و راستی‌آزمایی را با خودش برد.

test("workflow: راستی‌آزمایی پیش از دفترداری می‌آید", () => {
  const health = WF.indexOf("زنده‌بودن پس از انتشار");
  const accept = WF.indexOf("پذیرش — شاهدِ نسخه");
  const record = WF.indexOf("ثبتِ مبنای انتشار");
  assert.ok(health > -1 && accept > -1 && record > -1);
  assert.ok(health < record, "`/healthz` نباید پشتِ دفترداری بیفتد");
  assert.ok(accept < record, "پذیرش نباید پشتِ دفترداری بیفتد");
});

test("workflow: شکستِ یک گام، راستی‌آزماییِ چیزی که مستقر شده را پنهان نمی‌کند", () => {
  for (const step of ["زنده‌بودن پس از انتشار", "پذیرش — شاهدِ نسخه", "ثبتِ مبنای انتشار"]) {
    const i = WF.indexOf(step);
    const cond = WF.slice(i, i + 420);
    assert.match(cond, /if: always\(\) && steps\.publish\.outcome == 'success'/,
      `«${step}» باید به نتیجهٔ واقعیِ انتشار نگاه کند، نه به اینکه گامِ قبلی افتاده یا نه`);
  }
});

test("workflow: مبنا دیگر با push کردنِ ref ثبت نمی‌شود", () => {
  // `git push -f origin refs/tags/...` را GitHub رد کرد، چون توکنِ GitHub App
  // حق ندارد refی بسازد که فایلِ workflow را نسبت به شاخهٔ پیش‌فرض عوض کند.
  assert.ok(!/git push .*refs\/tags/.test(WF), "push کردنِ تگ برگشته است");
  assert.ok(!/contents: write/.test(WF), "دیگر به نوشتن در مخزن نیازی نیست");
  assert.match(WF, /deployments: write/);
  assert.match(WF, /deployments\?environment=\$\{BASELINE_ENV\}/, "مبنا باید از همان‌جا خوانده شود");
});

test("workflow: شناسهٔ نسخه از تگِ ایمیج می‌آید، چون CLI شماره نمی‌دهد", () => {
  // خروجیِ واقعی: «✔ Release created.» بدونِ هیچ شماره‌ای. تنها شناسه:
  // «Successfully tagged apps/6a5351feb95bf1e50c1ee34f:7mwbs98ytrzw»
  assert.ok(!/grep -oE '\\\\bv\[0-9\]\+\\\\b'/.test(WF), "الگوی vN چیزی پیدا نمی‌کرد");
  assert.match(WF, /apps\/\[0-9a-f\]\+:\[0-9a-z\]\+/);
  const sample = "- Successfully tagged apps/6a5351feb95bf1e50c1ee34f:7mwbs98ytrzw";
  assert.match(sample, /apps\/[0-9a-f]+:[0-9a-z]+/, "الگو باید روی خروجیِ واقعی بگیرد");
});
