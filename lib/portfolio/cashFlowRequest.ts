import { withDeadline } from "../deadline";
import { CASH_FLOW_BODY_LIMIT, cashFlowUuid, validateCashFlowError, validateCashFlowPeriod, validateCashFlowRead, validateCashFlowReceipt, validateCashFlowWriteRequest, type CashFlowApiError, type CashFlowErrorCode, type CashFlowRead, type CashFlowReceipt, type CashFlowWriteRequest } from "./cashFlowApiContract";
import type { CashFlowPeriod } from "./cashFlow";

export interface CashFlowAttempt { readonly url: string; readonly body: string; readonly expectedOwnerId: string }
export type CashFlowWriteOutcome = { status: "confirmed"; receipt: CashFlowReceipt }
  | { status: "rejected"; httpStatus: number; error: CashFlowApiError }
  | { status: "conflict"; httpStatus: 409; error: CashFlowApiError; priorUnresolved: boolean }
  | { status: "unknown"; message: string; code?: CashFlowErrorCode };
const unavailable = "نتیجهٔ ثبت مشخص نیست؛ همین درخواست را دوباره بررسی کنید.";
/** Freeze the exact request bytes. Never regenerate token/base/body when retrying an unknown result. */
export function createCashFlowAttempt(input: CashFlowWriteRequest, url = "/api/personal-finance/cash-flow"): CashFlowAttempt {
  const request = validateCashFlowWriteRequest(input), body = JSON.stringify(request);
  if (new TextEncoder().encode(body).length > CASH_FLOW_BODY_LIMIT) throw new Error("حجم درخواست بیش از حد مجاز است.");
  if (!url.startsWith("/") || url.startsWith("//") || /[\\\r\n]/.test(url)) throw new Error("Invalid cash-flow endpoint");
  return Object.freeze({ url, body, expectedOwnerId: request.expectedOwnerId });
}
export async function sendCashFlowAttempt(attempt: CashFlowAttempt, options: { currentOwnerId: string | null; unresolvedPrior?: boolean; transport?: typeof fetch }): Promise<CashFlowWriteOutcome> {
  if (options.currentOwnerId !== attempt.expectedOwnerId) {
    const error: CashFlowApiError = { state: "error", code: "OWNER_CHANGED", error: "هویت عضو تغییر کرده است؛ درخواست قبلی ارسال نشد." };
    return options.unresolvedPrior ? { status: "unknown", message: unavailable, code: error.code } : { status: "rejected", httpStatus: 403, error };
  }
  try {
    const request = validateCashFlowWriteRequest(JSON.parse(attempt.body));
    if (request.expectedOwnerId !== attempt.expectedOwnerId) return { status: "unknown", message: unavailable };
    return await withDeadline(async signal => {
      const response = await (options.transport ?? fetch)(attempt.url, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: attempt.body, signal, cache: "no-store" });
      const value: unknown = await response.json();
      if (response.status === 200 || response.status === 201) {
        const receipt = validateCashFlowReceipt(value, request);
        if (receipt.reused !== (response.status === 200)) return { status: "unknown", message: unavailable };
        return { status: "confirmed", receipt };
      }
      const error = validateCashFlowError(value, response.status);
      if (!error) return { status: "unknown", message: unavailable };
      if (response.status === 409) return { status: "conflict", httpStatus: 409, error, priorUnresolved: options.unresolvedPrior === true };
      if (!options.unresolvedPrior && [400, 401, 403, 413].includes(response.status)) return { status: "rejected", httpStatus: response.status, error };
      return { status: "unknown", message: unavailable, code: error.code };
    }, 15_000);
  } catch { return { status: "unknown", message: unavailable }; }
}
export type CashFlowReadOutcome = { status: "ready" | "empty"; data: CashFlowRead } | { status: "error"; error: CashFlowApiError; httpStatus?: number };
export async function readCashFlow(options: { period: CashFlowPeriod; version?: string; beforeVersion?: number; transport?: typeof fetch; signal?: AbortSignal }): Promise<CashFlowReadOutcome> {
  try {
    const period = validateCashFlowPeriod(options.period);
    if (options.version !== undefined && !cashFlowUuid(options.version) || options.beforeVersion !== undefined && (!Number.isInteger(options.beforeVersion) || options.beforeVersion < 1 || options.beforeVersion > 2_147_483_647)) throw new Error("Invalid read selection");
    const query = new URLSearchParams(period as unknown as Record<string, string>);
    if (options.version !== undefined) query.set("version", options.version);
    if (options.beforeVersion !== undefined) query.set("beforeVersion", String(options.beforeVersion));
    return await withDeadline(async signal => {
      const response = await (options.transport ?? fetch)(`/api/personal-finance/cash-flow?${query}`, { credentials: "same-origin", cache: "no-store", signal });
      const value: unknown = await response.json();
      if (response.status !== 200) { const error = validateCashFlowError(value, response.status); if (error) return { status: "error", error, httpStatus: response.status }; throw new Error("Noncanonical read error"); }
      const data = validateCashFlowRead(value, { period, version: options.version, beforeVersion: options.beforeVersion });
      return { status: data.state, data };
    }, 10_000, options.signal);
  } catch { return { status: "error", error: { state: "error", code: "READ_UNAVAILABLE", error: "خواندن جریان نقد در دسترس نیست؛ دادهٔ قبلی را حفظ کنید." } }; }
}
