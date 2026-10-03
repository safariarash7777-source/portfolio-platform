import { financialJson, type FinancialDb } from "./financialHttp";
import { text } from "./financialInput";
import { SCOPE_UUID as uuid, scopeReviewFromStored, type StoredScopeReview } from "./scopeContract";
export async function postInvestmentScope(request: Request, connect: () => Promise<FinancialDb>): Promise<Response> {
  let db: FinancialDb;
  try { db = await connect(); const auth = await db.authenticate(); if (auth.error) return financialJson({ error: "بررسی نشست انجام نشد." }, 503); if (!auth.user) return financialJson({ error: "برای ثبت محدوده وارد شوید." }, 401); }
  catch { return financialJson({ error: "سرویس ثبت محدوده در دسترس نیست." }, 503); }
  let body: Record<string, unknown>;
  try {
    const raw = await request.text(); if (raw.length > 1_000_000) throw new Error();
    const input = JSON.parse(raw); if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error(); body = input;
    const fields = new Set(["holding_version_id", "rules_version", "assignments", "base_scope_version", "client_token"]);
    if (Object.keys(body).some(k => !fields.has(k)) || !uuid.test(text(body.holding_version_id)) || body.rules_version !== "member-selected.v0.1"
      || !Number.isSafeInteger(body.base_scope_version) || Number(body.base_scope_version) < 0 || !text(body.client_token) || text(body.client_token).length > 200
      || !Array.isArray(body.assignments) || !body.assignments.length || body.assignments.length > 500) throw new Error();
    body.assignments = body.assignments.map(a => {
      if (!a || typeof a !== "object" || Array.isArray(a) || Object.keys(a).some(k => !["positionKey", "use"].includes(k))
        || !text(a.positionKey) || !["allocatable", "excluded"].includes(a.use)) throw new Error();
      return { positionKey: text(a.positionKey), use: a.use };
    });
    if (new Set((body.assignments as { positionKey: string }[]).map(a => a.positionKey)).size !== (body.assignments as unknown[]).length) throw new Error();
  } catch { return financialJson({ error: "نسخه، محدودهٔ کامل و شناسهٔ ثبت معتبر لازم است." }, 400); }
  try {
    const { data, error } = await db.rpc("record_member_investment_scope", { p_holding_version_id: body.holding_version_id, p_rules_version: body.rules_version,
      p_assignments: body.assignments, p_base_scope_version: body.base_scope_version, p_client_token: text(body.client_token) });
    if (error) {
      const status = error.code === "42501" ? 403 : ["PT409", "40001"].includes(error.code) ? 409 : /^[23]/.test(error.code) ? 400 : 503;
      return financialJson({ error: status === 409 ? "نسخهٔ دارایی یا محدوده تغییر کرده است؛ انتخاب‌های شما حفظ شد. آخرین نسخه را دوباره باز کنید." : status === 403 ? "ثبت محدودهٔ این نسخه مجاز نیست." : status === 400 ? "محدودهٔ این نسخه کامل یا معتبر نیست." : "ثبت تأیید نشد؛ همین درخواست را دوباره بررسی کنید." }, status);
    }
    const row = data as (StoredScopeReview & { reused: boolean }) | null;
    if (!row || row.holdingVersionId !== body.holding_version_id || !uuid.test(row.id) || !Number.isSafeInteger(row.scopeVersion) || row.scopeVersion < 1
      || typeof row.memberConfirmedAt !== "string" || !Number.isFinite(Date.parse(row.memberConfirmedAt))) return financialJson({ error: "تأیید ثبت محدوده دریافت نشد." }, 503);
    const stored = scopeReviewFromStored({ id: row.id, holding_version_id: row.holdingVersionId, scope_version: row.scopeVersion, rules_version: row.rulesVersion,
      member_confirmed_at: row.memberConfirmedAt, assignments: row.assignments }, { id: String(body.holding_version_id), version: row.holdingVersion });
    if (!Number.isSafeInteger(row.holdingVersion) || row.holdingVersion < 1 || stored.assignments.length !== (body.assignments as unknown[]).length
      || stored.assignments.some(a => !(body.assignments as { positionKey: string; use: string }[]).some(b => a.positionKey === b.positionKey && a.use === b.use))) throw new Error("scope response mismatch");
    return financialJson({ ...stored, reused: row.reused === true }, row.reused ? 200 : 201);
  } catch { return financialJson({ error: "تأیید ثبت محدوده دریافت نشد؛ شناسهٔ ثبت را تغییر ندهید." }, 503); }
}
