// An unknown outcome must retry the exact original request, never an edited draft.
export interface FinancialSaveAttempt { readonly url: string; readonly body: string }
export interface FinancialSaveReceipt { version_id: string; version: number; position_count: number; reused: boolean }
export type FinancialSaveOutcome =
 | { status: "confirmed"; receipt: FinancialSaveReceipt }
 | { status: "rejected"; httpStatus: number; message: string }
 | { status: "unknown" };
export const financialSaveAttempt = (url: string, payload: unknown): FinancialSaveAttempt => Object.freeze({ url, body: JSON.stringify(payload) });
export async function sendFinancialAttempt(attempt: FinancialSaveAttempt, transport: typeof fetch = fetch): Promise<FinancialSaveOutcome> {
 try {
  const response = await transport(attempt.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: attempt.body });
  if(response.status >= 400 && response.status < 500) {
   let message = "ثبت رد شد؛ متن فرم حفظ شده است.";
   try { const error = await response.json(); if(typeof error?.error === "string") message = error.error; } catch { /* The rejection status is definitive even if its body is unreadable. */ }
   return { status: "rejected", httpStatus: response.status, message };
  }
  if(!response.ok) return { status: "unknown" };
  const row = await response.json();
  const payload = JSON.parse(attempt.body), items = payload.positions ?? payload.debts;
  if(!row || typeof row.version_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.version_id)
   || !Number.isSafeInteger(payload.base_version) || row.version !== payload.base_version + 1 || !Array.isArray(items)
   || !Number.isSafeInteger(row.position_count) || row.position_count !== items.length || typeof row.reused !== "boolean") return { status: "unknown" };
  return { status: "confirmed", receipt: row };
 } catch { return { status: "unknown" }; }
}
