import "server-only";
import { withDeadline } from "@/lib/deadline";
import type { ZarinpalVerifyResult } from "@/lib/zarinpal";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Server DTO only. Missing/old schemas cannot authorize provider or service writes. */
export interface BindingClient {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}
export interface WebinarBinding {
  contractVersion: "webinar-payment-binding.v1";
  purpose: "webinar.v1";
  registrationProvenance: "register-webinar.v1";
  paymentId: string; userId: string; registrationId: string; webinarId: string; intentKey: string;
  amountToman: number; createdAt: string;
  authority: string | null;
  providerState: "prepared" | "claimed" | "attached";
  status: "pending" | "paid" | "failed";
  refId: string | null; verifiedAt: string | null;
  registrationState: "pending" | "paid" | "free" | "refunded" | "unresolved";
  issuanceEnabled: boolean; settlementEnabled: boolean;
}
export type CallbackResult = { status: "unknown" | "failed" | "success"; binding: WebinarBinding | null };
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
export const bindingId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v);
const token = (v: unknown): v is string => typeof v === "string" && v.length >= 1 && v.length <= 256 && !/[^A-Za-z0-9_-]/.test(v);
const timestamp = (v: unknown): v is string => typeof v === "string" && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
const receipt = (v: unknown): v is string => typeof v === "string" && /^[1-9]\d*$/.test(v) && Number.isSafeInteger(Number(v));

export interface FinancialReceipt {
  id: string; userId: string; authority: string; amountToman: number; createdAt: string;
  status: "pending" | "paid" | "failed"; refId: string | null; verifiedAt: string | null;
}
type TableClient = Pick<SupabaseClient, "from">;
export function parseFinancialReceipt(value: unknown): FinancialReceipt | null {
  if (!record(value) || !bindingId(value.id) || !bindingId(value.user_id) || !token(value.authority)
    || typeof value.amount !== "number" || !Number.isSafeInteger(value.amount) || value.amount <= 0 || value.amount > 2147483647
    || !timestamp(value.created_at) || typeof value.status !== "string" || !["pending", "paid", "failed"].includes(value.status)) return null;
  if (value.status === "paid" ? !receipt(value.ref_id) || !timestamp(value.verified_at) : value.ref_id !== null || value.verified_at !== null) return null;
  return { id: value.id, userId: value.user_id, authority: value.authority, amountToman: value.amount, createdAt: value.created_at,
    status: value.status as FinancialReceipt["status"], refId: value.ref_id as string | null, verifiedAt: value.verified_at as string | null };
}
export async function readFinancialReceipt(client: TableClient, authority: string, ownerId?: string): Promise<FinancialReceipt | null> {
  if (!token(authority) || ownerId !== undefined && !bindingId(ownerId)) return null;
  try {
    const result = await withDeadline(async () => {
      let query = client.from("payments").select("id,user_id,authority,amount,status,ref_id,created_at,verified_at").eq("authority", authority);
      if (ownerId !== undefined) query = query.eq("user_id", ownerId);
      return await query.maybeSingle();
    }, 5000);
    const value = result.error ? null : parseFinancialReceipt(result.data);
    return value?.authority === authority && (ownerId === undefined || value.userId === ownerId) ? value : null;
  } catch { return null; }
}

/** Existing-authority financial reconciliation only. Unknown purpose never grants a service. */
export async function handleLegacyFinancialCallback(client: BindingClient & TableClient, params: URLSearchParams,
  verify: (authority: string, amount: number) => Promise<ZarinpalVerifyResult>): Promise<{ status: CallbackResult["status"]; receipt: FinancialReceipt | null }> {
  if (!["Authority", "Status"].every(k => params.getAll(k).length === 1)) return { status: "unknown", receipt: null };
  const authority = params.get("Authority") ?? "";
  const original = await readFinancialReceipt(client, authority);
  if (!original) return { status: "unknown", receipt: null };
  if (original.status !== "pending") return { status: original.status === "paid" ? "success" : "failed", receipt: original };
  if (params.get("Status") !== "OK") return { status: "unknown", receipt: original };
  // Do not route an unresolved purpose-bound payment through a legacy writer.
  let legacy = false;
  try {
    const purpose = await withDeadline(async () => await client.from("payments").select("purpose_code").eq("authority", authority).maybeSingle(), 5000);
    legacy = purpose.error ? purpose.error.code === "42703" : record(purpose.data) && purpose.data.purpose_code === null;
  } catch { /* Unknown read is not evidence of an old schema. */ }
  if (!legacy) return { status: "unknown", receipt: original };
  let verified: ZarinpalVerifyResult;
  try { verified = await verify(authority, original.amountToman); } catch { return { status: "unknown", receipt: original }; }
  if (verified.outcome === "unknown" || verified.outcome === "verified" && !receipt(verified.refId)) return { status: "unknown", receipt: original };
  await rpc(client, verified.outcome === "verified" ? "verify_payment" : "fail_payment", verified.outcome === "verified"
    ? { p_authority: authority, p_ref_id: verified.refId, p_amount: original.amountToman, p_invite_link: null } : { p_authority: authority });
  const current = await readFinancialReceipt(client, authority);
  if (!current || ["id", "userId", "authority", "amountToman", "createdAt"].some(k => current[k as keyof FinancialReceipt] !== original[k as keyof FinancialReceipt])) return { status: "unknown", receipt: null };
  const confirmed = verified.outcome === "verified" ? current.status === "paid" && current.refId === verified.refId : current.status === "failed";
  return { status: confirmed ? verified.outcome === "verified" ? "success" : "failed" : "unknown", receipt: current };
}

export interface WebinarRegistrationState {
  contractVersion: "webinar-registration.v1"; webinarId: string;
  state: "absent" | "registered" | "unresolved"; registrationId: string | null;
  paymentStatus: "pending" | "paid" | "free" | "refunded" | null;
  mode: "legacy" | "bound"; provenance: "none" | "unproven" | "register-webinar.v1"; paymentEnabled: boolean;
  payment: { intentKey: string; stage: "prepared" | "claimed" | "attached"; status: "pending" | "paid" | "failed";
    authority: string | null; amountToman: number; unit: "toman"; createdAt: string; refId: string | null; verifiedAt: string | null } | null;
}
export function parseRegistrationState(value: unknown): WebinarRegistrationState | null {
  if (!record(value) || value.contractVersion !== "webinar-registration.v1" || !bindingId(value.webinarId)
    || typeof value.state !== "string" || !["absent", "registered", "unresolved"].includes(value.state)
    || typeof value.mode !== "string" || !["legacy", "bound"].includes(value.mode)
    || typeof value.provenance !== "string" || !["none", "unproven", "register-webinar.v1"].includes(value.provenance)
    || typeof value.paymentEnabled !== "boolean") return null;
  if (value.state === "absent" ? value.registrationId !== null || value.paymentStatus !== null || value.payment !== null
    : !bindingId(value.registrationId) || (value.state === "registered" ? typeof value.paymentStatus !== "string" || !["pending", "paid", "free", "refunded"].includes(value.paymentStatus) : value.paymentStatus !== null)) return null;
  if (value.paymentEnabled && (value.mode !== "bound" || value.state !== "registered" || value.paymentStatus !== "pending" || value.provenance !== "register-webinar.v1")) return null;
  if (value.payment !== null) {
    const p = value.payment;
    if (!record(p) || !bindingId(p.intentKey) || typeof p.stage !== "string" || !["prepared", "claimed", "attached"].includes(p.stage)
      || typeof p.status !== "string" || !["pending", "paid", "failed"].includes(p.status) || p.unit !== "toman"
      || typeof p.amountToman !== "number" || !Number.isSafeInteger(p.amountToman) || p.amountToman <= 0 || p.amountToman > 2147483647 || !timestamp(p.createdAt)
      || (p.stage === "attached" ? !token(p.authority) : p.authority !== null) || (p.status !== "pending" && p.stage !== "attached")
      || (p.status === "paid" ? !receipt(p.refId) || !timestamp(p.verifiedAt) : p.refId !== null || p.verifiedAt !== null)) return null;
  }
  return value as unknown as WebinarRegistrationState;
}

export function webinarPaymentUrl(authority: string): string | null {
  if (!token(authority)) return null;
  const sandbox = ["1", "true"].includes(process.env.ZARINPAL_SANDBOX ?? "");
  return `https://${sandbox ? "sandbox" : "payment"}.zarinpal.com/pg/StartPay/${authority}`;
}
export function existingWebinarPaymentUrl(state: WebinarRegistrationState): string | null {
  return state.state === "registered" && state.paymentStatus === "pending" && state.paymentEnabled
    && state.payment?.status === "pending" && state.payment.stage === "attached" && state.payment.authority
    ? webinarPaymentUrl(state.payment.authority) : null;
}

export async function readOwnedRegistration(client: BindingClient & TableClient, ownerId: string, webinarId: string, writesEnabled: boolean): Promise<WebinarRegistrationState | null> {
  if (!bindingId(ownerId) || !bindingId(webinarId)) return null;
  try {
    const result = await withDeadline(async () => await client.rpc("read_webinar_registration_state", { p_webinar_id: webinarId }), 5000);
    if (!result.error) {
      const value = parseRegistrationState(result.data);
      return value?.webinarId === webinarId ? { ...value, mode: writesEnabled ? value.mode : "legacy", paymentEnabled: writesEnabled && value.paymentEnabled } : null;
    }
    const error = result.error;
    if (!record(error) || !["PGRST202", "42883"].includes(String(error.code))) return null;
    // Capability is definitely absent BEFORE any writer. Use only the old owner-scoped read shape.
    const [w, r] = await withDeadline(async () => await Promise.all([
      client.from("webinars").select("id,status").eq("id", webinarId).maybeSingle(),
      client.from("webinar_registrations").select("id,payment_status").eq("webinar_id", webinarId).eq("user_id", ownerId).maybeSingle(),
    ]), 5000);
    if (w.error || r.error || w.data?.id !== webinarId || !["published", "live", "ended"].includes(w.data.status)) return null;
    return parseRegistrationState({ contractVersion: "webinar-registration.v1", webinarId, state: r.data ? "registered" : "absent",
      registrationId: r.data?.id ?? null, paymentStatus: r.data?.payment_status ?? null, mode: "legacy", provenance: r.data ? "unproven" : "none", paymentEnabled: false, payment: null });
  } catch { return null; }
}

export function parseWebinarBinding(value: unknown): WebinarBinding | null {
  if (!record(value) || value.contractVersion !== "webinar-payment-binding.v1" || value.state !== "bound"
    || value.purpose !== "webinar.v1" || value.registrationProvenance !== "register-webinar.v1"
    || ![value.paymentId, value.userId, value.registrationId, value.webinarId, value.intentKey].every(bindingId)
    || typeof value.amountToman !== "number" || !Number.isSafeInteger(value.amountToman) || value.amountToman <= 0 || value.amountToman > 2147483647
    || !timestamp(value.createdAt) || typeof value.issuanceEnabled !== "boolean" || typeof value.settlementEnabled !== "boolean"
    || typeof value.providerState !== "string" || !["prepared", "claimed", "attached"].includes(value.providerState)
    || typeof value.status !== "string" || !["pending", "paid", "failed"].includes(value.status)
    || typeof value.registrationState !== "string" || !["pending", "paid", "free", "refunded", "unresolved"].includes(value.registrationState)) return null;
  if (value.providerState === "attached" ? !token(value.authority) : value.authority !== null) return null;
  if (value.status === "paid") {
    if (value.providerState !== "attached" || !receipt(value.refId) || !timestamp(value.verifiedAt)) return null;
  } else if (value.refId !== null || value.verifiedAt !== null) return null;
  return value as unknown as WebinarBinding;
}

async function rpc(client: BindingClient, name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  try {
    const result = await withDeadline(async () => await client.rpc(name, args), 5000);
    return result.error ? null : result.data;
  } catch { return null; }
}

export async function readWebinarBinding(client: BindingClient, selector: { authority: string } | { paymentId: string }): Promise<WebinarBinding | null> {
  if ("authority" in selector ? !token(selector.authority) : !bindingId(selector.paymentId)) return null;
  const data = await rpc(client, "read_webinar_payment_binding", {
    p_authority: "authority" in selector ? selector.authority : null,
    p_payment_id: "paymentId" in selector ? selector.paymentId : null,
  });
  const binding = parseWebinarBinding(data);
  return binding && ("authority" in selector ? binding.authority === selector.authority : binding.paymentId === selector.paymentId) ? binding : null;
}

export function sameWebinarIntent(a: WebinarBinding, b: WebinarBinding): boolean {
  return a.paymentId === b.paymentId && a.userId === b.userId && a.registrationId === b.registrationId
    && a.webinarId === b.webinarId && a.intentKey === b.intentKey && a.amountToman === b.amountToman
    && a.createdAt === b.createdAt && a.authority === b.authority;
}

export async function prepareWebinarBinding(client: BindingClient, userId: string, registrationId: string, intentKey: string): Promise<WebinarBinding | null> {
  if (![userId, registrationId, intentKey].every(bindingId)) return null;
  const value = parseWebinarBinding(await rpc(client, "prepare_webinar_payment", { p_registration_id: registrationId, p_intent_key: intentKey }));
  return value?.userId === userId && value.registrationId === registrationId && value.intentKey === intentKey ? value : null;
}

/** No retry: only a definitely acknowledged, unique claim may reach requestPayment. */
export async function claimWebinarRequest(client: BindingClient, binding: WebinarBinding): Promise<boolean> {
  if (!binding.issuanceEnabled || binding.status !== "pending" || binding.providerState !== "prepared") return false;
  const value = await rpc(client, "claim_webinar_payment_request", { p_payment_id: binding.paymentId, p_registration_id: binding.registrationId, p_user_id: binding.userId });
  return record(value) && value.contractVersion === "webinar-payment-claim.v1" && value.paymentId === binding.paymentId && value.claimedNow === true;
}

export async function attachWebinarAuthority(client: BindingClient, binding: WebinarBinding, authority: string): Promise<WebinarBinding | null> {
  if (!token(authority)) return null;
  await rpc(client, "attach_webinar_authority", { p_payment_id: binding.paymentId, p_registration_id: binding.registrationId, p_user_id: binding.userId, p_authority: authority });
  // An ACK (including a successful one) is not settlement or attachment evidence.
  const current = await readWebinarBinding(client, { paymentId: binding.paymentId });
  return current && sameWebinarIntent({ ...binding, authority }, current) && current.providerState === "attached" && current.status === "pending" ? current : null;
}

export async function handleWebinarCallback(client: BindingClient, params: URLSearchParams,
  verify: (authority: string, amount: number) => Promise<ZarinpalVerifyResult>, writesEnabled: boolean,
  requireHints = false): Promise<CallbackResult> {
  let binding: WebinarBinding | null = null;
  const result = (status: CallbackResult["status"] = "unknown"): CallbackResult => ({ status, binding });
  if (!["Authority", "Status"].every(key => params.getAll(key).length === 1)
    || !["registration_id", "payment_id"].every(key => params.getAll(key).length <= 1 && (!requireHints || params.has(key)))) return result();
  const authority = params.get("Authority") ?? "";
  binding = await readWebinarBinding(client, { authority });
  if (!binding) return result();
  for (const [key, expected] of [["registration_id", binding.registrationId], ["payment_id", binding.paymentId]]) {
    if (params.has(key) && params.get(key) !== expected) { binding = null; return result(); }
  }
  if (binding.status === "paid") {
    if (binding.registrationState === "pending" && writesEnabled && binding.settlementEnabled) {
      const expected = binding;
      await rpc(client, "settle_webinar_payment", { p_payment_id: binding.paymentId, p_authority: authority,
        p_outcome: "verified", p_ref_id: binding.refId, p_amount: binding.amountToman });
      const current = await readWebinarBinding(client, { authority });
      if (!current || !sameWebinarIntent(expected, current) || current.refId !== expected.refId || current.status !== "paid") { binding = null; return result(); }
      binding = current;
    }
    return result(binding.registrationState === "paid" ? "success" : "unknown");
  }
  if (binding.status === "failed") return result(binding.registrationState === "pending" ? "failed" : "unknown");
  if (!writesEnabled || !binding.settlementEnabled || binding.providerState !== "attached" || params.get("Status") !== "OK") return result();
  // Receipt verification is permitted for the immutable money intent even if service became unresolved.
  let verified: ZarinpalVerifyResult;
  try { verified = await verify(authority, binding.amountToman); } catch { return result(); }
  if (verified.outcome === "unknown" || verified.outcome === "verified" && !receipt(verified.refId)) return result();
  const expected = binding;
  await rpc(client, "settle_webinar_payment", { p_payment_id: binding.paymentId, p_authority: authority,
    p_outcome: verified.outcome, p_ref_id: verified.outcome === "verified" ? verified.refId : null, p_amount: binding.amountToman });
  const current = await readWebinarBinding(client, { authority });
  if (!current || !sameWebinarIntent(expected, current)) { binding = null; return result(); }
  binding = current;
  if (verified.outcome === "verified") return result(current.status === "paid" && current.refId === verified.refId && current.registrationState === "paid" ? "success" : "unknown");
  return result(current.status === "failed" && current.registrationState === "pending" ? "failed" : "unknown");
}
