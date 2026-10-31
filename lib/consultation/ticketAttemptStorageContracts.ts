import type { ConsultationRead } from "./contracts";
import { cashFlowObject as object, cashFlowText as text, cashFlowUuid as uuid } from "../portfolio/cashFlowApiContract";
import { TICKET_BODY_LIMIT, validateTicketHistoryAccess, validateTicketRequest, type TicketCommand, type TicketRequest } from "./tickets";
import { validateTicketIntent, type TicketIntent } from "./ticketIntent";
import { ticketStorageParent } from "./ticketStorageContracts";
import type { TicketStorageAttempt } from "./ticketStorageRequest";

export const TICKET_ATTEMPT_ENDPOINT = "/api/consultation/ticket-attempts";
export const TICKET_ATTEMPT_LIST_LIMIT = 500; // Serialization bound, not a service quota.
export type TicketAttemptSelection = { relationshipId: string } & (
  | { mode: "list" }
  | { mode: "lookup"; preparationId: string; clientToken?: never }
  | { mode: "lookup"; clientToken: string; preparationId?: never }
);
export interface TicketAttemptMetadata { preparationId: string; requestId: string; kind: TicketCommand["kind"]; baseVersion: number; bodyHash: string; createdAt: string }
export interface TicketPreparationReceipt { contractVersion: "consultation-ticket-preparation.v1"; actorId: string; relationshipId: string; preparationId: string; requestId: string; clientToken: string; bodyHash: string; createdAt: string; fixtureRunId: string; reused: boolean }
export interface TicketPrepared extends Omit<TicketPreparationReceipt, "contractVersion" | "reused"> { contractVersion: "consultation-ticket-prepared.v1"; body: string }
export interface TicketAttemptList { contractVersion: "consultation-ticket-attempt-list.v1"; actorId: string; relationshipId: string; attempts: TicketAttemptMetadata[] }
export interface TicketAttemptLookup { contractVersion: "consultation-ticket-attempt-lookup.v1"; actorId: string; relationshipId: string; preparationId: string | null; clientToken: string | null; state: "found" | "confirmed_absent"; prepared: TicketPrepared | null }
export type TicketAttemptRead = TicketAttemptList | TicketAttemptLookup;
const id = (value: unknown) => { if (!uuid(value)) throw Error("شناسهٔ تلاش معتبر نیست."); return value.toLowerCase(); };
const hash = (value: unknown) => { if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw Error("هش تلاش معتبر نیست."); return value; };
const kinds: TicketCommand["kind"][] = ["open", "member_followup", "advisor_clarification", "link_recommendation", "close"];
function time(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value))) throw Error("زمان DB تلاش معتبر نیست.");
  return value;
}
export function frozenTicketIntentBody(body: unknown): TicketIntent {
  if (typeof body !== "string" || !body || new TextEncoder().encode(body).length > TICKET_BODY_LIMIT) throw Error("متن اصلی تلاش معتبر نیست.");
  const input = validateTicketRequest(JSON.parse(body));
  return validateTicketIntent({ body, expectedActorId: input.expectedActorId, requestId: input.command.requestId, clientToken: input.clientToken, serviceRightState: "not_connected", writeEnabled: false, blockedReason: "service_entitlement_not_connected" });
}
export async function ticketBodyHash(body: string): Promise<string> {
  return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(body))), byte => byte.toString(16).padStart(2, "0")).join("");
}
export function parseTicketAttemptSelection(params: URLSearchParams): TicketAttemptSelection {
  const mode = params.get("mode"), byId = params.has("preparationId");
  const keys = mode === "list" ? ["mode", "relationshipId"] : mode === "lookup" ? ["mode", "relationshipId", byId ? "preparationId" : "clientToken"] : [];
  if (params.size !== keys.length || [...params.keys()].some(key => !keys.includes(key) || params.getAll(key).length !== 1)) throw Error("مسیر خواندن تلاش معتبر نیست.");
  const relationshipId = id(params.get("relationshipId"));
  if (mode === "list") return { mode, relationshipId };
  if (mode !== "lookup") throw Error("نوع خواندن تلاش معتبر نیست.");
  return byId ? { mode, relationshipId, preparationId: id(params.get("preparationId")) } : { mode, relationshipId, clientToken: text(params.get("clientToken"), 200) };
}
function commonReceipt(row: Record<string, unknown>, parent: ConsultationRead) {
  if (row.actorId !== parent.actor.id || row.relationshipId !== parent.selected!.id) throw Error("تلاش متعلق به همین هویت و رابطه نیست.");
  return { actorId: parent.actor.id, relationshipId: parent.selected!.id, preparationId: id(row.preparationId), requestId: id(row.requestId), clientToken: text(row.clientToken, 200), bodyHash: hash(row.bodyHash), createdAt: time(row.createdAt), fixtureRunId: text(row.fixtureRunId, 200) };
}
export async function validateTicketPreparationReceipt(value: unknown, source: ConsultationRead, body: string): Promise<TicketPreparationReceipt> {
  const intent = frozenTicketIntentBody(body), input = validateTicketRequest(JSON.parse(intent.body));
  const parent = ticketStorageParent(source, input.expectedActorId, input.command.relationshipId);
  const row = object(value, ["contractVersion", "actorId", "relationshipId", "preparationId", "requestId", "clientToken", "bodyHash", "createdAt", "fixtureRunId", "reused"]);
  if (row.contractVersion !== "consultation-ticket-preparation.v1" || typeof row.reused !== "boolean") throw Error("رسید حفظ تلاش معتبر نیست.");
  const receipt = commonReceipt(row, parent);
  if (receipt.requestId !== input.command.requestId || receipt.clientToken !== input.clientToken || receipt.bodyHash !== await ticketBodyHash(body)) throw Error("رسید حفظ با bytes اصلی مطابق نیست.");
  return { contractVersion: "consultation-ticket-preparation.v1", ...receipt, reused: row.reused };
}
export async function validateTicketAttemptRead(value: unknown, source: ConsultationRead, selection: TicketAttemptSelection): Promise<TicketAttemptRead> {
  // Access validation is outside callers' transient read-error fallback.
  const parent = ticketStorageParent(source, source.actor.id, selection.relationshipId);
  if (selection.mode === "list") {
    const row = object(value, ["contractVersion", "actorId", "relationshipId", "attempts"]);
    if (row.contractVersion !== "consultation-ticket-attempt-list.v1" || row.actorId !== parent.actor.id || row.relationshipId !== selection.relationshipId || !Array.isArray(row.attempts) || row.attempts.length > TICKET_ATTEMPT_LIST_LIMIT) throw Error("فهرست کامل تلاش‌ها معتبر نیست.");
    const attempts: TicketAttemptMetadata[] = row.attempts.map(value => {
      const item = object(value, ["preparationId", "requestId", "kind", "baseVersion", "bodyHash", "createdAt"]);
      if (!kinds.includes(item.kind as TicketCommand["kind"]) || !Number.isInteger(item.baseVersion) || (item.baseVersion as number) < 0 || (item.baseVersion as number) > 2147483646) throw Error("مبنای تلاش معتبر نیست.");
      return { preparationId: id(item.preparationId), requestId: id(item.requestId), kind: item.kind as TicketCommand["kind"], baseVersion: item.baseVersion as number, bodyHash: hash(item.bodyHash), createdAt: time(item.createdAt) };
    });
    if (new Set(attempts.map(item => item.preparationId)).size !== attempts.length) throw Error("تلاش تکراری در فهرست است.");
    return { contractVersion: "consultation-ticket-attempt-list.v1", actorId: parent.actor.id, relationshipId: selection.relationshipId, attempts };
  }
  const row = object(value, ["contractVersion", "actorId", "relationshipId", "preparationId", "clientToken", "state", "prepared"]);
  if (row.contractVersion !== "consultation-ticket-attempt-lookup.v1" || row.actorId !== parent.actor.id || row.relationshipId !== selection.relationshipId || row.preparationId !== (selection.preparationId ?? null) || row.clientToken !== (selection.clientToken ?? null)) throw Error("همبستگی جست‌وجوی تلاش تغییر کرده است.");
  const common = { contractVersion: "consultation-ticket-attempt-lookup.v1" as const, actorId: parent.actor.id, relationshipId: selection.relationshipId, preparationId: selection.preparationId ?? null, clientToken: selection.clientToken ?? null };
  if (row.state === "confirmed_absent" && row.prepared === null) return { ...common, state: row.state, prepared: null };
  if (row.state !== "found") throw Error("وضعیت نامعلوم، نبود تلاش نیست.");
  const saved = object(row.prepared, ["contractVersion", "actorId", "relationshipId", "preparationId", "requestId", "clientToken", "bodyHash", "createdAt", "fixtureRunId", "body"]);
  if (saved.contractVersion !== "consultation-ticket-prepared.v1") throw Error("نسخهٔ متن محفوظ معتبر نیست.");
  const metadata = commonReceipt(saved, parent), intent = frozenTicketIntentBody(saved.body), input = validateTicketRequest(JSON.parse(intent.body));
  validateTicketHistoryAccess(input, parent);
  if (metadata.requestId !== input.command.requestId || metadata.clientToken !== input.clientToken || (selection.preparationId && metadata.preparationId !== selection.preparationId) || (selection.clientToken && metadata.clientToken !== selection.clientToken) || metadata.bodyHash !== await ticketBodyHash(intent.body)) throw Error("متن/توکن/هش محفوظ مطابق نیست.");
  return { ...common, state: "found", prepared: { contractVersion: "consultation-ticket-prepared.v1", ...metadata, body: intent.body } };
}
export function restorePreparedTicketAttempt(value: TicketPrepared, parent: ConsultationRead): TicketStorageAttempt {
  const intent = frozenTicketIntentBody(value.body), input: TicketRequest = validateTicketRequest(JSON.parse(intent.body));
  validateTicketHistoryAccess(input, parent);
  if (value.actorId !== parent.actor.id || value.relationshipId !== input.command.relationshipId || value.requestId !== input.command.requestId || value.clientToken !== input.clientToken) throw Error("تلاش محفوظ متعلق به همین رابطه نیست.");
  // Original bytes are used verbatim; the frozen writeEnabled=false stays false.
  return Object.freeze({ intent, fixtureRunId: value.fixtureRunId });
}
