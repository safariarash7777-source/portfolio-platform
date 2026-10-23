import { withDeadline } from "@/lib/deadline";
import { CONSULTATION_BODY_LIMIT, validateConsultationRequest, validateConsultationRead, validateConsultationReceipt, type ConsultationRequest, type ConsultationRead, type ConsultationReceipt } from "./contracts";
import { consultationError, parseConsultationError, type ConsultationError } from "./errors";

const endpoint = "/api/consultation";
export interface ConsultationAttempt { readonly body: string; readonly expectedActorId: string }
export type ConsultationWriteOutcome =
  | { status: "saved"; receipt: ConsultationReceipt }
  | { status: "rejected"; httpStatus: number; error: ConsultationError }
  | { status: "uncertain"; error: ConsultationError; httpStatus?: number };
export type ConsultationReadOutcome = { status: "ready"; data: ConsultationRead } | { status: "error"; error: ConsultationError; httpStatus?: number };
export function createConsultationAttempt(input: ConsultationRequest): ConsultationAttempt {
  const request = validateConsultationRequest(input), body = JSON.stringify(request);
  if (new TextEncoder().encode(body).length > CONSULTATION_BODY_LIMIT) throw new Error("حجم درخواست بیش از حد مجاز است.");
  return Object.freeze({ body, expectedActorId: request.expectedActorId });
}
export async function sendConsultationAttempt(attempt: ConsultationAttempt, options: { currentActorId: string | null; unresolvedPrior?: boolean; transport?: typeof fetch }): Promise<ConsultationWriteOutcome> {
  const uncertain = (error = consultationError("WRITE_UNAVAILABLE"), httpStatus?: number): ConsultationWriteOutcome => ({ status: "uncertain", error, httpStatus });
  if (options.currentActorId !== attempt.expectedActorId) {
    const error = consultationError("ACTOR_CHANGED");
    return options.unresolvedPrior ? uncertain(error) : { status: "rejected", httpStatus: 403, error };
  }
  try {
    const request = validateConsultationRequest(JSON.parse(attempt.body));
    if (request.expectedActorId !== attempt.expectedActorId) return uncertain();
    return await withDeadline(async signal => {
      const response = await (options.transport ?? fetch)(endpoint, { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: attempt.body, signal });
      const value: unknown = await response.json();
      if (response.status === 200 || response.status === 201) {
        const receipt = validateConsultationReceipt(value, request);
        if (receipt.reused !== (response.status === 200)) return uncertain();
        return { status: "saved", receipt };
      }
      const error = parseConsultationError(value, response.status);
      if (!error) return uncertain();
      // A later rejection cannot prove that a previous timed-out write did not commit.
      if (!options.unresolvedPrior && [400, 401, 403, 404, 409, 413].includes(response.status)) return { status: "rejected", httpStatus: response.status, error };
      return uncertain(error, response.status);
    }, 15_000);
  } catch { return uncertain(); }
}
export async function readConsultation(options: { relationshipId?: string; startOn?: string; endOn?: string; actorId?: string; signal?: AbortSignal; transport?: typeof fetch } = {}): Promise<ConsultationReadOutcome> {
  try {
    const query = new URLSearchParams();
    if (options.relationshipId) query.set("relationshipId", options.relationshipId);
    if (options.startOn) query.set("startOn", options.startOn);
    if (options.endOn) query.set("endOn", options.endOn);
    return await withDeadline(async signal => {
      const response = await (options.transport ?? fetch)(`${endpoint}?${query}`, { credentials: "same-origin", cache: "no-store", signal });
      const value: unknown = await response.json();
      if (response.status !== 200) {
        const error = parseConsultationError(value, response.status);
        if (error) return { status: "error", error, httpStatus: response.status };
        throw new Error("unrecognized response");
      }
      const data = validateConsultationRead(value, { relationshipId: options.relationshipId, actorId: options.actorId, ...(options.startOn && options.endOn ? { period: { startOn: options.startOn, endOn: options.endOn } } : {}) });
      return { status: "ready", data };
    }, 10_000, options.signal);
  } catch { return { status: "error", error: consultationError("READ_UNAVAILABLE") }; }
}
