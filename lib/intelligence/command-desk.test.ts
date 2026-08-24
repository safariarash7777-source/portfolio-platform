import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCommandQuestions,
  buildDeskTriage,
  COMMAND_QUESTION_KEYS,
  type CommandQuestion,
  type CommandQuestionKey,
} from "./command-desk";
import { buildToday, buildInbox, buildScenarioBoard, buildPortfolioImpact, buildRehearsalView } from "./board";
import { buildDeskView, buildPanel, type DataState, type DeskSource } from "@/lib/desk/contracts";

const view = () => ({
  today: buildToday("2026-08-20", [], []),
  todayJalali: "۱۴۰۵/۰۵/۲۹",
  inbox: buildInbox([], [], []),
  scenarios: buildScenarioBoard([]),
  portfolio: buildPortfolioImpact([], []),
  rehearsal: buildRehearsalView([]),
  unavailableReason: null,
});

const source: DeskSource = {
  key: "ir_market_snapshots",
  table: "ir_market_snapshots",
  label: "اسنپ‌شات بازار",
  state: "ready",
  detail: "آخرین به‌روزرسانی ۱۰ دقیقه پیش",
  count: 1,
  ageMinutes: 10,
  observedAt: "2026-08-23T09:50:00.000Z",
  fetchedAt: "2026-08-23T10:00:00.000Z",
};

const desk = () => ({
  data: buildDeskView([
    buildPanel({ key: "today", links: [] }, [source]),
  ], new Date("2026-08-20T08:00:00Z")),
  loading: false,
  error: null,
});

test("the command desk always answers the six approved questions in order", () => {
  const questions = buildCommandQuestions(view(), desk());
  assert.deepEqual(questions.map((item) => item.key), COMMAND_QUESTION_KEYS);
  assert.deepEqual(questions.map((item) => item.order), [1, 2, 3, 4, 5, 6]);
  for (const item of questions) assert.match(item.question, /؟$/);
});

test("no daily brief remains empty and is never narrated as a quiet day", () => {
  const [happened, meaning] = buildCommandQuestions(view(), desk());
  assert.equal(happened.state, "empty");
  assert.match(happened.answer, /ثبت نشده/);
  assert.equal(meaning.state, "empty");
  assert.match(happened.detail, /آرام یکی نیست/);
});

test("market source failure is unavailable, never a healthy zero", () => {
  const questions = buildCommandQuestions(view(), { data: null, loading: false, error: "خواندن منبع مردود شد" });
  const market = questions.find((item) => item.key === "markets")!;
  assert.equal(market.state, "unavailable");
  assert.match(market.detail, /مردود/);
});

test("missing finalized portfolio is explicit and does not invent 70/15/15", () => {
  const portfolio = buildCommandQuestions(view(), desk()).find((item) => item.key === "portfolio")!;
  // «پیکربندی نشده»، نه یک هشدارِ عمومی: نبودِ نسخهٔ مصوب یک تصمیمِ نگرفتهٔ
  // مالک است و باید از دادهٔ کهنه یا خراب قابلِ تفکیک بماند.
  assert.equal(portfolio.state, "unconfigured");
  assert.match(portfolio.answer, /نهایی.*ثبت نشده/);
  assert.doesNotMatch(JSON.stringify(portfolio), /70|15|۷۰|۱۵/);
});

test("an empty review inbox is not proof that monitoring was complete", () => {
  const decisions = buildCommandQuestions(view(), desk()).find((item) => item.key === "decisions")!;
  assert.equal(decisions.state, "ready");
  assert.match(decisions.detail, /ادعایی نمی‌کند/);
});

test("the command overview never introduces forbidden execution language", () => {
  const text = JSON.stringify(buildCommandQuestions(view(), desk()));
  assert.doesNotMatch(text, /سیگنال|توصیه|بخرید|بفروشید|قیمت هدف/);
});

/* ── تریاژِ روز ────────────────────────────────────────────────────────────── */

const q = (key: CommandQuestionKey, state: DataState): CommandQuestion => ({
  key, order: 1, question: "س", answer: "پ", detail: "ج",
  state, facts: [], href: "#x", linkLabel: "ل",
});

test("خرابیِ داده بر بازبینیِ انسانی مقدم است", () => {
  // اگر فید خراب باشد، بقیهٔ پاسخ‌ها ممکن است بر پایهٔ چیزِ غلط ساخته شده باشند.
  const t = buildDeskTriage([q("markets", "unavailable"), q("decisions", "awaiting_review")]);
  assert.equal(t.firstLook?.key, "markets");
  assert.match(t.headline, /دادهٔ ناسالم/);
});

test("بینِ خرابی‌ها، «هیچ نمی‌دانیم» فوری‌تر از «کهنه» است", () => {
  const t = buildDeskTriage([q("scenarios", "stale"), q("markets", "unavailable"), q("meaning", "empty")]);
  assert.equal(t.firstLook?.key, "markets");
  assert.equal(t.dataFaults, 3);
});

test("بدونِ خرابی، صفِ بازبینی اول می‌آید", () => {
  const t = buildDeskTriage([q("portfolio", "unconfigured"), q("decisions", "awaiting_review")]);
  assert.equal(t.firstLook?.key, "decisions");
  assert.match(t.headline, /بازبینی/);
});

test("پیکربندیِ مالک فوریتِ روزانه ندارد ولی گم نمی‌شود", () => {
  const t = buildDeskTriage([q("portfolio", "unconfigured"), q("markets", "ready")]);
  assert.equal(t.unconfigured, 1);
  assert.equal(t.dataFaults, 0);
  assert.equal(t.firstLook?.key, "portfolio");
  assert.match(t.headline, /پیکربندی/);
});

test("روزِ تمیز چیزی برای نگاهِ اول ندارد و ادعای اضافه نمی‌کند", () => {
  const t = buildDeskTriage([q("markets", "ready"), q("decisions", "ready")]);
  assert.equal(t.firstLook, null);
  assert.equal(t.dataFaults, 0);
  assert.equal(t.awaitingReview, 0);
  // «هیچ خرابی نیست» — نه «همه‌چیز بررسی شد».
  assert.match(t.headline, /هیچ خرابی/);
  assert.doesNotMatch(t.headline, /کامل|همه‌چیز بررسی/);
});

test("تریاژ فقط می‌شمارد و عددِ تازه نمی‌سازد", () => {
  const items = [q("markets", "stale"), q("decisions", "awaiting_review"), q("portfolio", "unconfigured")];
  const t = buildDeskTriage(items);
  assert.equal(t.dataFaults + t.awaitingReview + t.unconfigured + t.loading, items.length);
});
