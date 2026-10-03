// An unknown outcome must retry the exact original request, never an edited draft.
export interface FinancialSaveAttempt { readonly url: string; readonly body: string }
export interface FinancialSaveReceipt { version_id: string; version: number; position_count: number; reused: boolean }
export type FinancialSaveOutcome =
 | { status: "confirmed"; receipt: FinancialSaveReceipt }
 | { status: "rejected"; httpStatus: number; message: string }
 | { status: "unknown"; message?: string };
export const financialSaveAttempt = (url: string, payload: unknown): FinancialSaveAttempt => Object.freeze({ url, body: JSON.stringify(payload) });
// Existing postFinancialSnapshot wire response. Different/malformed 409 stays unknown.
const canonicalConflict = "نسخهٔ تازه‌تری ثبت شده یا این شناسه با محتوای متفاوت استفاده شده است. آخرین نسخه را باز کنید؛ متن فرم شما حفظ شده است.";
export async function sendFinancialAttempt(attempt: FinancialSaveAttempt, unresolvedPrior = false, transport: typeof fetch = fetch): Promise<FinancialSaveOutcome> {
 try {
  const response = await transport(attempt.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: attempt.body });
  if(response.status >= 400 && response.status < 500) {
   if(response.status === 429) return { status: "unknown", message: "این تلاش به محدودیت موقت سرویس رسید؛ نتیجهٔ ثبت هنوز مشخص نیست. متن فرم و همان درخواست حفظ شدند؛ پس از رفع محدودیت، همین ثبت را دوباره بررسی کنید." };
   let error: unknown;
   try { error = await response.json(); } catch { return { status: "unknown" }; }
   const valid = error !== null && typeof error === "object" && !Array.isArray(error) && Object.keys(error).length === 1
    && typeof (error as { error?: unknown }).error === "string" && Boolean((error as { error: string }).error.trim());
   if(!valid || ![400,401,403,409].includes(response.status)) return { status: "unknown" };
   const message = (error as { error: string }).error;
   if(response.status === 409 && message !== canonicalConflict) return { status: "unknown" };
   // Only a valid canonical CAS conflict can resolve a previously unanswered attempt.
   if(unresolvedPrior && response.status !== 409) return { status: "unknown", message: [401,403].includes(response.status)
    ? "این تلاش به مشکل نشست یا دسترسی رسید؛ نتیجهٔ ثبت اول هنوز مشخص نیست. متن فرم و همان درخواست حفظ شدند؛ نشست و دسترسی را در صفحهٔ جدا بررسی و سپس همین ثبت را دوباره بررسی کنید."
    : "این پاسخ نتیجهٔ ثبت اول را مشخص نمی‌کند. متن فرم و همان درخواست حفظ شدند؛ پس از رفع مشکل، همین ثبت را دوباره بررسی کنید." };
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
