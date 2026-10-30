import type { ConsultationRead } from "./contracts";
import { cashFlowObject as object } from "../portfolio/cashFlowApiContract";
import { TICKET_BODY_LIMIT, ticketReceiptVisible, validateTicketHistoryAccess, validateTicketLookup, validateTicketReceipt, validateTicketRequest, validateTicketTransition, type TicketReceipt } from "./tickets";

export interface TicketIntent {
  readonly body: string;
  readonly expectedActorId: string;
  readonly requestId: string;
  readonly clientToken: string;
  readonly serviceRightState: "not_connected";
  readonly writeEnabled: false;
  readonly blockedReason: "service_entitlement_not_connected";
}
/** No transport is supplied or called. This is not an API write attempt. */
export function createTicketIntent(input: unknown, source: ConsultationRead, lookup: unknown): TicketIntent {
  const request = validateTicketTransition(input, source, lookup);
  return Object.freeze({ body: JSON.stringify(request), expectedActorId: request.expectedActorId, requestId: request.command.requestId, clientToken: request.clientToken, serviceRightState: "not_connected", writeEnabled: false, blockedReason: "service_entitlement_not_connected" });
}
/** Recovery preserves the exact serialized intent; it never creates a fresh token. */
export function validateTicketIntent(value: TicketIntent): TicketIntent {
  object(value, ["body", "expectedActorId", "requestId", "clientToken", "serviceRightState", "writeEnabled", "blockedReason"]);
  if (typeof value.body !== "string" || new TextEncoder().encode(value.body).length > TICKET_BODY_LIMIT) throw Error("تلاش محفوظ معتبر نیست.");
  const request = validateTicketRequest(JSON.parse(value.body));
  if (value.body !== JSON.stringify(request)) throw Error("متن تلاش با نسخهٔ آماده‌شده مطابق نیست.");
  if (value.expectedActorId !== request.expectedActorId || value.requestId !== request.command.requestId || value.clientToken !== request.clientToken || value.serviceRightState !== "not_connected" || value.writeEnabled !== false || value.blockedReason !== "service_entitlement_not_connected") throw Error("تلاش محفوظ با قرارداد مطابق نیست.");
  return Object.freeze({ body: value.body, expectedActorId: request.expectedActorId, requestId: request.command.requestId, clientToken: request.clientToken, serviceRightState: "not_connected", writeEnabled: false, blockedReason: "service_entitlement_not_connected" });
}

export interface TicketRecovery {
  status: "confirmed" | "readback_pending" | "confirmed_absent" | "request_found" | "unavailable";
  intent: TicketIntent;
  receipt: TicketReceipt | null;
}
/** Recovery never manufactures an intent or token; even confirmed absence keeps the old bytes. */
export function recoverTicketIntent(value: TicketIntent, lookupValue: unknown, source: ConsultationRead, knownReceipt: TicketReceipt | null): TicketRecovery {
  const intent = validateTicketIntent(value), request = validateTicketRequest(JSON.parse(intent.body));
  // Identity, exact relationship and history role are not transient lookup failures.
  // Validate outside catch so unauthorized callers cannot receive intent/receipt via pending().
  const authorizedSource = validateTicketHistoryAccess(request, source);
  const saved = knownReceipt === null ? null : validateTicketReceipt(knownReceipt, request);
  const pending = (): TicketRecovery => ({ status: saved ? "readback_pending" : "unavailable", intent, receipt: saved });
  try {
    const lookup = validateTicketLookup(lookupValue, request, authorizedSource);
    if (saved && lookup.attempt.state === "found" && (saved.id !== lookup.attempt.receipt.id || saved.canonicalContentHash !== lookup.attempt.receipt.canonicalContentHash)) return pending();
    const receipt = saved ?? (lookup.attempt.state === "found" ? lookup.attempt.receipt : null);
    if (receipt) {
      const confirmed = lookup.request.state === "found" && ticketReceiptVisible(lookup.request.data, receipt);
      return { status: confirmed ? "confirmed" : "readback_pending", intent, receipt };
    }
    if (lookup.attempt.state === "unavailable" || lookup.request.state === "unavailable") return { status: "unavailable", intent, receipt: null };
    if (request.command.kind !== "open" && lookup.request.state === "confirmed_absent") return { status: "unavailable", intent, receipt: null };
    return { status: lookup.request.state === "found" ? "request_found" : "confirmed_absent", intent, receipt: null };
  } catch { return pending(); }
}
