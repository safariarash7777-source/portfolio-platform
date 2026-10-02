import { canonicalPayload, positionWriteInput } from "./importPreview";
import { positionFromStored, debtFromStored } from "./balanceSheet";
import { normalisePosition, text } from "./financialInput";
import { financialJson } from "./financialHttp";
export const CANONICAL_READ_CONTRACT = "p04-canonical-read.v0.1";
export interface FinancialReadDb {
  authenticate(): Promise<{ user: { id: string } | null; error: boolean }>;
  version(ownerId: string, lookup: { id?: string; token?: string }): Promise<Record<string, unknown> | null>;
  positions(versionId: string): Promise<Record<string, unknown>[]>;
  debts(versionId: string): Promise<Record<string, unknown>[]>;
}
const classes = ["gold", "fixed_income", "equity_ir", "fx", "cash"];
async function authorize(connect: () => Promise<FinancialReadDb>) {
  const db = await connect(), auth = await db.authenticate();
  return { db, auth };
}
function normalizedPositions(rows: Record<string, unknown>[]) {
  if (rows.length > 500 || new Set(rows.map(p => p.position_key)).size !== rows.length) throw new Error("incomplete/duplicate");
  return rows.map(p => ({ ...normalisePosition(positionWriteInput(positionFromStored(p))), cost_basis: p.cost_basis == null ? null : Number(p.cost_basis) }));
}
export async function getFinancialSnapshot(versionId: string | undefined, connect: () => Promise<FinancialReadDb>) {
  try {
    const { db, auth } = await authorize(connect);
    if (auth.error) return financialJson({ state: "error", error: "بررسی نشست انجام نشد." }, 503);
    if (!auth.user) return financialJson({ state: "error", error: "برای خواندن دارایی وارد شوید." }, 401);
    if (versionId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(versionId)) return financialJson({ state: "error", error: "شناسه نسخه نامعتبر است." }, 400);
    const row = await db.version(auth.user.id, versionId ? { id: versionId } : {});
    if (row && row.user_id !== auth.user.id) return financialJson({ state: "error", error: "دسترسی به نسخه مجاز نیست." }, 403);
    if (!row && versionId) return financialJson({ state: "error", error: "نسخه در دسترس نیست." }, 404);
    const common = { contractVersion: CANONICAL_READ_CONTRACT, ownerId: auth.user.id, supportedAssetClasses: classes, memberConfirmedAt: null, accountRef: null };
    if (!row) return financialJson({ ...common, state: "empty", version: null, positions: [], debts: [] });
    const [positionRows, debtRows] = await Promise.all([db.positions(String(row.id)), db.debts(String(row.id))]);
    const positions = normalizedPositions(positionRows);
    if (debtRows.length > 500 || new Set(debtRows.map(d => d.debt_key)).size !== debtRows.length) throw new Error("incomplete/duplicate");
    const debts = debtRows.map(debtFromStored);
    if (debts.some(d => !Number.isSafeInteger(d.balance_toman) || d.balance_toman < 0)) throw new Error("invalid debt");
    return financialJson({ ...common, state: "ready", version: { id: row.id, version: row.version }, positions, debts });
  } catch { return financialJson({ state: "error", error: "خواندن کامل وضعیت مالی انجام نشد." }, 503); }
}
/** Read-only observation of canonical token; no pending operation or migration ledger. */
export async function lookupFinancialReceipt(request: Request, connect: () => Promise<FinancialReadDb>) {
  try {
    const { db, auth } = await authorize(connect);
    if (auth.error) return financialJson({ status: "error", error: "بررسی نشست انجام نشد." }, 503);
    if (!auth.user) return financialJson({ status: "error", error: "برای خواندن رسید وارد شوید." }, 401);
    let body: Record<string, unknown>;
    try { const raw = await request.text(); if (raw.length > 1_000_000) throw new Error("size"); const input = JSON.parse(raw); if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("shape"); body = input; }
    catch { return financialJson({ status: "error", error: "درخواست رسید نامعتبر است." }, 400); }
    const token = text(body?.client_token);
    if (!token || token.length > 200) return financialJson({ status: "error", error: "شناسه ثبت نامعتبر است." }, 400);
    let expectedPayload: string | null = null;
    if (Object.hasOwn(body, "positions")) {
      try { if (!Array.isArray(body.positions) || body.positions.length > 500) throw new Error("shape"); expectedPayload = canonicalPayload(body.positions); }
      catch { return financialJson({ status: "error", error: "اقلام مورد انتظار رسید معتبر نیستند." }, 400); }
    }
    const row = await db.version(auth.user.id, { token });
    const privateContext = { contractVersion: "p04-receipt-read.v0.1", ownerId: auth.user.id };
    // Absence is NOT proof an in-flight original write cannot still commit.
    if (!row) return financialJson({ ...privateContext, status: "unknown", clientToken: token, reason: "هنوز رسید قابل مشاهده نیست؛ ثبت دوباره یا تغییر شناسه ندهید." });
    if (row.user_id !== auth.user.id) return financialJson({ status: "error", error: "دسترسی مجاز نیست." }, 403);
    const observation = { ...privateContext, clientToken: token, canonicalContentHash: row.content_hash, canonicalVersion: { id: row.id, version: row.version }, migrationMappings: null, migrationComplete: false };
    let matches = false;
    if (expectedPayload !== null) {
      const actual = normalizedPositions(await db.positions(String(row.id)));
      matches = canonicalPayload(actual.map(p => ({ ...p, currency: "IRT" }))) === expectedPayload && text(row.note) === text(body.note);
    } else if (typeof body.expectedCanonicalContentHash === "string" && /^[0-9a-f]{32}$/.test(body.expectedCanonicalContentHash)) {
      matches = body.expectedCanonicalContentHash === row.content_hash;
    } else return financialJson({ ...privateContext, status: "unknown", observation, reason: "تطبیق محتوای ثبت لازم است؛ هش پیش‌نمایش با هش پایگاه یکسان نیست." });
    if (!matches) return financialJson({ ...privateContext, status: "conflict", observation, error: "محتوای این شناسه با درخواست مورد انتظار متفاوت است." }, 409);
    return financialJson({ status: "accepted", ...observation, reused: true });
  } catch { return financialJson({ status: "error", error: "خواندن یا تطبیق رسید انجام نشد." }, 503); }
}
