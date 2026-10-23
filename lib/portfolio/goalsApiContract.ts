import { cashFlowObject as goalsObject, cashFlowText as goalsText, cashFlowUuid as goalsUuid, cashFlowDay as goalsDay } from "./cashFlowApiContract";
import { type Goal } from "./goals";
export { type Goal, goalProgress } from "./goals";
export { goalsObject, goalsText, goalsUuid };
export interface GoalsPayload { contractVersion: 1; goals: Goal[] }
export interface GoalsWriteRequest { contractVersion: "goals-request.v1"; expectedOwnerId: string; clientToken: string; baseVersion: number; payload: GoalsPayload }
export interface GoalsReceipt { contractVersion: "goals-write.v1"; ownerId: string; versionId: string; version: number; goalCount: number; reused: boolean; canonicalContentHash: string }
export interface GoalsRead {
 contractVersion: "goals-read.v1"; state: "ready" | "empty"; ownerId: string;
 snapshot: null | { id: string; version: number; createdAt: string; payload: GoalsPayload };
 latest: { state: "ready" | "error"; id: string | null; version: number | null };
 history: { state: "ready" | "error"; items: { id: string; version: number; createdAt: string }[]; nextBeforeVersion: number | null };
}
export type { CashFlowErrorCode as GoalsErrorCode, CashFlowApiError as GoalsApiError } from "./cashFlowApiContract";
import type { CashFlowErrorCode as GoalsErrorCode, CashFlowApiError as GoalsApiError } from "./cashFlowApiContract";
export const GOALS_BODY_LIMIT = 250_000;
export function validateGoalsPayload(value: unknown): GoalsPayload {
 const row = goalsObject(value, ["contractVersion", "goals"]);
 if (row.contractVersion !== 1 || !Array.isArray(row.goals) || row.goals.length > 50) throw new Error("Invalid goals payload");
 const keys = new Set<string>();
 const goals = row.goals.map((value): Goal => {
  const item = goalsObject(value, ["goalKey", "title", "targetAmountToman", "targetOn", "declaredSavedToman", "source", "note"]);
  const goalKey = goalsText(item.goalKey, 200), title = goalsText(item.title, 160), targetOn = goalsDay(item.targetOn);
  if (keys.has(goalKey)) throw new Error("Duplicate goal key"); keys.add(goalKey);
  if (typeof item.targetAmountToman !== "number" || !Number.isSafeInteger(item.targetAmountToman) || item.targetAmountToman <= 0) throw new Error("Invalid target amount");
  if (item.declaredSavedToman !== null && (typeof item.declaredSavedToman !== "number" || !Number.isSafeInteger(item.declaredSavedToman) || item.declaredSavedToman < 0)) throw new Error("Invalid saved amount");
  let source: Goal["source"] = null;
  if (item.source !== null) {
   const provenance = goalsObject(item.source, ["label", "observedOn"]), label = goalsText(provenance.label, 160);
   if (["unknown", "نامشخص", "-", "—"].includes(label.toLowerCase())) throw new Error("Unknown source");
   source = { label, observedOn: goalsDay(provenance.observedOn) };
  }
  if (item.declaredSavedToman !== null && source === null) throw new Error("Declared saving requires source");
  const note = item.note === null || typeof item.note === "string" && !item.note.trim() ? null : goalsText(item.note, 2000);
  return { goalKey, title, targetOn, targetAmountToman: item.targetAmountToman, declaredSavedToman: item.declaredSavedToman as number | null, source, note };
 });
 return { contractVersion: 1, goals };
}
export function validateGoalsWriteRequest(value: unknown): GoalsWriteRequest {
  const row = goalsObject(value, ["contractVersion", "expectedOwnerId", "clientToken", "baseVersion", "payload"]);
  if (row.contractVersion !== "goals-request.v1" || !goalsUuid(row.expectedOwnerId) || !Number.isInteger(row.baseVersion) || (row.baseVersion as number) < 0 || (row.baseVersion as number) >= 2_147_483_647) throw new Error("Invalid goals request");
  return { contractVersion: "goals-request.v1", expectedOwnerId: row.expectedOwnerId, clientToken: goalsText(row.clientToken, 200), baseVersion: row.baseVersion as number, payload: validateGoalsPayload(row.payload) };
}
export function validateGoalsReceipt(value: unknown, request: GoalsWriteRequest): GoalsReceipt {
  const row = goalsObject(value, ["contractVersion", "ownerId", "versionId", "version", "goalCount", "reused", "canonicalContentHash"]);
  if (row.contractVersion !== "goals-write.v1" || row.ownerId !== request.expectedOwnerId || !goalsUuid(row.versionId) || row.version !== request.baseVersion + 1 || row.goalCount !== request.payload.goals.length || typeof row.reused !== "boolean" || typeof row.canonicalContentHash !== "string" || !/^[a-f0-9]{64}$/.test(row.canonicalContentHash)) throw new Error("Invalid goals receipt");
  return row as unknown as GoalsReceipt;
}
const positiveVersion = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 2_147_483_647;
function metadata(value: unknown): { id: string; version: number; createdAt: string } {
  const row = goalsObject(value, ["id", "version", "createdAt"]);
  if (!goalsUuid(row.id) || !positiveVersion(row.version) || typeof row.createdAt !== "string" || !/^\d{4}-\d\d-\d\dT/.test(row.createdAt) || !Number.isFinite(Date.parse(row.createdAt))) throw new Error("Invalid goals metadata");
  return { id: row.id, version: row.version, createdAt: row.createdAt };
}
/** Validate independent read data and bind the selected snapshot to its requested context. */
export function validateGoalsRead(value: unknown, expected: { version?: string; beforeVersion?: number; ownerId?: string }): GoalsRead {
  const row = goalsObject(value, ["contractVersion", "state", "ownerId", "snapshot", "latest", "history"]);
  if (row.contractVersion !== "goals-read.v1" || !goalsUuid(row.ownerId) || expected.ownerId !== undefined && expected.ownerId !== row.ownerId) throw new Error("Invalid goals read context");
  const latest = goalsObject(row.latest, ["state", "id", "version"]);
  if (latest.state === "error") { if (latest.id !== null || latest.version !== null) throw new Error("Invalid latest error"); }
  else if (latest.state !== "ready" || !(latest.version === 0 && latest.id === null || positiveVersion(latest.version) && goalsUuid(latest.id))) throw new Error("Invalid goals latest");
  const history = goalsObject(row.history, ["state", "items", "nextBeforeVersion"]);
  if (!Array.isArray(history.items) || history.items.length > 20) throw new Error("Invalid goals history");
  const items = history.items.map(metadata);
  if (history.state === "error") { if (items.length || history.nextBeforeVersion !== null) throw new Error("Invalid history error"); }
  else if (history.state !== "ready" || items.some((item, index) => index > 0 && item.version >= items[index - 1].version || expected.beforeVersion !== undefined && item.version >= expected.beforeVersion) || new Set(items.map(item => item.id)).size !== items.length || history.nextBeforeVersion !== null && (items.length !== 20 || history.nextBeforeVersion !== items.at(-1)?.version)) throw new Error("Invalid history cursor/order");
  if (latest.state === "ready" && items.some(item => item.version > (latest.version as number) || item.version === latest.version && item.id !== latest.id)) throw new Error("History/latest mismatch");
  let snapshot: GoalsRead["snapshot"] = null;
  if (row.state === "empty") {
    if (expected.version || row.snapshot !== null || latest.state !== "ready" || latest.version !== 0 || history.state !== "ready" || items.length || history.nextBeforeVersion !== null) throw new Error("Invalid goals empty state");
  } else if (row.state === "ready") {
    const selected = goalsObject(row.snapshot, ["id", "version", "createdAt", "payload"]);
    const info = metadata({ id: selected.id, version: selected.version, createdAt: selected.createdAt }), payload = validateGoalsPayload(selected.payload);
    if (expected.version !== undefined && info.id !== expected.version || latest.state === "ready" && ((latest.version as number) < info.version || latest.version === info.version && latest.id !== info.id) || expected.version === undefined && (latest.state !== "ready" || latest.id !== info.id || latest.version !== info.version)) throw new Error("Invalid selected goals version");
    snapshot = { ...info, payload };
    if (items.some(item => item.version === info.version && item.id !== info.id)) throw new Error("History/selected mismatch");
  } else throw new Error("Invalid goals state");
  return { contractVersion: "goals-read.v1", state: row.state, ownerId: row.ownerId, snapshot,
    latest: latest as unknown as GoalsRead["latest"], history: { state: history.state as "ready" | "error", items, nextBeforeVersion: history.nextBeforeVersion as number | null } };
}
export function validateGoalsError(value: unknown, status: number): GoalsApiError | null {
  const codes: Record<number, readonly GoalsErrorCode[]> = { 400: ["INVALID_INPUT"], 401: ["AUTH_REQUIRED"], 403: ["FORBIDDEN", "OWNER_CHANGED", "ORIGIN_FORBIDDEN"], 404: ["NOT_FOUND"], 409: ["CONFLICT"], 413: ["BODY_TOO_LARGE"], 429: ["RATE_LIMITED"], 503: ["AUTH_UNAVAILABLE", "READ_UNAVAILABLE", "WRITE_UNAVAILABLE"] };
  try {
    const row = goalsObject(value, ["state", "code", "error"]);
    if (row.state !== "error" || typeof row.code !== "string" || !codes[status]?.includes(row.code as GoalsErrorCode) || typeof row.error !== "string" || !row.error.trim() || row.error.length > 500) return null;
    return row as unknown as GoalsApiError;
  } catch { return null; }
}
