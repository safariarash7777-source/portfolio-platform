import { withDeadline } from "../deadline";
import { cashFlowObject } from "./cashFlowApiContract";
import { DEBT_PAYMENT_BODY_LIMIT, debtPaymentStatus, validateDebtPaymentReceipt, validateDebtPaymentRequest, validateDebtPaymentSelection, validateDebtPaymentsRead, type DebtPaymentError, type DebtPaymentReceipt, type DebtPaymentRequest, type DebtPaymentSelection, type DebtPaymentsRead } from "./debtPayments";

export interface DebtPaymentAttempt { readonly body: string; readonly actorId: string }
export type DebtPaymentOutcome = { status: "confirmed"; receipt: DebtPaymentReceipt } | { status: "rejected" | "conflict"; error: DebtPaymentError } | { status: "unknown"; message: string };
const endpoint = "/api/personal-finance/debt-payments";
const unknown = (): DebtPaymentOutcome => ({ status: "unknown", message: "نتیجهٔ ثبت مشخص نیست؛ فرم و همان درخواست حفظ شدند. ابتدا رسید همین ثبت را بازخوانی کنید." });
function canonicalError(value: unknown, status: number): DebtPaymentError | null {
  try {
    const e = cashFlowObject(value, ["contractVersion", "state", "code", "error"]);
    if (e.contractVersion !== "debt-payment-error.v1" || e.state !== "error" || typeof e.code !== "string" || !Object.hasOwn(debtPaymentStatus, e.code) || debtPaymentStatus[e.code as DebtPaymentError["code"]] !== status || typeof e.error !== "string" || !e.error.trim()) return null;
    return e as unknown as DebtPaymentError;
  } catch { return null; }
}
export function createDebtPaymentAttempt(input: DebtPaymentRequest): DebtPaymentAttempt {
  const request = validateDebtPaymentRequest(input), body = JSON.stringify(request);
  if (new TextEncoder().encode(body).length > DEBT_PAYMENT_BODY_LIMIT) throw Error("درخواست بیش از حد مجاز است.");
  return Object.freeze({ body, actorId: request.expectedActorId });
}
export async function readDebtPayments(selection: DebtPaymentSelection, options: { actorId?: string; transport?: typeof fetch; signal?: AbortSignal } = {}): Promise<{ status: "ready"; data: DebtPaymentsRead } | { status: "error"; message: string }> {
  try {
    const selected = validateDebtPaymentSelection(selection), query = new URLSearchParams({ holdingVersionId: selected.holdingVersionId, ...selected.period });
    if (selected.beforeSequence !== undefined) query.set("beforeSequence", String(selected.beforeSequence));
    return await withDeadline(async signal => {
      const response = await (options.transport ?? fetch)(`${endpoint}?${query}`, { cache: "no-store", credentials: "same-origin", signal });
      const value: unknown = await response.json();
      if (response.status !== 200) return { status: "error", message: canonicalError(value, response.status)?.error ?? "پاسخ خواندن قابل تأیید نیست." };
      return { status: "ready", data: validateDebtPaymentsRead(value, selected, options.actorId) };
    }, 10_000, options.signal);
  } catch { return { status: "error", message: "خواندن کامل اعلام پرداخت انجام نشد؛ ثبت تازه بسته است." }; }
}
export async function recoverDebtPayment(attempt: DebtPaymentAttempt, options: { actorId: string | null; transport?: typeof fetch }): Promise<DebtPaymentOutcome> {
  if (options.actorId !== attempt.actorId) return unknown();
  try {
    const request = validateDebtPaymentRequest(JSON.parse(attempt.body));
    return await withDeadline(async signal => {
      const response = await (options.transport ?? fetch)(`${endpoint}?clientToken=${encodeURIComponent(request.clientToken)}`, { cache: "no-store", credentials: "same-origin", signal });
      if (response.status !== 200) return unknown();
      const row = cashFlowObject(await response.json(), ["contractVersion", "actorId", "status", "receipt"]);
      if (row.contractVersion !== "debt-payment-lookup.v1" || row.actorId !== attempt.actorId || row.status !== "found") return unknown();
      const receipt = validateDebtPaymentReceipt(row.receipt, request);
      return receipt.reused ? { status: "confirmed", receipt } : unknown();
    }, 10_000);
  } catch { return unknown(); }
}
/** Explicit send only. Recovery itself is GET-only; an absent receipt never auto-replays. */
export async function sendDebtPayment(attempt: DebtPaymentAttempt, options: { actorId: string | null; priorUnknown?: boolean; transport?: typeof fetch }): Promise<DebtPaymentOutcome> {
  if (options.actorId !== attempt.actorId) return unknown();
  try {
    const request = validateDebtPaymentRequest(JSON.parse(attempt.body));
    return await withDeadline(async signal => {
      const response = await (options.transport ?? fetch)(endpoint, { method: "POST", body: attempt.body, credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, signal });
      const value: unknown = await response.json();
      if (response.status === 200 || response.status === 201) {
        const receipt = validateDebtPaymentReceipt(value, request);
        return receipt.reused === (response.status === 200) ? { status: "confirmed", receipt } : unknown();
      }
      const error = canonicalError(value, response.status);
      if (!error || options.priorUnknown) return unknown();
      if (response.status === 409) return { status: "conflict", error };
      if ([400, 401, 403, 413].includes(response.status)) return { status: "rejected", error };
      return unknown();
    }, 15_000);
  } catch { return unknown(); }
}
