import { cashFlowObject, cashFlowUuid, cashFlowDay } from "./cashFlowApiContract";
export interface InstallmentPaymentRequest {
  expectedOwnerId: string; clientToken: string; baseVersion: number;
  paymentKey: string; action: "record" | "void"; holdingVersionId: string;
  debtKey: string; cashVersionId: string; entryKey: string;
}
export function validateInstallmentRequest(value: unknown): InstallmentPaymentRequest {
  const r = cashFlowObject(value, ["expectedOwnerId", "clientToken", "baseVersion", "paymentKey", "action", "holdingVersionId", "debtKey", "cashVersionId", "entryKey"]);
  for (const k of ["expectedOwnerId", "paymentKey", "holdingVersionId", "cashVersionId"]) if (!cashFlowUuid(r[k])) throw Error("invalid_identity");
  for (const k of ["clientToken", "debtKey", "entryKey"]) if (typeof r[k] !== "string" || !r[k].trim() || r[k].length > 200) throw Error("invalid_key");
  if (!Number.isSafeInteger(r.baseVersion) || Number(r.baseVersion) < 0 || Number(r.baseVersion) > 2147483646 || !["record", "void"].includes(String(r.action))) throw Error("invalid_version_or_action");
  return r as unknown as InstallmentPaymentRequest;
}
export interface InstallmentPayment {
  id: string; version: number; payment_key: string; action: "record" | "void";
  debt_key: string; due_on: string; installment_toman: number; amount_toman: number;
  principal_toman: null; interest_toman: null; cash_matches: boolean;
}
/** This sums cash allocations only; neither cash-flow nor debt balances are changed. */
export function installmentTotals(rows: readonly InstallmentPayment[]) {
  const latest = new Map<string, InstallmentPayment>();
  for (const r of rows) {
    if (!cashFlowUuid(r.id) || !cashFlowUuid(r.payment_key) || !Number.isSafeInteger(r.version) || r.version < 1 || !["record", "void"].includes(r.action) || typeof r.cash_matches !== "boolean" || r.principal_toman !== null || r.interest_toman !== null) throw Error("invalid_payment");
    cashFlowDay(r.due_on);
    for (const n of [r.installment_toman, r.amount_toman]) if (!Number.isSafeInteger(n) || n <= 0) throw Error("invalid_amount");
    const prev = latest.get(r.payment_key); if (prev?.version === r.version) throw Error("duplicate_payment_version");
    if (!prev || r.version > prev.version) latest.set(r.payment_key, r);
  }
  const groups = new Map<string, { debtKey: string; dueOn: string; dueToman: number; paidToman: number | null; remainingToman: number | null; needsReconciliation: boolean }>();
  for (const r of latest.values()) {
    if (r.action === "void") continue;
    const key = JSON.stringify([r.debt_key, r.due_on]);
    const g = groups.get(key) ?? { debtKey: r.debt_key, dueOn: r.due_on, dueToman: r.installment_toman, paidToman: 0, remainingToman: null, needsReconciliation: false };
    if (g.dueToman !== r.installment_toman || !r.cash_matches) g.needsReconciliation = true;
    const sum = (g.paidToman ?? 0) + r.amount_toman;
    if (!Number.isSafeInteger(sum)) throw Error("unsafe_payment_total");
    g.paidToman = sum; groups.set(key, g);
  }
  for (const g of groups.values()) {
    if (g.needsReconciliation || g.paidToman! > g.dueToman) { g.needsReconciliation = true; g.paidToman = null; g.remainingToman = null; }
    else g.remainingToman = g.dueToman - g.paidToman!;
  }
  return [...groups.values()];
}

export interface PaymentRead { ownerId: string; version: number; payments: (InstallmentPayment & { request: InstallmentPaymentRequest; client_token: string })[] }
export function validatePaymentRead(value: unknown, owner: string): PaymentRead {
 const r=value as PaymentRead;
 if (!r || r.ownerId!==owner || !Number.isSafeInteger(r.version) || r.version<0 || !Array.isArray(r.payments) || r.payments.length!==r.version || r.payments.length>500) throw Error("invalid_read");
 r.payments.forEach((p,i)=>{if(p.version!==i+1 || p.request.expectedOwnerId!==owner || p.client_token!==p.request.clientToken)throw Error("invalid_read");validateInstallmentRequest(p.request);});
 installmentTotals(r.payments);return r;
}
export function samePaymentRequest(a: InstallmentPaymentRequest,b: InstallmentPaymentRequest) { return Object.keys(a).length===Object.keys(b).length && (Object.keys(a) as (keyof InstallmentPaymentRequest)[]).every(k=>a[k]===b[k]); }
