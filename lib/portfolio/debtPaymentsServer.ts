import type { SupabaseClient } from "@supabase/supabase-js";
import { authSessionFailure } from "../auth/session-error";
import { withDeadline } from "../deadline";
import { cashFlowObject, cashFlowText } from "./cashFlowApiContract";
import { DEBT_PAYMENT_BODY_LIMIT, debtPaymentStatus, validateDebtPaymentReceipt, validateDebtPaymentRequest, validateDebtPaymentSelection, validateDebtPaymentsRead, type DebtPaymentError, type DebtPaymentErrorCode, type DebtPaymentRequest, type DebtPaymentSelection } from "./debtPayments";

export interface DebtPaymentsDb {
  authenticate(): Promise<{ user: { id: string } | null; error: unknown }>;
  rpc(name: string, args: Record<string, unknown>, signal: AbortSignal): PromiseLike<{ data: unknown; error: { code?: string } | null }>;
}
export function debtPaymentsDb(client: SupabaseClient): DebtPaymentsDb {
  return { async authenticate() { const { data, error } = await client.auth.getUser(); return { user: data.user, error }; }, rpc: (name, args, signal) => client.rpc(name, args).abortSignal(signal) };
}
const messages: Record<DebtPaymentErrorCode, string> = {
  INVALID_INPUT: "ورودی اعلام پرداخت معتبر نیست.", AUTH_REQUIRED: "برای مشاهدهٔ اعلام پرداخت وارد شوید.", AUTH_UNAVAILABLE: "بررسی نشست انجام نشد.", FORBIDDEN: "این پرونده برای این عضو مجاز نیست.", ORIGIN_FORBIDDEN: "مبدأ ثبت مجاز نیست.", UNAVAILABLE: "زیرساخت ثبت اعلام پرداخت هنوز آماده نیست؛ ثبت تازه بسته است.", READ_UNAVAILABLE: "خواندن کامل اعلام پرداخت انجام نشد؛ دادهٔ قبلی تأیید نمی‌شود.", WRITE_UNAVAILABLE: "نتیجهٔ ثبت اعلام پرداخت مشخص نیست؛ همان درخواست را حفظ کنید.", CONFLICT: "مبنا، منبع یا نسخه تغییر کرده یا هزینه قبلاً پیوند دارد؛ فرم حفظ شد، ابتدا نسخه‌ها را بررسی کنید.", BODY_TOO_LARGE: "حجم درخواست بیش از حد مجاز است.",
};
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const failure = (code: DebtPaymentErrorCode) => json({ contractVersion: "debt-payment-error.v1", state: "error", code, error: messages[code] } satisfies DebtPaymentError, debtPaymentStatus[code]);
const absent = (code?: string) => ["42P01", "42883", "42703", "PGRST202", "PGRST205"].includes(code ?? "");
class Failure extends Error { constructor(readonly code: DebtPaymentErrorCode) { super(code); } }
async function identity(connect: () => Promise<DebtPaymentsDb>) {
  return withDeadline(async () => {
    const db = await connect(), auth = await db.authenticate(), status = authSessionFailure(auth.error);
    if (status === 503) throw new Failure("AUTH_UNAVAILABLE");
    if (status === 401 || !auth.user) throw new Failure("AUTH_REQUIRED");
    return { db, actor: auth.user.id };
  }, 10_000).catch(error => { throw error instanceof Failure ? error : new Failure("AUTH_UNAVAILABLE"); });
}
function dbFailure(code: string | undefined, writing = false): never {
  if (absent(code)) throw new Failure("UNAVAILABLE");
  if (code === "42501") throw new Failure("FORBIDDEN");
  if (["PT409", "40001"].includes(code ?? "")) throw new Failure("CONFLICT");
  if (code?.startsWith("22") || code?.startsWith("23")) throw new Failure("INVALID_INPUT");
  throw new Failure(writing ? "WRITE_UNAVAILABLE" : "READ_UNAVAILABLE");
}
async function load(db: DebtPaymentsDb, actor: string, selection: DebtPaymentSelection) {
  return withDeadline(async signal => {
    const result = await db.rpc("load_member_debt_payments", { p_holding_version_id: selection.holdingVersionId, p_start_on: selection.period.startOn, p_end_on: selection.period.endOn, p_before_sequence: selection.beforeSequence ?? null }, signal);
    if (result.error) dbFailure(result.error.code);
    return validateDebtPaymentsRead(result.data, selection, actor);
  }, 10_000);
}
async function lookup(db: DebtPaymentsDb, actor: string, token: string) {
  return withDeadline(async signal => {
    const result = await db.rpc("lookup_member_debt_payment", { p_client_token: token }, signal);
    if (result.error) dbFailure(result.error.code);
    const row = cashFlowObject(result.data, ["contractVersion", "actorId", "status", "receipt"]);
    if (row.contractVersion !== "debt-payment-lookup.v1" || row.actorId !== actor || row.status !== "found" && row.status !== "unknown" || row.status === "unknown" && row.receipt !== null || row.status === "found" && !row.receipt) throw new Failure("READ_UNAVAILABLE");
    return row;
  }, 10_000);
}
export async function getDebtPayments(request: Request, connect: () => Promise<DebtPaymentsDb>) {
  try {
    const { db, actor } = await identity(connect), query = new URL(request.url).searchParams;
    if (query.has("clientToken")) {
      let token: string; try { token = cashFlowText(query.get("clientToken"), 200); } catch { return failure("INVALID_INPUT"); }
      return json(await lookup(db, actor, token));
    }
    let selection: DebtPaymentSelection;
    try { selection = validateDebtPaymentSelection({ holdingVersionId: query.get("holdingVersionId") ?? "", period: { startOn: query.get("startOn") ?? "", endOn: query.get("endOn") ?? "" }, ...(query.has("beforeSequence") ? { beforeSequence: Number(query.get("beforeSequence")) } : {}) }); }
    catch { return failure("INVALID_INPUT"); }
    try { return json(await load(db, actor, selection)); }
    catch (error) {
      if (error instanceof Failure && error.code === "UNAVAILABLE") return json({ contractVersion: "debt-payment-read.v1", state: "unavailable", actorId: actor, holdingVersionId: selection.holdingVersionId, period: selection.period, reason: "not_installed", writeAllowed: false });
      throw error;
    }
  } catch (error) { return failure(error instanceof Failure ? error.code : "READ_UNAVAILABLE"); }
}
export async function postDebtPayment(request: Request, connect: () => Promise<DebtPaymentsDb>) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return failure("ORIGIN_FORBIDDEN");
  let input: DebtPaymentRequest;
  try {
    if (Number(request.headers.get("content-length")) > DEBT_PAYMENT_BODY_LIMIT) return failure("BODY_TOO_LARGE");
    const raw = await withDeadline(() => request.text(), 10_000);
    if (new TextEncoder().encode(raw).length > DEBT_PAYMENT_BODY_LIMIT) return failure("BODY_TOO_LARGE");
    input = validateDebtPaymentRequest(JSON.parse(raw));
  } catch { return failure("INVALID_INPUT"); }
  try {
    const { db, actor } = await identity(connect);
    if (actor !== input.expectedActorId) return failure("FORBIDDEN");
    const prior = await lookup(db, actor, input.clientToken);
    if (prior.status === "found") {
      try { const receipt = validateDebtPaymentReceipt(prior.receipt, input); if (!receipt.reused) throw Error(); return json(receipt); }
      catch { return failure("CONFLICT"); }
    }
    // A missing/partial installation or historical basis cannot reach write RPC.
    const current = await load(db, actor, { holdingVersionId: input.payload.holdingVersionId, period: input.period });
    if (current.state !== "ready" || !current.writeAllowed) return failure("CONFLICT");
    if (current.sourceVersion?.id !== input.payload.cashFlowVersionId || !current.sources.some(source => source.entryKey === input.payload.entryKey) || !current.installments.some(item => item.debtKey === input.payload.debtKey && item.dueOn === input.payload.dueOn)) return failure("CONFLICT");
    return await withDeadline(async signal => {
      const result = await db.rpc("record_member_debt_payment", { p_payload: input.payload, p_client_token: input.clientToken, p_base_version: input.baseVersion }, signal);
      if (result.error) dbFailure(result.error.code, true);
      const receipt = validateDebtPaymentReceipt(result.data, input);
      return json(receipt, receipt.reused ? 200 : 201);
    }, 15_000);
  } catch (error) { return failure(error instanceof Failure ? error.code : "WRITE_UNAVAILABLE"); }
}
