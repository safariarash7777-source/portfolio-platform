import { normaliseDebt, normalisePosition, text } from "./financialInput";
import { isAuthSessionMissingError } from "@supabase/supabase-js";
export function financialAuthentication(user: { id: string } | null, error: unknown) {
  return { user, error: !!error && !isAuthSessionMissingError(error) };
}
export interface FinancialDb {
  authenticate(): Promise<{ user: { id: string } | null; error: boolean }>;
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { code: string } | null }>;
}
export const financialJson = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export async function postFinancialSnapshot(request: Request, kind: "holdings" | "debts", connect: () => Promise<FinancialDb>): Promise<Response> {
  let db: FinancialDb;
  try { db = await connect(); const auth = await db.authenticate(); if (auth.error) return financialJson({ error: "بررسی نشست انجام نشد." }, 503); if (!auth.user) return financialJson({ error: "برای ثبت وضعیت مالی وارد شوید." }, 401); }
  catch { return financialJson({ error: "سرویس در دسترس نیست." }, 503); }
  let body: Record<string, unknown>, items: Record<string, unknown>[];
  try {
    const input = await request.json();
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("درخواست نامعتبر است.");
    body = input;
    if (!Number.isInteger(body.base_version) || Number(body.base_version) < 0 || !text(body.client_token) || text(body.client_token).length > 200) throw new Error("نسخهٔ پایه و شناسهٔ ثبت معتبر لازم است.");
    const raw = body[kind === "holdings" ? "positions" : "debts"];
    if (!Array.isArray(raw) || raw.length > 500 || text(body.note).length > 2000) throw new Error("فهرست اقلام نامعتبر است.");
    items = raw.map(kind === "holdings" ? normalisePosition : normaliseDebt);
    const keys = items.map(i => i[kind === "holdings" ? "position_key" : "debt_key"]);
    if (new Set(keys).size !== keys.length) throw new Error("یک قلم دوبار وارد شده است.");
  } catch (error) { return financialJson({ error: error instanceof Error ? error.message : "درخواست نامعتبر است." }, 400); }
  try {
    const { data, error } = await db.rpc(kind === "holdings" ? "record_member_holdings" : "record_member_debts", {
      [kind === "holdings" ? "p_positions" : "p_debts"]: items, p_base_version: body.base_version, p_client_token: text(body.client_token),
      ...(kind === "holdings" ? { p_note: text(body.note) || null } : {}),
    });
    if (error) {
      const status = error.code === "42501" ? 403 : ["PT409", "40001"].includes(error.code) ? 409 : error.code.startsWith("22") || error.code.startsWith("23") ? 400 : 503;
      return financialJson({ error: status === 409 ? "نسخهٔ تازه‌تری ثبت شده یا این شناسه با محتوای متفاوت استفاده شده است. آخرین نسخه را باز کنید؛ متن فرم شما حفظ شده است." : status === 400 ? "اطلاعات ثبت‌شده معتبر نیست." : status === 403 ? "دسترسی مجاز نیست." : "ذخیره انجام نشد؛ دوباره تلاش کنید." }, status);
    }
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    if (!row) return financialJson({ error: "ذخیره انجام نشد." }, 503);
    return financialJson(row, row.reused ? 200 : 201);
  } catch { return financialJson({ error: "ذخیره انجام نشد؛ دوباره تلاش کنید." }, 503); }
}
