import "server-only";
import { withDeadline } from "@/lib/deadline";
import type { ZarinpalVerifyResult } from "@/lib/zarinpal";

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
const token = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,256}$/.test(v);
const timestamp = (v: unknown): v is string => typeof v === "string" && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
const receipt = (v: unknown): v is string => typeof v === "string" && /^[1-9]\d*$/.test(v) && Number.isSafeInteger(Number(v));

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
