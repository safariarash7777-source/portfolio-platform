import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCommandQuestions, COMMAND_QUESTION_KEYS } from "./command-desk";
import { buildToday, buildInbox, buildScenarioBoard, buildPortfolioImpact, buildRehearsalView } from "./board";
import { buildDeskView, buildPanel, type DeskSource } from "@/lib/desk/contracts";

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
  table: "ir_market_snapshots",
  label: "اسنپ‌شات بازار",
  state: "ready",
  detail: "آخرین به‌روزرسانی ۱۰ دقیقه پیش",
  count: 1,
  ageMinutes: 10,
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
  assert.equal(portfolio.state, "attention");
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
