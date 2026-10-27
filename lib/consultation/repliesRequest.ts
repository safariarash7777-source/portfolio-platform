import { withDeadline } from "@/lib/deadline";
import { REPLY_BODY_LIMIT, validateReplyRequest, validateReplyRead, validateReplyReceipt, type ReplyRequest, type ReplyRead, type ReplyReceipt } from "./replies";
import { consultationError, parseConsultationError, type ConsultationError } from "./errors";

const endpoint = "/api/consultation/replies";
export interface ReplyAttempt { readonly body: string; readonly expectedActorId: string }
export type ReplyWriteOutcome =
  | { status: "saved"; receipt: ReplyReceipt }
  | { status: "rejected"; httpStatus: number; error: ConsultationError }
  | { status: "uncertain"; error: ConsultationError; httpStatus?: number };
export type ReplyReadOutcome = { status: "ready"; data: ReplyRead } | { status: "error"; error: ConsultationError; httpStatus?: number };
export function createReplyAttempt(input: ReplyRequest): ReplyAttempt {
  const request = validateReplyRequest(input), body = JSON.stringify(request);
  if (new TextEncoder().encode(body).length > REPLY_BODY_LIMIT) throw new Error("حجم درخواست بیش از حد مجاز است.");
  return Object.freeze({ body, expectedActorId: request.expectedActorId });
}
export async function sendReplyAttempt(attempt: ReplyAttempt, options: { currentActorId: string | null; unresolvedPrior?: boolean; transport?: typeof fetch }): Promise<ReplyWriteOutcome> {
  const uncertain = (error = consultationError("WRITE_UNAVAILABLE"), httpStatus?: number): ReplyWriteOutcome => ({ status: "uncertain", error, httpStatus });
  if (options.currentActorId !== attempt.expectedActorId) {
    const error = consultationError("ACTOR_CHANGED");
    return options.unresolvedPrior ? uncertain(error) : { status: "rejected", httpStatus: 403, error };
  }
  try {
    const request = validateReplyRequest(JSON.parse(attempt.body));
    if (request.expectedActorId !== attempt.expectedActorId) return uncertain();
    return await withDeadline(async signal => {
      const response = await (options.transport ?? fetch)(endpoint, { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: attempt.body, signal });
      const value: unknown = await response.json();
      if (response.status === 200 || response.status === 201) {
        const receipt = validateReplyReceipt(value, request);
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
export async function readReplies(options: { relationshipId: string; sessionId: string; actorId?: string; signal?: AbortSignal; transport?: typeof fetch }): Promise<ReplyReadOutcome> {
  try {
    const query = new URLSearchParams();
    if (options.relationshipId) query.set("relationshipId", options.relationshipId);
    query.set("sessionId", options.sessionId);

    return await withDeadline(async signal => {
      const response = await (options.transport ?? fetch)(`${endpoint}?${query}`, { credentials: "same-origin", cache: "no-store", signal });
      const value: unknown = await response.json();
      if (response.status !== 200) {
        const error = parseConsultationError(value, response.status);
        if (error) return { status: "error", error, httpStatus: response.status };
        throw new Error("unrecognized response");
      }
      const data = validateReplyRead(value, { relationshipId: options.relationshipId, actorId: options.actorId, sessionId: options.sessionId });
      return { status: "ready", data };
    }, 10_000, options.signal);
  } catch { return { status: "error", error: consultationError("READ_UNAVAILABLE") }; }
}
