import type { ConsultationRead } from "./contracts";
import { consultationError } from "./errors";
import { withDeadline } from "../deadline";
import { cashFlowObject as object, cashFlowText as text } from "../portfolio/cashFlowApiContract";
import { createTicketIntent, recoverTicketIntent, validateTicketIntent, type TicketIntent } from "./ticketIntent";
import { validateTicketHistoryAccess, validateTicketReceipt, validateTicketRequest, validateTicketTransition, type TicketReceipt, type TicketRequest } from "./tickets";
import { parseTicketStorageError, ticketStorageParent, validateTicketStorageEnvelope, TICKET_RIGHT_ERROR, TICKET_STORAGE_ENDPOINT, type TicketStorageEnvelope, type TicketStorageError, type TicketStorageSelection } from "./ticketStorageContracts";

/** This additional envelope never changes the frozen contract's writeEnabled=false.
 * The isolated fixture capability only permits a test attempt; DB authorization is
 * independently repeated under its relation/CAS lock. No product right is inferred.
 */
export interface TicketStorageAttempt { readonly intent: TicketIntent; readonly fixtureRunId: string }
export type TicketStorageReadOutcome = { status: "ready"; data: TicketStorageEnvelope } | { status: "error"; error: TicketStorageError; httpStatus?: number };
export type TicketStorageWriteOutcome = { status: "saved"; receipt: TicketReceipt } | { status: "blocked" | "uncertain" | "rejected"; error: TicketStorageError; httpStatus?: number };
export function ticketLookupSelection(input: TicketRequest): Extract<TicketStorageSelection, { mode: "lookup" }> {
  const request = validateTicketRequest(input);
  return { mode: "lookup", relationshipId: request.command.relationshipId, requestId: request.command.requestId, clientToken: request.clientToken };
}
function validateAttempt(value: TicketStorageAttempt): TicketStorageAttempt {
  object(value, ["intent", "fixtureRunId"]);
  return Object.freeze({ intent: validateTicketIntent(value.intent), fixtureRunId: text(value.fixtureRunId, 200) });
}
export function prepareTicketStorageAttempt(input: unknown, parent: ConsultationRead, lookup: TicketStorageEnvelope): { status: "blocked"; intent: TicketIntent } | { status: "prepared"; attempt: TicketStorageAttempt } {
  const request = validateTicketRequest(input);
  validateTicketHistoryAccess(request, parent);
  const envelope = validateTicketStorageEnvelope(lookup, parent, ticketLookupSelection(request), request);
  if (envelope.mode !== "lookup") throw Error("جست‌وجوی همان تلاش لازم است.");
  const intent = createTicketIntent(request, parent, envelope.data);
  return envelope.capability.state === "owned_fixture"
    ? { status: "prepared", attempt: Object.freeze({ intent, fixtureRunId: envelope.capability.runId }) }
    : { status: "blocked", intent };
}
export async function readTicketStorage(selection: TicketStorageSelection, parent: ConsultationRead, options: { input?: TicketRequest; signal?: AbortSignal; transport?: typeof fetch } = {}): Promise<TicketStorageReadOutcome> {
  // Authorization failure must escape, not be returned together with a private intent.
  ticketStorageParent(parent, parent.actor.id, selection.relationshipId);
  try {
    const query = new URLSearchParams({ mode: selection.mode, relationshipId: selection.relationshipId });
    if (selection.mode !== "inbox") query.set("requestId", selection.requestId);
    if (selection.mode === "lookup") query.set("clientToken", selection.clientToken);
    return await withDeadline(async signal => {
      const response = await (options.transport ?? fetch)(`${TICKET_STORAGE_ENDPOINT}?${query}`, { credentials: "same-origin", cache: "no-store", signal });
      const value: unknown = await response.json();
      if (response.status !== 200) {
        const error = parseTicketStorageError(value, response.status);
        if (error) return { status: "error" as const, error, httpStatus: response.status };
        throw Error("unrecognized read response");
      }
      return { status: "ready" as const, data: validateTicketStorageEnvelope(value, parent, selection, options.input) };
    }, 10_000, options.signal);
  } catch { return { status: "error", error: consultationError("READ_UNAVAILABLE") }; }
}
export async function sendTicketStorageAttempt(value: TicketStorageAttempt, parent: ConsultationRead, options: { currentActorId: string | null; unresolvedPrior?: boolean; transport?: typeof fetch }): Promise<TicketStorageWriteOutcome> {
  const attempt = validateAttempt(value), request = validateTicketRequest(JSON.parse(attempt.intent.body));
  validateTicketHistoryAccess(request, parent);
  const uncertain = (): TicketStorageWriteOutcome => ({ status: "uncertain", error: consultationError("WRITE_UNAVAILABLE") });
  if (options.currentActorId !== request.expectedActorId) return { status: "rejected", error: consultationError("ACTOR_CHANGED"), httpStatus: 403 };
  // No automatic replay of an unknown outcome, even with an idempotency token.
  if (options.unresolvedPrior) return uncertain();
  try {
    return await withDeadline(async signal => {
      const response = await (options.transport ?? fetch)(TICKET_STORAGE_ENDPOINT, { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: attempt.intent.body, signal });
      const value: unknown = await response.json();
      if (response.status === 200 || response.status === 201) {
        const receipt = validateTicketReceipt(value, request);
        if (receipt.reused !== (response.status === 200)) return uncertain();
        return { status: "saved" as const, receipt };
      }
      const error = parseTicketStorageError(value, response.status);
      if (!error) return uncertain();
      if (error.code === TICKET_RIGHT_ERROR.code) return { status: "blocked" as const, error, httpStatus: response.status };
      if ([400, 401, 403, 404, 409, 413].includes(response.status)) return { status: "rejected" as const, error, httpStatus: response.status };
      return uncertain();
    }, 15_000);
  } catch { return uncertain(); }
}
export function recoverTicketStorageAttempt(value: TicketStorageAttempt, lookup: TicketStorageEnvelope, parent: ConsultationRead, receipt: TicketReceipt | null) {
  const attempt = validateAttempt(value), request = validateTicketRequest(JSON.parse(attempt.intent.body));
  validateTicketHistoryAccess(request, parent);
  const envelope = validateTicketStorageEnvelope(lookup, parent, ticketLookupSelection(request), request);
  if (envelope.mode !== "lookup") throw Error("جست‌وجوی همان تلاش لازم است.");
  return recoverTicketIntent(attempt.intent, envelope.data, parent, receipt);
}
/** Explicit user retry only after authoritative absence AND unchanged CAS/rights.
 * Returns the identical attempt bytes/token; unknown/found/unavailable never qualify.
 */
export function afterConfirmedTicketAbsence(value: TicketStorageAttempt, lookup: TicketStorageEnvelope, parent: ConsultationRead): TicketStorageAttempt {
  const attempt = validateAttempt(value), request = validateTicketRequest(JSON.parse(attempt.intent.body));
  validateTicketHistoryAccess(request, parent);
  const envelope = validateTicketStorageEnvelope(lookup, parent, ticketLookupSelection(request), request);
  if (envelope.mode !== "lookup" || envelope.data.attempt.state !== "confirmed_absent" || envelope.capability.state !== "owned_fixture" || envelope.capability.runId !== attempt.fixtureRunId) throw Error("نبود همان تلاش و مجوز آزمایشی جاری تأیید نشده است.");
  validateTicketTransition(request, parent, envelope.data);
  return attempt;
}
