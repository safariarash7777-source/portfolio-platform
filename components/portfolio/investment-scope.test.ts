import { test } from "node:test";
import assert from "node:assert/strict";
import { mountFinancialForm } from "./financial-form-test-host";
import { postInvestmentScope } from "../../lib/portfolio/scopeHttp";

const holdingId = "11111111-1111-4111-8111-111111111111";
const receipt = { id: "22222222-2222-4222-8222-222222222222", scopeVersion: 1, holdingVersionId: holdingId, holdingVersion: 1, rulesVersion: "member-selected.v0.1", memberConfirmedAt: "2026-10-09T12:00:00Z", assignments: [{ positionKey: "gold", use: "allocatable" }], reused: false };
const mount = () => {
  const ui = mountFinancialForm("components/portfolio/InvestmentScopeWorkbench.tsx", { holdings: { id: holdingId, version: 1, positions: [{ positionKey: "gold", manualLabel: "طلای ساختگی", symbol: null, assetClass: "gold", qty: null, unit: "قلم", costBasis: null, asOf: "2026-10-09", ownershipPct: 50, valuationMode: "declared", declaredValue: 2000, valuationSource: "ساختگی", valuationAsOf: "2026-10-09", valuationStatus: "valid" }] }, storedTarget: null, priceRows: [], pricesFailed: false, scopeState: { status: "ready", review: null }, editable: true });
  const select = ui.find("select", () => true);
  (select.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "allocatable" } }); ui.render(); return ui;
};
const save = "محدودهٔ این نسخه";
const retryLabel = "بررسی دوبارهٔ همین ثبت";

for (const retry of [{ status: 401, nonJson: false }, { status: 403, nonJson: false }, { status: 429, nonJson: false }, { status: 404, nonJson: false }, { status: 408, nonJson: false }, { status: 400, nonJson: false }, { status: 400, nonJson: true }, { status: 409, nonJson: true }, { status: 409, nonJson: false }]) test(`scope actual handler: lost commit then ${retry.status}/${retry.nonJson ? "HTML" : "non-canonical JSON"} preserves original replay`, async () => {
  const prior = globalThis.fetch, bodies: string[] = []; let stored: string | null = null, writes = 0;
  globalThis.fetch = async (url, options) => {
    bodies.push(String(options?.body));
    if (bodies.length === 2) return retry.nonJson ? new Response("Synthetic gateway HTML", { status: retry.status }) : Response.json({ error: "Synthetic retry failure" }, { status: retry.status });
    const response = await postInvestmentScope(new Request(`http://localhost${url}`, options), async () => ({ async authenticate() { return { user: { id: "synthetic-owner" }, error: false }; }, async rpc(_name, args) { const serialized = JSON.stringify(args); if (stored !== null && stored !== serialized) return { data: null, error: { code: "PT409" } }; const reused = stored !== null; if (!reused) { stored = serialized; writes++; } return { data: { ...receipt, reused }, error: null }; } }));
    if (bodies.length === 1) throw new Error("Synthetic reply lost after commit"); return response;
  };
  try {
    const ui = mount(); await ui.submit(save); await ui.submit(retryLabel);
    assert.equal(bodies[1], bodies[0]); assert.equal(writes, 1); assert.equal(ui.refreshes, 0);
    const select = ui.find("select", () => true); assert.equal(select.props.disabled, true);
    (select.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "excluded" } }); ui.render();
    assert.equal(ui.find("select", () => true).props.value, "allocatable");
    await ui.submit(retryLabel); assert.equal(bodies[2], bodies[0]); assert.equal(writes, 1); assert.equal(ui.refreshes, 1);
    assert.match(ui.text(), /تأیید ثبت‌شدهٔ این نسخه/); assert.equal(ui.button(save).props.disabled, true);
  } finally { globalThis.fetch = prior; }
});

for (const outcome of ["HTML400", "JSON404", "wrong-scope-version", "wrong-holding", "wrong-assignments", "missing-reused"]) test(`scope actual handler: initial ${outcome} freezes until matching receipt`, async () => {
  const prior = globalThis.fetch, bodies: string[] = [];
  globalThis.fetch = async (_url, options) => {
    bodies.push(String(options?.body));
    if (bodies.length > 1) return Response.json({ ...receipt, reused: true });
    if (outcome === "HTML400") return new Response("Synthetic HTML", { status: 400 });
    if (outcome === "JSON404") return Response.json({ error: "Synthetic missing route" }, { status: 404 });
    return Response.json(outcome === "wrong-scope-version" ? { ...receipt, scopeVersion: 9 } : outcome === "wrong-holding" ? { ...receipt, holdingVersionId: receipt.id } : outcome === "wrong-assignments" ? { ...receipt, assignments: [{ positionKey: "gold", use: "excluded" }] } : { ...receipt, reused: undefined });
  };
  try { const ui = mount(); await ui.submit(save); assert.equal(ui.find("select", () => true).props.disabled, true); assert.equal(ui.refreshes, 0); await ui.submit(retryLabel); assert.equal(bodies[1], bodies[0]); assert.equal(ui.refreshes, 1); } finally { globalThis.fetch = prior; }
});

test("scope actual handler: definitive first rejection permits correction; canonical CAS preserves draft without rebasing", async () => {
  const prior = globalThis.fetch, bodies: string[] = [];
  globalThis.fetch = async (url, options) => {
    bodies.push(String(options?.body));
    return bodies.length === 1 ? Response.json({ error: "Synthetic rejection" }, { status: 400 }) : postInvestmentScope(new Request(`http://localhost${url}`, options), async () => ({ async authenticate() { return { user: { id: "synthetic-owner" }, error: false }; }, async rpc() { return { data: null, error: { code: "PT409" } }; } }));
  };
  try {
    const ui = mount(); await ui.submit(save); const select = ui.find("select", () => true); assert.equal(select.props.disabled, false);
    (select.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "excluded" } }); ui.render(); await ui.submit(save);
    assert.notEqual(JSON.parse(bodies[0]).client_token, JSON.parse(bodies[1]).client_token); assert.equal(JSON.parse(bodies[1]).base_scope_version, 0);
    assert.equal(ui.find("select", () => true).props.value, "excluded"); assert.equal(ui.button(save).props.disabled, true); assert.equal(ui.refreshes, 0);
    assert.equal(ui.find("a", element => element.props.href === "/dashboard/holdings").props.target, "_blank");
  } finally { globalThis.fetch = prior; }
});
