import { withDeadline } from "../deadline";
import { GOALS_BODY_LIMIT, goalsUuid, validateGoalsError, validateGoalsRead, validateGoalsReceipt, validateGoalsWriteRequest, type GoalsApiError, type GoalsErrorCode, type GoalsRead, type GoalsReceipt, type GoalsWriteRequest } from "./goalsApiContract";

export interface GoalsAttempt { readonly url: string; readonly body: string; readonly expectedOwnerId: string }
export type GoalsWriteOutcome = { status: "confirmed"; receipt: GoalsReceipt }
  | { status: "rejected"; httpStatus: number; error: GoalsApiError }
  | { status: "conflict"; httpStatus: 409; error: GoalsApiError; priorUnresolved: boolean }
  | { status: "unknown"; message: string; code?: GoalsErrorCode };
const unavailable = "نتیجهٔ ثبت مشخص نیست؛ همین درخواست را دوباره بررسی کنید.";
/** Freeze the exact request bytes. Never regenerate token/base/body when retrying an unknown result. */
export function createGoalsAttempt(input: GoalsWriteRequest, url = "/api/personal-finance/goals"): GoalsAttempt {
  const request = validateGoalsWriteRequest(input), body = JSON.stringify(request);
  if (new TextEncoder().encode(body).length > GOALS_BODY_LIMIT) throw new Error("حجم درخواست بیش از حد مجاز است.");
  if (!url.startsWith("/") || url.startsWith("//") || /[\\\r\n]/.test(url)) throw new Error("Invalid goals endpoint");
  return Object.freeze({ url, body, expectedOwnerId: request.expectedOwnerId });
}
export async function sendGoalsAttempt(attempt: GoalsAttempt, options: { currentOwnerId: string | null; unresolvedPrior?: boolean; transport?: typeof fetch }): Promise<GoalsWriteOutcome> {
  if (options.currentOwnerId !== attempt.expectedOwnerId) {
    const error: GoalsApiError = { state: "error", code: "OWNER_CHANGED", error: "هویت عضو تغییر کرده است؛ درخواست قبلی ارسال نشد." };
    return options.unresolvedPrior ? { status: "unknown", message: unavailable, code: error.code } : { status: "rejected", httpStatus: 403, error };
  }
  try {
    const request = validateGoalsWriteRequest(JSON.parse(attempt.body));
    if (request.expectedOwnerId !== attempt.expectedOwnerId) return { status: "unknown", message: unavailable };
    return await withDeadline(async signal => {
      const response = await (options.transport ?? fetch)(attempt.url, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: attempt.body, signal, cache: "no-store" });
      const value: unknown = await response.json();
      if (response.status === 200 || response.status === 201) {
        const receipt = validateGoalsReceipt(value, request);
        if (receipt.reused !== (response.status === 200)) return { status: "unknown", message: unavailable };
        return { status: "confirmed", receipt };
      }
      const error = validateGoalsError(value, response.status);
      if (!error) return { status: "unknown", message: unavailable };
      if (response.status === 409) return { status: "conflict", httpStatus: 409, error, priorUnresolved: options.unresolvedPrior === true };
      if (!options.unresolvedPrior && [400, 401, 403, 413].includes(response.status)) return { status: "rejected", httpStatus: response.status, error };
      return { status: "unknown", message: unavailable, code: error.code };
    }, 15_000);
  } catch { return { status: "unknown", message: unavailable }; }
}
export type GoalsReadOutcome = { status: "ready" | "empty"; data: GoalsRead } | { status: "error"; error: GoalsApiError; httpStatus?: number };
export async function readGoals(options: { version?: string; beforeVersion?: number; transport?: typeof fetch; signal?: AbortSignal }): Promise<GoalsReadOutcome> {
  try {
    if (options.version !== undefined && !goalsUuid(options.version) || options.beforeVersion !== undefined && (!Number.isInteger(options.beforeVersion) || options.beforeVersion < 1 || options.beforeVersion > 2_147_483_647)) throw new Error("Invalid read selection");
    const query = new URLSearchParams();
    if (options.version !== undefined) query.set("version", options.version);
    if (options.beforeVersion !== undefined) query.set("beforeVersion", String(options.beforeVersion));
    return await withDeadline(async signal => {
      const response = await (options.transport ?? fetch)(`/api/personal-finance/goals?${query}`, { credentials: "same-origin", cache: "no-store", signal });
      const value: unknown = await response.json();
      if (response.status !== 200) { const error = validateGoalsError(value, response.status); if (error) return { status: "error", error, httpStatus: response.status }; throw new Error("Noncanonical read error"); }
      const data = validateGoalsRead(value, { version: options.version, beforeVersion: options.beforeVersion });
      return { status: data.state, data };
    }, 10_000, options.signal);
  } catch { return { status: "error", error: { state: "error", code: "READ_UNAVAILABLE", error: "خواندن هدف‌های مالی در دسترس نیست؛ دادهٔ قبلی را حفظ کنید." } }; }
}
