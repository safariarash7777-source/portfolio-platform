import type { ConsultationRead } from "./contracts";
import { consultationError } from "./errors";
import { withDeadline } from "../deadline";
import { validateTicketHistoryAccess, validateTicketRequest } from "./tickets";
import { parseTicketStorageError, ticketStorageParent, TICKET_RIGHT_ERROR, type TicketStorageError } from "./ticketStorageContracts";
import type { TicketStorageAttempt } from "./ticketStorageRequest";
import { frozenTicketIntentBody, restorePreparedTicketAttempt, TICKET_ATTEMPT_ENDPOINT, validateTicketAttemptRead, validateTicketPreparationReceipt, type TicketAttemptRead, type TicketAttemptSelection, type TicketPreparationReceipt, type TicketPrepared } from "./ticketAttemptStorageContracts";

export type TicketAttemptReadOutcome = { status: "ready"; data: TicketAttemptRead } | { status: "error"; error: TicketStorageError; httpStatus?: number };
export type TicketPreparationOutcome = { status: "saved"; receipt: TicketPreparationReceipt } | { status: "uncertain" | "blocked" | "rejected"; error: TicketStorageError; httpStatus?: number };
export async function readTicketAttemptStorage(selection: TicketAttemptSelection, parent: ConsultationRead, options: { signal?: AbortSignal; expectedBody?: string; transport?: typeof fetch } = {}): Promise<TicketAttemptReadOutcome> {
  ticketStorageParent(parent, parent.actor.id, selection.relationshipId);
  try {
    const query = new URLSearchParams({ mode: selection.mode, relationshipId: selection.relationshipId });
    if (selection.mode === "lookup") {
      if (selection.preparationId) query.set("preparationId", selection.preparationId);
      else query.set("clientToken", selection.clientToken!);
    }
    return await withDeadline(async signal => {
      const response = await (options.transport ?? fetch)(`${TICKET_ATTEMPT_ENDPOINT}?${query}`, { credentials: "same-origin", cache: "no-store", signal });
      const value: unknown = await response.json();
      if (response.status !== 200) {
        const error = parseTicketStorageError(value, response.status);
        if (error) return { status: "error" as const, error, httpStatus: response.status };
        throw Error("unrecognized preparation read response");
      }
      const data = await validateTicketAttemptRead(value, parent, selection);
      if (options.expectedBody !== undefined && data.contractVersion === "consultation-ticket-attempt-lookup.v1" && data.state === "found" && data.prepared!.body !== options.expectedBody) throw Error("original preparation bytes changed");
      return { status: "ready" as const, data };
    }, 10_000, options.signal);
  } catch { return { status: "error", error: consultationError("READ_UNAVAILABLE") }; }
}
export async function sendTicketPreparation(value: TicketStorageAttempt, parent: ConsultationRead, options: { currentActorId: string | null; unresolvedPrior?: boolean; transport?: typeof fetch }): Promise<TicketPreparationOutcome> {
  const intent = frozenTicketIntentBody(value.intent.body), request = validateTicketRequest(JSON.parse(intent.body));
  validateTicketHistoryAccess(request, parent);
  if (options.currentActorId !== intent.expectedActorId) return { status: "rejected", error: consultationError("ACTOR_CHANGED"), httpStatus: 403 };
  const uncertain = (): TicketPreparationOutcome => ({ status: "uncertain", error: consultationError("WRITE_UNAVAILABLE") });
  if (options.unresolvedPrior) return uncertain();
  try {
    return await withDeadline(async signal => {
      // This endpoint retains bytes only. It cannot execute a ticket command.
      const response = await (options.transport ?? fetch)(TICKET_ATTEMPT_ENDPOINT, { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: intent.body, signal });
      const body: unknown = await response.json();
      if (response.status === 200 || response.status === 201) {
        const receipt = await validateTicketPreparationReceipt(body, parent, intent.body);
        if (receipt.reused !== (response.status === 200) || receipt.fixtureRunId !== value.fixtureRunId) return uncertain();
        return { status: "saved" as const, receipt };
      }
      const error = parseTicketStorageError(body, response.status);
      if (!error) return uncertain();
      if (error.code === TICKET_RIGHT_ERROR.code) return { status: "blocked" as const, error, httpStatus: response.status };
      if ([400, 401, 403, 404, 409, 413].includes(response.status)) return { status: "rejected" as const, error, httpStatus: response.status };
      return uncertain();
    }, 15_000);
  } catch { return uncertain(); }
}
export function bindOriginalPreparation(prepared: TicketPrepared, original: TicketStorageAttempt, parent: ConsultationRead): TicketStorageAttempt {
  const restored = restorePreparedTicketAttempt(prepared, parent);
  if (restored.intent.body !== original.intent.body || restored.fixtureRunId !== original.fixtureRunId) throw Error("server preparation is not the original immutable attempt");
  return restored;
}
