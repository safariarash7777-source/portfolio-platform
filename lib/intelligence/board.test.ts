import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildToday,
  buildInbox,
  buildScenarioBoard,
  buildPortfolioImpact,
  buildRehearsalView,
  type BriefRow,
  type ClaimRow,
  type EffectRow,
  type HistoryRow,
} from "./board";
import type { RehearsalDay } from "./workflow";

const brief = (over: Partial<BriefRow> = {}): BriefRow => ({
  id: "b1",
  title: "بریف",
  domain: "macro_ir",
  status: "draft",
  briefDate: "2026-08-02",
  updatedAt: "2026-08-02T08:00:00Z",
  reviewNote: null,
  ...over,
});

const claim = (over: Partial<ClaimRow> = {}): ClaimRow => ({
  id: "c1",
  analysisId: "b1",
  kind: "FACT",
  statement: "گزاره",
  confidence: 70,
  scenarioLabel: null,
  evidenceCount: 1,
  ...over,
});

// ── امروز ───────────────────────────────────────────────────────────────────

/**
 * درسِ `B-038` در لباسِ نما: اگر «بریفِ امروز ثبت نشده» به `۰ گزاره` تبدیل
 * شود، یک روزِ فراموش‌شده دقیقاً شبیهِ یک بریفِ خالی به‌نظر می‌رسد.
 */
test("no brief today reports null, not zero claims", () => {
  const v = buildToday("2026-08-02", [], []);
  assert.equal(v.brief, null);
  assert.equal(v.claimCount, null);
  assert.equal(v.statusLabel, "ثبت‌نشده");
});

test("an existing but empty brief reports zero, which is a different fact", () => {
  const v = buildToday("2026-08-02", [brief()], []);
  assert.ok(v.brief);
  assert.equal(v.claimCount, 0);
});

test("a rejected or superseded brief does not count as today's brief", () => {
  for (const status of ["rejected", "superseded"] as const) {
    assert.equal(buildToday("2026-08-02", [brief({ status })], []).brief, null, status);
  }
});

test("only the brief for the requested date is shown", () => {
  const v = buildToday("2026-08-02", [brief({ briefDate: "2026-08-01" })], []);
  assert.equal(v.brief, null);
});

test("claims without evidence are counted separately", () => {
  const v = buildToday("2026-08-02", [brief()], [claim(), claim({ id: "c2", evidenceCount: 0 })]);
  assert.equal(v.claimCount, 2);
  assert.equal(v.unsupportedClaims, 1);
});

// ── صندوقِ بازبینی ──────────────────────────────────────────────────────────

test("the inbox holds only what is genuinely pending review", () => {
  const items = buildInbox(
    [
      brief({ id: "a", status: "draft" }),
      brief({ id: "b", status: "pending_approval" }),
      brief({ id: "c", status: "approved_internal" }),
      brief({ id: "d", status: "rejected" }),
    ],
    [],
    []
  );
  assert.deepEqual(items.map((i) => i.brief.id), ["b"]);
});

/**
 * دکمهٔ تأییدی که دیتابیس بعداً ردش می‌کند، بدتر از نبودنِ دکمه است — کاربر
 * نمی‌فهمد چرا. دلیلِ مسدودبودن باید **پیش از** فشردن معلوم باشد.
 */
test("a pending brief with an unsupported claim says why it cannot be approved", () => {
  const items = buildInbox(
    [brief({ id: "b", status: "pending_approval" })],
    [claim({ analysisId: "b", evidenceCount: 0 })],
    []
  );
  assert.match(items[0].blockedReason ?? "", /شاهد/);
});

test("a pending brief with no claim at all says so distinctly", () => {
  const items = buildInbox([brief({ id: "b", status: "pending_approval" })], [], []);
  assert.match(items[0].blockedReason ?? "", /گزاره‌ای ندارد/);
});

test("a fully supported pending brief is not blocked", () => {
  const items = buildInbox(
    [brief({ id: "b", status: "pending_approval" })],
    [claim({ analysisId: "b", evidenceCount: 2 })],
    []
  );
  assert.equal(items[0].blockedReason, null);
});

test("history is attached per analysis and ordered oldest first", () => {
  const history: HistoryRow[] = [
    { analysisId: "b", event: "submitted", occurredAt: "2026-08-02T09:00:00Z", note: null },
    { analysisId: "b", event: "captured", occurredAt: "2026-08-02T08:00:00Z", note: null },
    { analysisId: "other", event: "captured", occurredAt: "2026-08-02T07:00:00Z", note: null },
  ];
  const items = buildInbox([brief({ id: "b", status: "pending_approval" })], [], history);
  assert.deepEqual(items[0].history.map((h) => h.event), ["captured", "submitted"]);
});

test("the oldest waiting item comes first", () => {
  const items = buildInbox(
    [
      brief({ id: "new", status: "pending_approval", updatedAt: "2026-08-02T10:00:00Z" }),
      brief({ id: "old", status: "pending_approval", updatedAt: "2026-08-01T10:00:00Z" }),
    ],
    [], []
  );
  assert.deepEqual(items.map((i) => i.brief.id), ["old", "new"]);
});

// ── تختهٔ سناریو ────────────────────────────────────────────────────────────

test("all three scenarios always appear, even when empty", () => {
  const cards = buildScenarioBoard([]);
  assert.deepEqual(cards.map((c) => c.label), ["base", "upside", "downside"]);
  for (const c of cards) assert.equal(c.averageConfidence, null, `${c.label} باید null باشد نه ۰`);
});

test("an empty scenario reports null confidence, never zero", () => {
  const cards = buildScenarioBoard([claim({ kind: "SCENARIO", scenarioLabel: "base", confidence: 60 })]);
  assert.equal(cards[0].averageConfidence, 60);
  assert.equal(cards[1].averageConfidence, null);
  assert.equal(cards[2].averageConfidence, null);
});

test("non-scenario claims never leak into the scenario board", () => {
  const cards = buildScenarioBoard([
    claim({ kind: "FACT", scenarioLabel: null }),
    claim({ id: "c2", kind: "INFERENCE", scenarioLabel: null }),
  ]);
  for (const c of cards) assert.equal(c.claims.length, 0);
});

test("scenario confidence is averaged and rounded", () => {
  const cards = buildScenarioBoard([
    claim({ kind: "SCENARIO", scenarioLabel: "upside", confidence: 50 }),
    claim({ id: "c2", kind: "SCENARIO", scenarioLabel: "upside", confidence: 75 }),
  ]);
  assert.equal(cards[1].averageConfidence, 63);
});

// ── اثر بر سبدِ مرجع ────────────────────────────────────────────────────────

const effect = (over: Partial<EffectRow> = {}): EffectRow => ({
  analysisId: "b1",
  assetClass: "gold",
  direction: "increase",
  horizon: "short_term",
  confidence: 65,
  rationale: "دلیل",
  ...over,
});

/**
 * قاعدهٔ صریحِ مأموریت: **وزن‌های سبد جعل نمی‌شوند.** اگر وزنِ رسمی وجود ندارد،
 * UI باید «هنوز تعریف نشده» بگوید و تصمیم برای آرش باز بماند. صفر گذاشتن یعنی
 * ادعای «این دارایی در سبد نیست» — ادعایی که هیچ‌کس نکرده است.
 */
test("with no official portfolio version every weight stays null, never zero", () => {
  const v = buildPortfolioImpact([], [effect()]);
  assert.equal(v.hasOfficialWeights, false);
  for (const row of v.rows) assert.equal(row.weightPct, null, row.assetClass);
  assert.match(v.note, /تعریف‌نشده|نهایی ندارد/);
});

test("with official weights the declared ones appear and the rest stay null", () => {
  const v = buildPortfolioImpact(
    [{ assetClass: "gold", weightPct: 20 }, { assetClass: "cash", weightPct: 80 }],
    []
  );
  assert.equal(v.hasOfficialWeights, true);
  const byClass = Object.fromEntries(v.rows.map((r) => [r.assetClass, r.weightPct]));
  assert.equal(byClass.gold, 20);
  assert.equal(byClass.cash, 80);
  assert.equal(byClass.equity_ir, null, "دارایی‌ای که در نسخه نیست باید null بماند، نه ۰");
});

test("every asset class is listed even without an effect, with null direction", () => {
  const v = buildPortfolioImpact([], []);
  assert.equal(v.rows.length, 7);
  for (const row of v.rows) {
    assert.equal(row.direction, null);
    assert.equal(row.confidence, null);
    assert.ok(row.label.length > 0, "برچسبِ فارسی لازم است");
  }
});

test("an effect attaches to the right asset class only", () => {
  const v = buildPortfolioImpact([], [effect({ assetClass: "fx", direction: "decrease" })]);
  const fx = v.rows.find((r) => r.assetClass === "fx")!;
  const gold = v.rows.find((r) => r.assetClass === "gold")!;
  assert.equal(fx.direction, "decrease");
  assert.equal(gold.direction, null);
});

/** لایهٔ اجرا نداریم: هیچ‌جای این نما نباید قیمتِ هدف یا توصیهٔ خرید بسازد. */
test("the impact view carries no price target and no buy or sell wording", () => {
  const v = buildPortfolioImpact([{ assetClass: "gold", weightPct: 20 }], [effect()]);
  const text = JSON.stringify(v);
  assert.doesNotMatch(text, /قیمت هدف|سیگنال|توصیه|بخرید|بفروشید/);
});

// ── تمرین ───────────────────────────────────────────────────────────────────

const day = (i: number): RehearsalDay => ({
  rehearsalDate: `2026-08-${String(i).padStart(2, "0")}`,
  dayIndex: i,
  briefProduced: true,
  minutesToApproval: 30,
  absentSources: [],
  staleSources: [],
  humanCorrections: 0,
  rejectedConclusions: 0,
  missedEvents: 0,
});

test("an unstarted rehearsal is `not_started`, not a failing one", () => {
  const v = buildRehearsalView([]);
  assert.equal(v.gateStatus, "not_started");
  assert.equal(v.briefRate, null);
  assert.equal(v.remainingDays, 10);
});

test("nine real days is still in progress, and the tenth flips it", () => {
  const nine = Array.from({ length: 9 }, (_, i) => day(i + 1));
  const v9 = buildRehearsalView(nine);
  assert.equal(v9.gateStatus, "in_progress");
  assert.equal(v9.remainingDays, 1);

  const v10 = buildRehearsalView([...nine, day(10)]);
  assert.equal(v10.gateStatus, "ready_for_review");
  assert.equal(v10.remainingDays, 0);
});

/** حتی «آمادهٔ بازبینی» هم PASS نیست — تصمیمِ گیت با Command Center است. */
test("ready_for_review is never named pass", () => {
  const v = buildRehearsalView(Array.from({ length: 12 }, (_, i) => day(i + 1)));
  assert.equal(v.gateStatus, "ready_for_review");
  assert.doesNotMatch(JSON.stringify(v), /"pass"|PASS/);
});

// ── فارسی و RTL ─────────────────────────────────────────────────────────────

/**
 * هر دو تستِ زیر از یک **اسکرین‌شاتِ واقعی** آمدند، نه از بازبینیِ کد. صفحهٔ
 * تیره نشان داد که «۱ گزاره · ۱ بدون شاهد» به‌صورتِ «۱ گزاره ۱۰ بدون شاهد»
 * دیده می‌شود و پیامِ مسدودی رقمِ لاتین دارد. هیچ‌کدام با خواندنِ کد پیدا
 * نمی‌شد.
 */
test("a generated Persian sentence never contains a Latin digit", () => {
  const items = buildInbox(
    [brief({ id: "b", status: "pending_approval" })],
    [
      claim({ id: "x1", analysisId: "b", evidenceCount: 0 }),
      claim({ id: "x2", analysisId: "b", evidenceCount: 0 }),
      claim({ id: "x3", analysisId: "b", evidenceCount: 1 }),
    ],
    []
  );
  const reason = items[0].blockedReason ?? "";
  assert.doesNotMatch(reason, /[0-9]/, `رقمِ لاتین در متنِ فارسی: ${reason}`);
  assert.match(reason, /[۰-۹]/);
});

test("no view string uses a middle dot next to a number", () => {
  // «·» در RTL خنثی است و به رقمِ مجاورش می‌چسبد. ویرگولِ فارسی این ابهام را
  // ندارد. این گارد فقط رشته‌های تولیدشده را می‌سنجد؛ جداکنندهٔ ثابتِ متن
  // (مثلِ «بریفِ روز · تاریخ») مشکلی ندارد چون کنارِ رقم نیست.
  const items = buildInbox(
    [brief({ id: "b", status: "pending_approval" })],
    [claim({ analysisId: "b", evidenceCount: 0 })],
    []
  );
  for (const s of [items[0].blockedReason ?? "", buildPortfolioImpact([], []).note]) {
    assert.doesNotMatch(s, /[۰-۹0-9]\s*·|·\s*[۰-۹0-9]/, `جداکنندهٔ مبهم کنارِ رقم: ${s}`);
  }
});
