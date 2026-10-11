import test from "node:test";
import assert from "node:assert/strict";
import { saveRiskAssessment } from "./saveRiskAssessment";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const row = { id: "synthetic-row", total_score: 40, risk_category: "test", created_at: "2026-10-11T00:00:00Z" };

test("only a persisted risk row confirms saving; existing result is returned intact", async () => {
  assert.equal(await saveRiskAssessment(async () => ({ data: row, error: null })), row);
});

test("RLS/service errors and an empty returning response do not confirm success", async () => {
  for (const response of [{ data: row, error: { code: "42501" } }, { data: null, error: null }]) {
    assert.equal(await saveRiskAssessment(async () => response), null);
  }
});

test("a transport failure is surfaced as unconfirmed without automatic resubmission", async () => {
  let attempts = 0;
  const result = await saveRiskAssessment(async () => { attempts++; throw new Error("transport"); });
  assert.equal(result, null);
  assert.equal(attempts, 1);
});

// Execute the routed dashboard component's real handler, with SDK/React seams only.
function dashboard(response: Promise<{ data: typeof row | null; error: unknown }>) {
  const states: unknown[] = [null, true, false, false];
  const refs: { current: unknown }[] = [];
  let stateIndex = 0, refIndex = 0, inserts = 0, refreshes = 0;
  let payload: unknown;
  const loaded = { exports: {} as { default: (props: unknown) => unknown } };
  const jsx = (type: unknown, props: unknown) => ({ type, props });
  runInNewContext(ts.transpileModule(readFileSync(new URL("../../app/(protected)/dashboard/DashboardClient.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, { exports: loaded.exports, require: (name: string) => {
    if (name === "react") return {
      useState: (initial: unknown) => { const index = stateIndex++; if (states[index] === undefined) states[index] = initial; return [states[index], (value: unknown) => { states[index] = value; }]; },
      useRef: (initial: unknown) => { const index = refIndex++; return refs[index] ?? (refs[index] = { current: initial }); },
      useCallback: (fn: unknown) => fn,
    };
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (name === "next/navigation") return { useRouter: () => ({ refresh: () => refreshes++ }) };
    if (name === "@/components/dashboard/saveRiskAssessment") return { saveRiskAssessment };
    if (name === "@/lib/supabase/client") return { createClient: () => ({ from: (table: string) => {
      assert.equal(table, "risk_assessments");
      return { insert: (value: unknown) => { inserts++; payload = value; return { select: () => ({ maybeSingle: () => response }) }; } };
    } }) };
    if (name === "@/components/quiz/RiskProfileQuiz") return { default: "ExistingQuiz", __esModule: true };
    return { default: () => null, __esModule: true };
  } });
  const tree = loaded.exports.default({ userId: "synthetic-member", assessment: null }) as { props: { children: { type: unknown; props: { onComplete?: (s: number, c: string, a: Record<number, number>) => Promise<void> } }[] } };
  const complete = tree.props.children.find(child => child?.type === "ExistingQuiz")!.props.onComplete!;
  return { complete, states, refs, get inserts() { return inserts; }, get payload() { return payload; }, get refreshes() { return refreshes; } };
}

test("dashboard preserves failed answers and existing state, without logging or refreshing a false success", async () => {
  const ui = dashboard(Promise.resolve({ data: null, error: { code: "42501" } }));
  const answers = { 1: 3, 2: 4 };
  await ui.complete(7, "test", answers);
  assert.equal(ui.states[0], null);
  assert.equal(ui.states[1], true);
  assert.equal(ui.states[3], true);
  assert.deepEqual(JSON.parse(JSON.stringify(ui.refs[1].current)), { score: 7, category: "test", answers });
  assert.equal(ui.refreshes, 0);
});

test("dashboard appends using its authenticated member and blocks simultaneous duplicate submissions", async () => {
  let finish!: (value: { data: typeof row; error: null }) => void;
  const ui = dashboard(new Promise(resolve => { finish = resolve; }));
  const first = ui.complete(40, "test", { 1: 4 });
  await ui.complete(40, "test", { 1: 4 });
  assert.equal(ui.inserts, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(ui.payload)), { user_id: "synthetic-member", total_score: 40, risk_category: "test", answers_json: { 1: 4 } });
  finish({ data: row, error: null });
  await first;
  assert.equal(ui.states[0], row);
  assert.equal(ui.states[1], false);
  assert.equal(ui.refs[1].current, null);
  assert.equal(ui.refreshes, 1);
});
