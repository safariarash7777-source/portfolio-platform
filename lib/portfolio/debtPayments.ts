import { cashFlowDay, cashFlowObject, cashFlowText, cashFlowUuid, validateCashFlowPeriod } from "./cashFlowApiContract";
import type { CashFlowPeriod } from "./cashFlow";

export interface DebtPaymentPayload {
  contractVersion: 1; paymentKey: string; holdingVersionId: string; debtKey: string; dueOn: string;
  cashFlowVersionId: string; entryKey: string; reference: string | null;
}
export interface DebtPaymentRequest {
  contractVersion: "debt-payment-request.v1"; expectedActorId: string; clientToken: string; baseVersion: number; period: CashFlowPeriod; payload: DebtPaymentPayload;
}
export interface DebtPaymentReceipt {
  contractVersion: "debt-payment-write.v1"; actorId: string; clientToken: string; id: string; sequence: number; version: number;
  canonicalContentHash: string; payload: DebtPaymentPayload; period: CashFlowPeriod; reused: boolean;
}
export interface DebtPaymentRecord {
  id: string; sequence: number; version: number; createdAt: string; payload: DebtPaymentPayload; period: CashFlowPeriod;
  amountToman: number; occurredOn: string; unit: "IRT"; sourceState: "current" | "stale" | "removed";
  latestForPayment: boolean; basisCurrent: boolean; allocation: null;
}
export interface DebtPaymentSelection { holdingVersionId: string; period: CashFlowPeriod; beforeSequence?: number }
export interface DebtPaymentsReady {
  contractVersion: "debt-payment-read.v1"; state: "ready"; actorId: string;
  basis: { id: string; version: number; latestId: string; latestVersion: number; historical: boolean };
  period: CashFlowPeriod; sourceVersion: { id: string; version: number } | null;
  installments: { debtKey: string; title: string; dueOn: string; installmentToman: number }[];
  sources: { entryKey: string; amountToman: number; occurredOn: string; unit: "IRT"; note: string | null }[];
  history: { items: DebtPaymentRecord[]; nextBeforeSequence: number | null }; writeAllowed: boolean;
}
export interface DebtPaymentsUnavailable {
  contractVersion: "debt-payment-read.v1"; state: "unavailable"; actorId: string; holdingVersionId: string;
  period: CashFlowPeriod; reason: "not_installed"; writeAllowed: false;
}
export type DebtPaymentsRead = DebtPaymentsReady | DebtPaymentsUnavailable;
export type DebtPaymentErrorCode = "INVALID_INPUT" | "AUTH_REQUIRED" | "AUTH_UNAVAILABLE" | "FORBIDDEN" | "ORIGIN_FORBIDDEN" | "UNAVAILABLE" | "READ_UNAVAILABLE" | "WRITE_UNAVAILABLE" | "CONFLICT" | "BODY_TOO_LARGE";
export interface DebtPaymentError { contractVersion: "debt-payment-error.v1"; state: "error"; code: DebtPaymentErrorCode; error: string }
export const DEBT_PAYMENT_BODY_LIMIT = 16_384;
export const debtPaymentStatus: Record<DebtPaymentErrorCode, number> = { INVALID_INPUT: 400, AUTH_REQUIRED: 401, AUTH_UNAVAILABLE: 503, FORBIDDEN: 403, ORIGIN_FORBIDDEN: 403, UNAVAILABLE: 409, READ_UNAVAILABLE: 503, WRITE_UNAVAILABLE: 503, CONFLICT: 409, BODY_TOO_LARGE: 413 };
const uuid = (value: unknown): string => { if (!cashFlowUuid(value)) throw Error("Invalid PF10 UUID"); return value.toLowerCase(); };
const integer = (value: unknown, min = 1, max = Number.MAX_SAFE_INTEGER): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) throw Error("Invalid PF10 integer"); return value;
};
const nullableText = (value: unknown, max: number): string | null => value === null || typeof value === "string" && !value.trim() ? null : cashFlowText(value, max);

export function validateDebtPaymentPayload(value: unknown): DebtPaymentPayload {
  const p = cashFlowObject(value, ["contractVersion", "paymentKey", "holdingVersionId", "debtKey", "dueOn", "cashFlowVersionId", "entryKey", "reference"]);
  if (p.contractVersion !== 1) throw Error("Invalid PF10 payload");
  return { contractVersion: 1, paymentKey: uuid(p.paymentKey), holdingVersionId: uuid(p.holdingVersionId), debtKey: cashFlowText(p.debtKey, 200), dueOn: cashFlowDay(p.dueOn), cashFlowVersionId: uuid(p.cashFlowVersionId), entryKey: cashFlowText(p.entryKey, 200), reference: nullableText(p.reference, 160) };
}
export function validateDebtPaymentRequest(value: unknown): DebtPaymentRequest {
  const r = cashFlowObject(value, ["contractVersion", "expectedActorId", "clientToken", "baseVersion", "period", "payload"]);
  if (r.contractVersion !== "debt-payment-request.v1") throw Error("Invalid PF10 request");
  return { contractVersion: r.contractVersion, expectedActorId: uuid(r.expectedActorId), clientToken: cashFlowText(r.clientToken, 200), baseVersion: integer(r.baseVersion, 0, 2_147_483_646), period: validateCashFlowPeriod(r.period), payload: validateDebtPaymentPayload(r.payload) };
}
export function validateDebtPaymentSelection(value: DebtPaymentSelection): DebtPaymentSelection {
  return { holdingVersionId: uuid(value.holdingVersionId), period: validateCashFlowPeriod(value.period), ...(value.beforeSequence === undefined ? {} : { beforeSequence: integer(value.beforeSequence) }) };
}
export function validateDebtPaymentReceipt(value: unknown, request: DebtPaymentRequest): DebtPaymentReceipt {
  const r = cashFlowObject(value, ["contractVersion", "actorId", "clientToken", "id", "sequence", "version", "canonicalContentHash", "payload", "period", "reused"]);
  const payload = validateDebtPaymentPayload(r.payload);
  const period = validateCashFlowPeriod(r.period);
  if (period.startOn !== request.period.startOn || period.endOn !== request.period.endOn) throw Error("PF10 receipt period mismatch");
  if (r.contractVersion !== "debt-payment-write.v1" || uuid(r.actorId) !== request.expectedActorId || r.clientToken !== request.clientToken || integer(r.version) !== request.baseVersion + 1 || JSON.stringify(payload) !== JSON.stringify(request.payload) || typeof r.canonicalContentHash !== "string" || !/^[a-f0-9]{64}$/.test(r.canonicalContentHash) || typeof r.reused !== "boolean") throw Error("PF10 receipt mismatch");
  return { contractVersion: r.contractVersion, actorId: request.expectedActorId, clientToken: request.clientToken, id: uuid(r.id), sequence: integer(r.sequence), version: Number(r.version), canonicalContentHash: r.canonicalContentHash, payload, period, reused: r.reused };
}
export function validateDebtPaymentRecord(value: unknown): DebtPaymentRecord {
  const r = cashFlowObject(value, ["id", "sequence", "version", "createdAt", "payload", "period", "amountToman", "occurredOn", "unit", "sourceState", "latestForPayment", "basisCurrent", "allocation"]);
  if (typeof r.createdAt !== "string" || !/^\d{4}-\d\d-\d\dT/.test(r.createdAt) || !Number.isFinite(Date.parse(r.createdAt)) || r.unit !== "IRT" || !["current", "stale", "removed"].includes(String(r.sourceState)) || typeof r.latestForPayment !== "boolean" || typeof r.basisCurrent !== "boolean" || r.allocation !== null) throw Error("Invalid PF10 record");
  const period = validateCashFlowPeriod(r.period), occurredOn = cashFlowDay(r.occurredOn);
  if (occurredOn < period.startOn || occurredOn > period.endOn) throw Error("Invalid PF10 record period");
  return { id: uuid(r.id), sequence: integer(r.sequence), version: integer(r.version, 1, 2_147_483_647), createdAt: r.createdAt, payload: validateDebtPaymentPayload(r.payload), period, amountToman: integer(r.amountToman, 0), occurredOn, unit: "IRT", sourceState: r.sourceState as DebtPaymentRecord["sourceState"], latestForPayment: r.latestForPayment, basisCurrent: r.basisCurrent, allocation: null };
}
export function validateDebtPaymentsRead(value: unknown, selection: DebtPaymentSelection, actorId?: string): DebtPaymentsRead {
  const state = value && typeof value === "object" ? (value as { state?: unknown }).state : null;
  const r = cashFlowObject(value, state === "unavailable" ? ["contractVersion", "state", "actorId", "holdingVersionId", "period", "reason", "writeAllowed"] : ["contractVersion", "state", "actorId", "basis", "period", "sourceVersion", "installments", "sources", "history", "writeAllowed"]);
  const actor = uuid(r.actorId), period = validateCashFlowPeriod(r.period);
  if (r.contractVersion !== "debt-payment-read.v1" || actorId !== undefined && actor !== actorId || period.startOn !== selection.period.startOn || period.endOn !== selection.period.endOn) throw Error("PF10 read context mismatch");
  if (state === "unavailable") {
    if (r.holdingVersionId !== selection.holdingVersionId || r.reason !== "not_installed" || r.writeAllowed !== false) throw Error("Invalid PF10 unavailable");
    return { contractVersion: "debt-payment-read.v1", state, actorId: actor, holdingVersionId: selection.holdingVersionId, period, reason: "not_installed", writeAllowed: false };
  }
  const b = cashFlowObject(r.basis, ["id", "version", "latestId", "latestVersion", "historical"]);
  const basis = { id: uuid(b.id), version: integer(b.version), latestId: uuid(b.latestId), latestVersion: integer(b.latestVersion), historical: b.historical as boolean };
  if (state !== "ready" || basis.id !== selection.holdingVersionId || basis.latestVersion < basis.version || typeof basis.historical !== "boolean" || basis.historical !== (basis.id !== basis.latestId) || basis.historical !== (basis.version !== basis.latestVersion) || r.writeAllowed !== !basis.historical) throw Error("Invalid PF10 basis");
  let sourceVersion: DebtPaymentsReady["sourceVersion"] = null;
  if (r.sourceVersion !== null) { const s = cashFlowObject(r.sourceVersion, ["id", "version"]); sourceVersion = { id: uuid(s.id), version: integer(s.version) }; }
  if (!Array.isArray(r.installments) || r.installments.length > 500 || !Array.isArray(r.sources) || r.sources.length > 500) throw Error("PF10 read bound exceeded");
  const installments = r.installments.map(value => {
    const i = cashFlowObject(value, ["debtKey", "title", "dueOn", "installmentToman"]);
    return { debtKey: cashFlowText(i.debtKey, 200), title: cashFlowText(i.title, 300), dueOn: cashFlowDay(i.dueOn), installmentToman: integer(i.installmentToman, 0) };
  });
  const sources = r.sources.map(value => {
    const s = cashFlowObject(value, ["entryKey", "amountToman", "occurredOn", "unit", "note"]), occurredOn = cashFlowDay(s.occurredOn);
    if (s.unit !== "IRT" || occurredOn < period.startOn || occurredOn > period.endOn) throw Error("PF10 source context invalid");
    return { entryKey: cashFlowText(s.entryKey, 200), amountToman: integer(s.amountToman, 0), occurredOn, unit: "IRT" as const, note: nullableText(s.note, 2000) };
  });
  if (new Set(installments.map(x => x.debtKey)).size !== installments.length || new Set(sources.map(x => x.entryKey)).size !== sources.length || sourceVersion === null && sources.length) throw Error("Invalid PF10 source set");
  const h = cashFlowObject(r.history, ["items", "nextBeforeSequence"]);
  if (!Array.isArray(h.items) || h.items.length > 50) throw Error("PF10 history bound exceeded");
  const items = h.items.map(validateDebtPaymentRecord), nextBeforeSequence = h.nextBeforeSequence === null ? null : integer(h.nextBeforeSequence);
  if (new Set(items.map(x => x.id)).size !== items.length || items.some((item, index) => index > 0 && item.sequence >= items[index - 1].sequence || selection.beforeSequence !== undefined && item.sequence >= selection.beforeSequence || item.basisCurrent !== (item.payload.holdingVersionId === basis.latestId) || basis.historical && item.payload.holdingVersionId !== basis.id) || nextBeforeSequence !== null && (items.length !== 50 || nextBeforeSequence !== items.at(-1)?.sequence)) throw Error("Invalid PF10 history cursor/context");
  return { contractVersion: "debt-payment-read.v1", state: "ready", actorId: actor, basis, period, sourceVersion, installments, sources, history: { items, nextBeforeSequence }, writeAllowed: !basis.historical };
}
export function declaredInstallmentTotal(items: readonly DebtPaymentRecord[], target: { holdingVersionId: string; debtKey: string; dueOn: string }): number | null {
  const selected = items.filter(item => item.latestForPayment && item.basisCurrent && item.sourceState === "current" && item.payload.holdingVersionId === target.holdingVersionId && item.payload.debtKey === target.debtKey && item.payload.dueOn === target.dueOn);
  if (!selected.length || new Set(selected.map(x => x.payload.paymentKey)).size !== selected.length) return null;
  const sum = selected.reduce((total, item) => total + BigInt(item.amountToman), BigInt(0));
  return sum <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(sum) : null;
}
