import { cashFlowObject as object, cashFlowText as text, cashFlowUuid as uuid } from "../portfolio/cashFlowApiContract";
import { validateConsultationRead, type ConsultationRead } from "./contracts";
import { CONSULTATION_ERRORS, parseConsultationError, type ConsultationError } from "./errors";
import { TICKET_HISTORY_LIMIT, validateTicketLookup, validateTicketRead, validateTicketReceipt, validateTicketRequest, type TicketLookup, type TicketRead, type TicketRequest } from "./tickets";

/** Informational only. The transactional DB provider independently authorizes every write. */
export type TicketStorageCapability = { state: "not_connected" | "unavailable"; runId: null } | { state: "owned_fixture"; runId: string };
export type TicketStorageSelection = { relationshipId: string } & (
  | { mode: "inbox" }
  | { mode: "read"; requestId: string }
  | { mode: "lookup"; requestId: string; clientToken: string }
);
export interface TicketInboxItem { requestId: string; subject: string; version: number; state: "open" | "closed"; updatedAt: string }
export type TicketStorageEnvelope = { contractVersion: "consultation-ticket-storage.v1"; capability: TicketStorageCapability } & (
  | { mode: "inbox"; data: { actorId: string; relationshipId: string; requests: TicketInboxItem[] } }
  | { mode: "read"; data: TicketRead }
  | { mode: "lookup"; data: TicketLookup }
);
export const TICKET_STORAGE_ENDPOINT = "/api/consultation/tickets";
export const TICKET_RIGHT_ERROR = { state: "error", code: "SERVICE_RIGHT_NOT_CONNECTED", error: "حق همان خدمت به تأمین‌کنندهٔ معتبر متصل نیست؛ ثبت درخواست انجام نشد." } as const;
export const TICKET_RELEASE_ERROR = { state: "error", code: "WRITES_NOT_RELEASED", error: "ثبت غیرفعال است. متن واردشده در همین نشست حفظ می‌شود." } as const;
export type TicketStorageError = ConsultationError | typeof TICKET_RIGHT_ERROR | typeof TICKET_RELEASE_ERROR;
export function ticketStorageErrorStatus(error: TicketStorageError): number {
  return error.code === "SERVICE_RIGHT_NOT_CONNECTED" || error.code === "WRITES_NOT_RELEASED" ? 503 : CONSULTATION_ERRORS[error.code][0];
}
export function parseTicketStorageError(value: unknown, status: number): TicketStorageError | null {
  if (status === 503 && value && typeof value === "object" && !Array.isArray(value)) {
    const row = value as Record<string, unknown>;
    if (Object.keys(row).sort().join() === "code,error,state" && row.state === TICKET_RELEASE_ERROR.state && row.code === TICKET_RELEASE_ERROR.code && row.error === TICKET_RELEASE_ERROR.error) return TICKET_RELEASE_ERROR;
    if (Object.keys(row).sort().join() === "code,error,state" && row.state === TICKET_RIGHT_ERROR.state && row.code === TICKET_RIGHT_ERROR.code && row.error === TICKET_RIGHT_ERROR.error) return TICKET_RIGHT_ERROR;
  }
  return parseConsultationError(value, status);
}
const id = (value: unknown) => { if (!uuid(value)) throw Error("شناسهٔ درخواست معتبر نیست."); return value.toLowerCase(); };
const positive = (value: unknown) => { if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > TICKET_HISTORY_LIMIT) throw Error("نسخهٔ درخواست معتبر نیست."); return value as number; };
function timestamp(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT/.test(value) || !Number.isFinite(Date.parse(value))) throw Error("زمان درخواست معتبر نیست.");
  return value;
}
export function parseTicketStorageSelection(params: URLSearchParams): TicketStorageSelection {
  const mode = params.get("mode");
  const allowed = mode === "inbox" ? ["mode", "relationshipId"] : mode === "read" ? ["mode", "relationshipId", "requestId"] : mode === "lookup" ? ["mode", "relationshipId", "requestId", "clientToken"] : [];
  if (params.size !== allowed.length || [...params.keys()].some(key => !allowed.includes(key) || params.getAll(key).length !== 1)) throw Error("پارامتر خواندن معتبر نیست.");
  const relationshipId = id(params.get("relationshipId"));
  if (mode === "inbox") return { mode, relationshipId };
  const requestId = id(params.get("requestId"));
  if (mode === "read") return { mode, relationshipId, requestId };
  if (mode === "lookup") return { mode, relationshipId, requestId, clientToken: text(params.get("clientToken"), 200) };
  throw Error("نوع خواندن معتبر نیست.");
}
export function ticketStorageParent(source: unknown, actorId: string, relationshipId: string): ConsultationRead {
  const parent = validateConsultationRead(source, { actorId: id(actorId), relationshipId: id(relationshipId) });
  const relation = parent.selected;
  if (!relation || relation.id !== relationshipId || ![relation.clientId, relation.advisorId].includes(parent.actor.id)) throw Error("رابطهٔ مجاز خوانده نشده است.");
  if (parent.actor.id === relation.advisorId && (!parent.actor.isAdvisor || relation.revoked)) throw Error("دسترسی مشاور تأیید نشده است.");
  return parent;
}
function capability(value: unknown): TicketStorageCapability {
  const row = object(value, ["state", "runId"]);
  if ((row.state === "not_connected" || row.state === "unavailable") && row.runId === null) return { state: row.state, runId: null };
  if (row.state === "owned_fixture") return { state: row.state, runId: text(row.runId, 200) };
  throw Error("وضعیت حق خدمت معتبر نیست.");
}
export function validateTicketStorageEnvelope(value: unknown, source: ConsultationRead, selection: TicketStorageSelection, originalRequest?: TicketRequest): TicketStorageEnvelope {
  // Permission failure is not a transient read/lookup state and must escape fallback catches.
  const parent = ticketStorageParent(source, source.actor.id, selection.relationshipId);
  const row = object(value, ["contractVersion", "mode", "capability", "data"]);
  if (row.contractVersion !== "consultation-ticket-storage.v1" || row.mode !== selection.mode) throw Error("قرارداد خواندن درخواست تغییر کرده است.");
  const access = capability(row.capability);
  const common = { contractVersion: "consultation-ticket-storage.v1" as const, capability: access };
  if (selection.mode === "read") return { ...common, mode: "read", data: validateTicketRead(row.data, parent, selection.requestId) };
  if (selection.mode === "inbox") {
    const data = object(row.data, ["actorId", "relationshipId", "requests"]);
    if (data.actorId !== parent.actor.id || data.relationshipId !== selection.relationshipId || !Array.isArray(data.requests) || data.requests.length > TICKET_HISTORY_LIMIT) throw Error("فهرست درخواست‌ها معتبر نیست.");
    const requests: TicketInboxItem[] = data.requests.map((value): TicketInboxItem => {
      const item = object(value, ["requestId", "subject", "version", "state", "updatedAt"]);
      if (item.state !== "open" && item.state !== "closed") throw Error("وضعیت درخواست معتبر نیست.");
      return { requestId: id(item.requestId), subject: text(item.subject, 200), version: positive(item.version), state: item.state, updatedAt: timestamp(item.updatedAt) };
    });
    if (new Set(requests.map(item => item.requestId)).size !== requests.length) throw Error("درخواست تکراری است.");
    return { ...common, mode: "inbox", data: { actorId: parent.actor.id, relationshipId: selection.relationshipId, requests } };
  }
  if (originalRequest) {
    const input = validateTicketRequest(originalRequest);
    if (input.expectedActorId !== parent.actor.id || input.command.relationshipId !== selection.relationshipId || input.command.requestId !== selection.requestId || input.clientToken !== selection.clientToken) throw Error("همبستگی تلاش با مسیر خواندن تغییر کرده است.");
    return { ...common, mode: "lookup", data: validateTicketLookup(row.data, input, parent) };
  }
  // The server GET has only correlation IDs, never private intent text in its URL.
  // The caller additionally binds this lookup to the complete original request.
  const lookup = object(row.data, ["contractVersion", "actorId", "relationshipId", "requestId", "clientToken", "authority", "request", "attempt"]);
  if (lookup.contractVersion !== "consultation-ticket-lookup.v1" || lookup.actorId !== parent.actor.id || lookup.relationshipId !== selection.relationshipId || lookup.requestId !== selection.requestId || lookup.clientToken !== selection.clientToken || lookup.authority !== "not_connected") throw Error("جست‌وجو متعلق به همین تلاش نیست.");
  const resource = object(lookup.request, ["state", "data"]), attempt = object(lookup.attempt, ["state", "receipt"]);
  let request: TicketLookup["request"], saved: TicketLookup["attempt"];
  if (resource.state === "found") request = { state: "found", data: validateTicketRead(resource.data, parent, selection.requestId) };
  else if (["confirmed_absent", "unavailable"].includes(String(resource.state)) && resource.data === null) request = { state: resource.state as "confirmed_absent" | "unavailable", data: null };
  else throw Error("وضعیت درخواست نامعلوم است.");
  if (attempt.state === "found") {
    const raw = attempt.receipt as Record<string, unknown>;
    const input = validateTicketRequest({ contractVersion: "consultation-ticket-request.v1", expectedActorId: parent.actor.id, clientToken: selection.clientToken, command: raw?.command });
    if (input.command.relationshipId !== selection.relationshipId || input.command.requestId !== selection.requestId) throw Error("رسید متعلق به درخواست دیگر است.");
    saved = { state: "found", receipt: validateTicketReceipt(raw, input) };
  } else if (["confirmed_absent", "unavailable"].includes(String(attempt.state)) && attempt.receipt === null) saved = { state: attempt.state as "confirmed_absent" | "unavailable", receipt: null };
  else throw Error("وضعیت تلاش نامعلوم است.");
  return { ...common, mode: "lookup", data: { contractVersion: "consultation-ticket-lookup.v1", actorId: parent.actor.id, relationshipId: selection.relationshipId, requestId: selection.requestId, clientToken: selection.clientToken, authority: "not_connected", request, attempt: saved } };
}
