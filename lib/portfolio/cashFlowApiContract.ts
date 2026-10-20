import { buildCashFlow, type CashFlowCoverage, type CashFlowEntry, type CashFlowInput, type CashFlowPeriod, type CashFlowReport } from "./cashFlow";

type WithoutOwner<T> = T extends unknown ? Omit<T, "ownerId"> : never;
export interface CashFlowPayload {
  contractVersion: 1;
  period: CashFlowPeriod;
  accountDefinitions: { accountKey: string; label: string }[];
  scopeAccountKeys: string[];
  opening: CashFlowInput["opening"];
  coverage: Record<"planned" | "actual", CashFlowCoverage & { memberAffirmed: boolean }>;
  entries: WithoutOwner<CashFlowEntry>[];
}
export interface CashFlowWriteRequest {
  contractVersion: "cash-flow-request.v1"; expectedOwnerId: string; clientToken: string; baseVersion: number; payload: CashFlowPayload;
}
export interface CashFlowReceipt {
  contractVersion: "cash-flow-write.v1"; ownerId: string; versionId: string; version: number;
  entryCount: number; reused: boolean; canonicalContentHash: string;
}
export interface CashFlowRead {
  contractVersion: "cash-flow-read.v1"; state: "ready" | "empty"; ownerId: string; period: CashFlowPeriod;
  snapshot: null | { id: string; version: number; createdAt: string; payload: CashFlowPayload };
  report: CashFlowReport | null;
  latest: { state: "ready" | "error"; id: string | null; version: number | null };
  history: { state: "ready" | "error"; items: { id: string; version: number; createdAt: string }[]; nextBeforeVersion: number | null };
}
export type CashFlowErrorCode = "INVALID_INPUT" | "AUTH_REQUIRED" | "FORBIDDEN" | "OWNER_CHANGED" | "ORIGIN_FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "BODY_TOO_LARGE" | "RATE_LIMITED" | "AUTH_UNAVAILABLE" | "READ_UNAVAILABLE" | "WRITE_UNAVAILABLE";
export interface CashFlowApiError { state: "error"; code: CashFlowErrorCode; error: string }

export const CASH_FLOW_BODY_LIMIT = 1_000_000;
export function cashFlowObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid cash-flow object");
  const result = value as Record<string, unknown>;
  if (Object.keys(result).length !== keys.length || keys.some(key => !Object.hasOwn(result, key))) throw new Error("Invalid cash-flow keys");
  return result;
}
export function cashFlowText(value: unknown, max: number): string {
  if (typeof value !== "string" || !value.trim() || [...value.trim()].length > max || value.includes("\0")) throw new Error("Invalid cash-flow text");
  return value.trim();
}
export function cashFlowUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
export function cashFlowDay(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000") || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error("Invalid cash-flow day");
  return value;
}
export function validateCashFlowPeriod(value: unknown): CashFlowPeriod {
  const row = cashFlowObject(value, ["startOn", "endOn"]);
  const startOn = cashFlowDay(row.startOn), endOn = cashFlowDay(row.endOn);
  const days = (Date.parse(endOn) - Date.parse(startOn)) / 86_400_000;
  if (days < 0 || days > 365) throw new Error("Invalid cash-flow period");
  return { startOn, endOn };
}
function amount(value: unknown, signed = false): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || (!signed && value < 0)) throw new Error("Invalid cash-flow amount");
  return value;
}
function source(value: unknown): CashFlowCoverage["source"] {
  if (value === null) return null;
  const row = cashFlowObject(value, ["label", "observedOn"]), label = cashFlowText(row.label, 160);
  if (["unknown", "نامشخص", "-", "—"].includes(label.toLowerCase())) throw new Error("Unknown cash-flow source");
  return { label, observedOn: cashFlowDay(row.observedOn) };
}
const nullableText = (value: unknown, max: number): string | null => value === null || typeof value === "string" && !value.trim() ? null : cashFlowText(value, max);
/** Browser/server shape guard; SQL remains the authoritative ownership/transaction boundary. */
export function validateCashFlowPayload(value: unknown): CashFlowPayload {
  const row = cashFlowObject(value, ["contractVersion", "period", "accountDefinitions", "scopeAccountKeys", "opening", "coverage", "entries"]);
  if (row.contractVersion !== 1) throw new Error("Invalid cash-flow contract");
  const period = validateCashFlowPeriod(row.period);
  if (!Array.isArray(row.accountDefinitions) || row.accountDefinitions.length < 1 || row.accountDefinitions.length > 50) throw new Error("Invalid cash-flow accounts");
  const accountDefinitions = row.accountDefinitions.map(value => { const account = cashFlowObject(value, ["accountKey", "label"]); return { accountKey: cashFlowText(account.accountKey, 200), label: cashFlowText(account.label, 160) }; });
  const keys = new Set(accountDefinitions.map(account => account.accountKey));
  if (keys.size !== accountDefinitions.length || !Array.isArray(row.scopeAccountKeys) || row.scopeAccountKeys.length < 1 || row.scopeAccountKeys.length > 50) throw new Error("Invalid cash-flow scope");
  const scopeAccountKeys = row.scopeAccountKeys.map(value => cashFlowText(value, 200));
  if (new Set(scopeAccountKeys).size !== scopeAccountKeys.length || scopeAccountKeys.some(key => !keys.has(key))) throw new Error("Invalid cash-flow scope references");
  const coverageRow = cashFlowObject(row.coverage, ["planned", "actual"]);
  const lane = (basis: "planned" | "actual"): CashFlowPayload["coverage"]["planned"] => {
    const item = cashFlowObject(coverageRow[basis], ["status", "memberAffirmed", "source"]);
    if (item.status !== "unknown" && item.status !== "partial" && item.status !== "complete" || typeof item.memberAffirmed !== "boolean") throw new Error("Invalid cash-flow coverage");
    const provenance = source(item.source);
    if (item.status === "complete" && (!item.memberAffirmed || !provenance)) throw new Error("Unaffirmed complete coverage");
    return { status: item.status, memberAffirmed: item.memberAffirmed, source: provenance };
  };
  const coverage = { planned: lane("planned"), actual: lane("actual") };
  let opening: CashFlowPayload["opening"] = null;
  if (row.opening !== null) {
    const item = cashFlowObject(row.opening, ["amountToman", "atStartOn", "source"]), atStartOn = item.atStartOn === null ? null : cashFlowDay(item.atStartOn);
    if (atStartOn !== null && atStartOn !== period.startOn) throw new Error("Invalid opening date");
    opening = { amountToman: amount(item.amountToman, true), atStartOn, source: source(item.source) };
  }
  if (!Array.isArray(row.entries) || row.entries.length > 500) throw new Error("Invalid cash-flow entries");
  const entryKeys = new Set<string>();
  const entries: CashFlowPayload["entries"] = row.entries.map(value => {
    if (!value || typeof value !== "object") throw new Error("Invalid cash-flow entry");
    const kind = (value as Record<string, unknown>).kind;
    const item = cashFlowObject(value, ["entryKey", "basis", "kind", "amountToman", "occurredOn", "source", "category", "note", ...(kind === "transfer" ? ["fromAccountKey", "toAccountKey"] : ["accountKey"])]);
    if (kind !== "income" && kind !== "expense" && kind !== "transfer" || item.basis !== "planned" && item.basis !== "actual") throw new Error("Invalid cash-flow event kind");
    const entryKey = cashFlowText(item.entryKey, 200), occurredOn = item.occurredOn === null ? null : cashFlowDay(item.occurredOn);
    if (entryKeys.has(entryKey) || occurredOn !== null && (occurredOn < period.startOn || occurredOn > period.endOn)) throw new Error("Duplicate/outside cash-flow event");
    entryKeys.add(entryKey);
    const common = { entryKey, basis: item.basis, amountToman: amount(item.amountToman), occurredOn, source: source(item.source), category: nullableText(item.category, 160), note: nullableText(item.note, 2000) };
    if (coverage[item.basis].status === "complete" && (common.amountToman === null || occurredOn === null || common.source === null)) throw new Error("Unknown complete cash-flow event");
    if (kind === "transfer") {
      const fromAccountKey = cashFlowText(item.fromAccountKey, 200), toAccountKey = cashFlowText(item.toAccountKey, 200);
      if (fromAccountKey === toAccountKey || !keys.has(fromAccountKey) || !keys.has(toAccountKey)) throw new Error("Invalid transfer references");
      return { ...common, basis: item.basis, kind, fromAccountKey, toAccountKey };
    }
    const accountKey = cashFlowText(item.accountKey, 200);
    if (!keys.has(accountKey)) throw new Error("Invalid account reference");
    return { ...common, basis: item.basis, kind, accountKey };
  });
  return { contractVersion: 1, period, accountDefinitions, scopeAccountKeys, opening, coverage, entries };
}
export function validateCashFlowWriteRequest(value: unknown): CashFlowWriteRequest {
  const row = cashFlowObject(value, ["contractVersion", "expectedOwnerId", "clientToken", "baseVersion", "payload"]);
  if (row.contractVersion !== "cash-flow-request.v1" || !cashFlowUuid(row.expectedOwnerId) || !Number.isInteger(row.baseVersion) || (row.baseVersion as number) < 0 || (row.baseVersion as number) >= 2_147_483_647) throw new Error("Invalid cash-flow request");
  return { contractVersion: "cash-flow-request.v1", expectedOwnerId: row.expectedOwnerId, clientToken: cashFlowText(row.clientToken, 200), baseVersion: row.baseVersion as number, payload: validateCashFlowPayload(row.payload) };
}
export function cashFlowReport(payload: CashFlowPayload, ownerId: string): CashFlowReport {
  return buildCashFlow({ period: payload.period, scope: { ownerId, accountKeys: payload.scopeAccountKeys }, readState: "ready", opening: payload.opening, coverage: payload.coverage, entries: payload.entries.map(entry => ({ ...entry, ownerId })) });
}
export function validateCashFlowReceipt(value: unknown, request: CashFlowWriteRequest): CashFlowReceipt {
  const row = cashFlowObject(value, ["contractVersion", "ownerId", "versionId", "version", "entryCount", "reused", "canonicalContentHash"]);
  if (row.contractVersion !== "cash-flow-write.v1" || row.ownerId !== request.expectedOwnerId || !cashFlowUuid(row.versionId) || row.version !== request.baseVersion + 1 || row.entryCount !== request.payload.entries.length || typeof row.reused !== "boolean" || typeof row.canonicalContentHash !== "string" || !/^[a-f0-9]{64}$/.test(row.canonicalContentHash)) throw new Error("Invalid cash-flow receipt");
  return row as unknown as CashFlowReceipt;
}
const positiveVersion = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 2_147_483_647;
function metadata(value: unknown): { id: string; version: number; createdAt: string } {
  const row = cashFlowObject(value, ["id", "version", "createdAt"]);
  if (!cashFlowUuid(row.id) || !positiveVersion(row.version) || typeof row.createdAt !== "string" || !/^\d{4}-\d\d-\d\dT/.test(row.createdAt) || !Number.isFinite(Date.parse(row.createdAt))) throw new Error("Invalid cash-flow metadata");
  return { id: row.id, version: row.version, createdAt: row.createdAt };
}
/** Validate independent read data; always rebuild the report with the one canonical calculator. */
export function validateCashFlowRead(value: unknown, expected: { period: CashFlowPeriod; version?: string; beforeVersion?: number; ownerId?: string }): CashFlowRead {
  const row = cashFlowObject(value, ["contractVersion", "state", "ownerId", "period", "snapshot", "report", "latest", "history"]);
  const period = validateCashFlowPeriod(row.period);
  if (row.contractVersion !== "cash-flow-read.v1" || !cashFlowUuid(row.ownerId) || expected.ownerId !== undefined && expected.ownerId !== row.ownerId || period.startOn !== expected.period.startOn || period.endOn !== expected.period.endOn) throw new Error("Invalid cash-flow read context");
  const latest = cashFlowObject(row.latest, ["state", "id", "version"]);
  if (latest.state === "error") { if (latest.id !== null || latest.version !== null) throw new Error("Invalid latest error"); }
  else if (latest.state !== "ready" || !(latest.version === 0 && latest.id === null || positiveVersion(latest.version) && cashFlowUuid(latest.id))) throw new Error("Invalid cash-flow latest");
  const history = cashFlowObject(row.history, ["state", "items", "nextBeforeVersion"]);
  if (!Array.isArray(history.items) || history.items.length > 20) throw new Error("Invalid cash-flow history");
  const items = history.items.map(metadata);
  if (history.state === "error") { if (items.length || history.nextBeforeVersion !== null) throw new Error("Invalid history error"); }
  else if (history.state !== "ready" || items.some((item, index) => index > 0 && item.version >= items[index - 1].version || expected.beforeVersion !== undefined && item.version >= expected.beforeVersion) || new Set(items.map(item => item.id)).size !== items.length || history.nextBeforeVersion !== null && (items.length !== 20 || history.nextBeforeVersion !== items.at(-1)?.version)) throw new Error("Invalid history cursor/order");
  let snapshot: CashFlowRead["snapshot"] = null, report: CashFlowReport | null = null;
  if (row.state === "empty") {
    if (expected.version || row.snapshot !== null || row.report !== null || latest.state !== "ready" || latest.version !== 0 || history.state !== "ready" || items.length || history.nextBeforeVersion !== null) throw new Error("Invalid cash-flow empty state");
  } else if (row.state === "ready") {
    const selected = cashFlowObject(row.snapshot, ["id", "version", "createdAt", "payload"]);
    const info = metadata({ id: selected.id, version: selected.version, createdAt: selected.createdAt }), payload = validateCashFlowPayload(selected.payload);
    if (expected.version !== undefined && info.id !== expected.version || payload.period.startOn !== period.startOn || payload.period.endOn !== period.endOn || latest.state === "ready" && ((latest.version as number) < info.version || latest.version === info.version && latest.id !== info.id) || expected.version === undefined && (latest.state !== "ready" || latest.id !== info.id || latest.version !== info.version)) throw new Error("Invalid selected cash-flow version");
    snapshot = { ...info, payload }; report = cashFlowReport(payload, row.ownerId);
    if (stableJson(row.report) !== stableJson(report)) throw new Error("Invalid cash-flow report");
  } else throw new Error("Invalid cash-flow state");
  return { contractVersion: "cash-flow-read.v1", state: row.state, ownerId: row.ownerId, period, snapshot, report,
    latest: latest as unknown as CashFlowRead["latest"], history: { state: history.state as "ready" | "error", items, nextBeforeVersion: history.nextBeforeVersion as number | null } };
}
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_, item) => item !== null && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
}
export function validateCashFlowError(value: unknown, status: number): CashFlowApiError | null {
  const codes: Record<number, readonly CashFlowErrorCode[]> = { 400: ["INVALID_INPUT"], 401: ["AUTH_REQUIRED"], 403: ["FORBIDDEN", "OWNER_CHANGED", "ORIGIN_FORBIDDEN"], 404: ["NOT_FOUND"], 409: ["CONFLICT"], 413: ["BODY_TOO_LARGE"], 429: ["RATE_LIMITED"], 503: ["AUTH_UNAVAILABLE", "READ_UNAVAILABLE", "WRITE_UNAVAILABLE"] };
  try {
    const row = cashFlowObject(value, ["state", "code", "error"]);
    if (row.state !== "error" || typeof row.code !== "string" || !codes[status]?.includes(row.code as CashFlowErrorCode) || typeof row.error !== "string" || !row.error.trim() || row.error.length > 500) return null;
    return row as unknown as CashFlowApiError;
  } catch { return null; }
}
