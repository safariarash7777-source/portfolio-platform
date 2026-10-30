import type { ConsultationRead } from "./contracts";
import { cashFlowObject as object } from "../portfolio/cashFlowApiContract";
import { TICKET_BODY_LIMIT, validateTicketRequest, validateTicketTransition, type TicketRead } from "./tickets";

export interface TicketIntent {
  readonly body: string;
  readonly expectedActorId: string;
  readonly requestId: string;
  readonly clientToken: string;
  readonly writeEnabled: false;
  readonly blockedReason: "service_entitlement_not_connected";
}
/** No transport is supplied or called. This is not an API write attempt. */
export function createTicketIntent(input: unknown, source: ConsultationRead, prior: TicketRead | null): TicketIntent {
  const request = validateTicketTransition(input, source, prior);
  return Object.freeze({ body: JSON.stringify(request), expectedActorId: request.expectedActorId, requestId: request.command.requestId, clientToken: request.clientToken, writeEnabled: false, blockedReason: "service_entitlement_not_connected" });
}
/** Recovery preserves the exact serialized intent; it never creates a fresh token. */
export function validateTicketIntent(value: TicketIntent): TicketIntent {
  object(value, ["body", "expectedActorId", "requestId", "clientToken", "writeEnabled", "blockedReason"]);
  if (typeof value.body !== "string" || new TextEncoder().encode(value.body).length > TICKET_BODY_LIMIT) throw Error("تلاش محفوظ معتبر نیست.");
  const request = validateTicketRequest(JSON.parse(value.body));
  if (value.body !== JSON.stringify(request)) throw Error("متن تلاش با نسخهٔ آماده‌شده مطابق نیست.");
  if (value.expectedActorId !== request.expectedActorId || value.requestId !== request.command.requestId || value.clientToken !== request.clientToken || value.writeEnabled !== false || value.blockedReason !== "service_entitlement_not_connected") throw Error("تلاش محفوظ با قرارداد مطابق نیست.");
  return Object.freeze({ body: value.body, expectedActorId: request.expectedActorId, requestId: request.command.requestId, clientToken: request.clientToken, writeEnabled: false, blockedReason: "service_entitlement_not_connected" });
}
