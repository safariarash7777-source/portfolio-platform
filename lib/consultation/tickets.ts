import { cashFlowObject as object, cashFlowText as text, cashFlowUuid as uuid } from "../portfolio/cashFlowApiContract";
import { validateConsultationRead, type ConsultationRead } from "./contracts";

/** Internal contract only: no endpoint, database adapter, or service permission. */
export const TICKET_BODY_LIMIT = 20_000;
export const TICKET_HISTORY_LIMIT = 500; // Serialization bound, never a service quota.
export interface TicketRecommendation { sessionId: string; version: number; contentHash: string }
interface TicketTarget { relationshipId: string; requestId: string; baseVersion: number }
export type TicketCommand = TicketTarget & (
  | { kind: "open"; subject: string; text: string; recommendation: TicketRecommendation | null }
  | { kind: "member_followup" | "advisor_clarification"; text: string }
  | { kind: "link_recommendation"; recommendation: TicketRecommendation }
  | { kind: "close"; reason: string }
);
export interface TicketRequest { contractVersion: "consultation-ticket-request.v1"; expectedActorId: string; clientToken: string; command: TicketCommand }
export interface TicketEvent { id: string; actorId: string; version: number; createdAt: string; command: TicketCommand; contentHash: string }
export interface TicketReceipt { contractVersion: "consultation-ticket-write.v1"; actorId: string; clientToken: string; command: TicketCommand; id: string; version: number; reused: boolean; canonicalContentHash: string }
export interface TicketRead {
  contractVersion: "consultation-ticket-read.v1"; actorId: string; relationshipId: string; requestId: string;
  writeAvailability: "service_entitlement_not_connected";
  history: { state: "ready"; events: TicketEvent[] } | { state: "unavailable"; events: null };
}
const id = (value: unknown): string => { if (!uuid(value)) throw Error("شناسه معتبر نیست."); return value.toLowerCase(); };
const version = (value: unknown, base = false): number => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < (base ? 0 : 1) || value > (base ? 2147483646 : 2147483647)) throw Error("نسخه معتبر نیست.");
  return value;
};
const hash = (value: unknown): string => { if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw Error("اثر انگشت معتبر نیست."); return value; };
const stable = (value: unknown): string => JSON.stringify(value, (_, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
function timestamp(value: unknown): string {
  if (typeof value !== "string" || value.startsWith("0000") || !/^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value) || !Number.isFinite(Date.parse(value))) throw Error("زمان معتبر نیست.");
  const day = value.slice(0, 10);
  if (new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) throw Error("روز معتبر نیست.");
  return value;
}
/** Postgres timestamps retain microseconds; Date.parse alone truncates them. */
function compareInstants(left: string, right: string): number {
  const milliseconds = Date.parse(left) - Date.parse(right);
  if (milliseconds !== 0) return Math.sign(milliseconds);
  const remainder = (value: string) => Number((value.match(/\.(\d+)/)?.[1] ?? "").padEnd(6, "0").slice(3, 6));
  return Math.sign(remainder(left) - remainder(right));
}
function recommendation(value: unknown): TicketRecommendation {
  const row = object(value, ["sessionId", "version", "contentHash"]);
  return { sessionId: id(row.sessionId), version: version(row.version), contentHash: hash(row.contentHash) };
}
function command(value: unknown): TicketCommand {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("کنش معتبر نیست.");
  const kind = (value as Record<string, unknown>).kind;
  const extra = kind === "open" ? ["subject", "text", "recommendation"] : kind === "member_followup" || kind === "advisor_clarification" ? ["text"] : kind === "link_recommendation" ? ["recommendation"] : kind === "close" ? ["reason"] : null;
  if (!extra) throw Error("کنش معتبر نیست.");
  const row = object(value, ["kind", "relationshipId", "requestId", "baseVersion", ...extra]);
  const target = { relationshipId: id(row.relationshipId), requestId: id(row.requestId), baseVersion: version(row.baseVersion, true) };
  if (kind === "open") {
    if (target.baseVersion !== 0) throw Error("نسخهٔ آغاز معتبر نیست.");
    return { ...target, kind, subject: text(row.subject, 200), text: text(row.text, 2000), recommendation: row.recommendation === null ? null : recommendation(row.recommendation) };
  }
  if (target.baseVersion === 0) throw Error("نسخهٔ مبنا برای پیگیری لازم است.");
  if (kind === "member_followup" || kind === "advisor_clarification") return { ...target, kind, text: text(row.text, 2000) };
  if (kind === "link_recommendation") return { ...target, kind, recommendation: recommendation(row.recommendation) };
  return { ...target, kind: "close", reason: text(row.reason, 2000) };
}
export function validateTicketRequest(value: unknown): TicketRequest {
  const row = object(value, ["contractVersion", "expectedActorId", "clientToken", "command"]);
  if (row.contractVersion !== "consultation-ticket-request.v1") throw Error("قرارداد درخواست معتبر نیست.");
  const result: TicketRequest = { contractVersion: row.contractVersion, expectedActorId: id(row.expectedActorId), clientToken: text(row.clientToken, 200), command: command(row.command) };
  if (new TextEncoder().encode(JSON.stringify(result)).length > TICKET_BODY_LIMIT) throw Error("حجم درخواست بیش از حد مجاز است.");
  return result;
}
function parent(read: ConsultationRead, actorId: string) {
  const validated = validateConsultationRead(read, { actorId: id(actorId) });
  if (!validated.selected) throw Error("رابطهٔ مجاز انتخاب نشده است.");
  const relation = validated.selected;
  // Same history boundary as consultation_private.access: member retains history,
  // revoked/disabled advisor does not gain it from a ticket DTO.
  if (validated.actor.id === relation.advisorId && (!validated.actor.isAdvisor || relation.revoked)) throw Error("دسترسی مشاور تأیید نشده است.");
  return { read: validated, relation };
}
function resolveInParent(reference: TicketRecommendation, context: ReturnType<typeof parent>) {
  const ref = recommendation(reference);
  const session = context.read.sessions.find(item => item.id === ref.sessionId);
  if (!session) return { state: "unknown" as const, reference: ref };
  if (session.relationshipId !== context.relation.id || session.version !== ref.version || session.contentHash !== ref.contentHash || !["published", "withdrawn"].includes(session.state)) throw Error("پیوند نسخه با مرجع مجاز مطابق نیست.");
  // Withdrawn does not prove that a draft/approval was ever published to the member.
  if (!session.approval || !context.read.events.some(event => event.sessionId === session.id && event.kind === "publish")) return { state: "unknown" as const, reference: ref };
  return { state: "resolved" as const, reference: ref };
}
export function resolveTicketRecommendation(reference: TicketRecommendation, source: ConsultationRead) {
  return resolveInParent(reference, parent(source, source.actor.id));
}
export function validateTicketRead(value: unknown, source: ConsultationRead, requestId: string): TicketRead {
  const context = parent(source, source.actor.id);
  const row = object(value, ["contractVersion", "actorId", "relationshipId", "requestId", "writeAvailability", "history"]);
  if (row.contractVersion !== "consultation-ticket-read.v1" || id(row.actorId) !== context.read.actor.id || id(row.relationshipId) !== context.relation.id || id(row.requestId) !== id(requestId) || row.writeAvailability !== "service_entitlement_not_connected") throw Error("هویت، درخواست یا قرارداد خواندن تغییر کرده است.");
  const history = object(row.history, ["state", "events"]);
  const result = { contractVersion: row.contractVersion, actorId: context.read.actor.id, relationshipId: context.relation.id, requestId: id(row.requestId), writeAvailability: row.writeAvailability } as const;
  if (history.state === "unavailable") {
    if (history.events !== null) throw Error("تاریخچهٔ نامعلوم، فهرست خالی نیست.");
    return { ...result, history: { state: "unavailable", events: null } };
  }
  if (history.state !== "ready" || !Array.isArray(history.events) || history.events.length === 0 || history.events.length > TICKET_HISTORY_LIMIT) throw Error("تاریخچه کامل نیست.");
  const events: TicketEvent[] = history.events.map(value => {
    const event = object(value, ["id", "actorId", "version", "createdAt", "command", "contentHash"]);
    return { id: id(event.id), actorId: id(event.actorId), version: version(event.version), createdAt: timestamp(event.createdAt), command: command(event.command), contentHash: hash(event.contentHash) };
  });
  if (new Set(events.map(event => event.id)).size !== events.length) throw Error("رویداد تکراری است.");
  let closed = false;
  for (const [index, event] of events.entries()) {
    const c = event.command;
    if (closed || event.version !== index + 1 || c.baseVersion !== index || c.requestId !== result.requestId || c.relationshipId !== result.relationshipId || (index === 0) !== (c.kind === "open")) throw Error("تاریخچهٔ ترتیبی درخواست معتبر نیست.");
    const memberEvent = c.kind === "open" || c.kind === "member_followup";
    if (event.actorId !== (memberEvent ? context.relation.clientId : context.relation.advisorId)) throw Error("ثبت‌کننده با نوع رویداد مطابق نیست.");
    if (compareInstants(event.createdAt, context.relation.createdAt) < 0 || index && compareInstants(event.createdAt, events[index - 1].createdAt) < 0) throw Error("ترتیب زمانی معتبر نیست.");
    if (c.kind === "link_recommendation" || c.kind === "open" && c.recommendation !== null) resolveInParent(c.recommendation!, context);
    closed = c.kind === "close";
  }
  return { ...result, history: { state: "ready", events } };
}
/** Structural/CAS preparation only. Even success grants no write capability. */
export function validateTicketTransition(input: unknown, source: ConsultationRead, prior: TicketRead | null): TicketRequest {
  const request = validateTicketRequest(input), context = parent(source, request.expectedActorId), c = request.command;
  if (context.relation.revoked || c.relationshipId !== context.relation.id) throw Error("رضایت فعال برای نوشتن تأیید نشده است.");
  const memberEvent = c.kind === "open" || c.kind === "member_followup";
  if (memberEvent ? request.expectedActorId !== context.relation.clientId : request.expectedActorId !== context.relation.advisorId || !context.read.actor.isOwner) throw Error("نقش ثبت‌کننده با کنش مطابق نیست.");
  if (c.kind === "open") {
    if (prior !== null) throw Error("درخواست موجود دوباره آغاز نمی‌شود.");
  } else {
    if (!prior) throw Error("تاریخچهٔ درخواست لازم است.");
    const data = validateTicketRead(prior, context.read, c.requestId);
    if (data.history.state !== "ready") throw Error("پیش از تلاش تازه، تاریخچه خوانده شود.");
    const latest = data.history.events[data.history.events.length - 1];
    if (latest.command.kind === "close" || latest.version !== c.baseVersion || latest.version >= TICKET_HISTORY_LIMIT) throw Error("نسخهٔ مبنا یا وضعیت درخواست تغییر کرده است.");
  }
  if (c.kind === "link_recommendation" || c.kind === "open" && c.recommendation !== null) {
    if (resolveInParent(c.recommendation!, context).state !== "resolved") throw Error("پیوند تازه بدون نسخهٔ دقیق مجاز ثبت نمی‌شود.");
  }
  return request;
}
export function validateTicketReceipt(value: unknown, input: TicketRequest): TicketReceipt {
  const request = validateTicketRequest(input), row = object(value, ["contractVersion", "actorId", "clientToken", "command", "id", "version", "reused", "canonicalContentHash"]);
  if (row.contractVersion !== "consultation-ticket-write.v1" || row.actorId !== request.expectedActorId || row.clientToken !== request.clientToken || stable(row.command) !== stable(request.command) || version(row.version) !== request.command.baseVersion + 1 || typeof row.reused !== "boolean") throw Error("رسید با همان تلاش مطابق نیست.");
  return { contractVersion: row.contractVersion, actorId: request.expectedActorId, clientToken: request.clientToken, command: request.command, id: id(row.id), version: row.version as number, reused: row.reused, canonicalContentHash: hash(row.canonicalContentHash) };
}
/** Caller supplies a validated, independent read; a receipt alone is insufficient. */
export function ticketReceiptVisible(data: TicketRead, receipt: TicketReceipt): boolean {
  return data.actorId === receipt.actorId && data.relationshipId === receipt.command.relationshipId && data.requestId === receipt.command.requestId && data.history.state === "ready" && data.history.events.some(event => event.id === receipt.id && event.actorId === receipt.actorId && event.version === receipt.version && event.contentHash === receipt.canonicalContentHash && stable(event.command) === stable(receipt.command));
}
export function ticketStatus(data: TicketRead): "open" | "closed" | null {
  return data.history.state === "unavailable" ? null : data.history.events[data.history.events.length - 1].command.kind === "close" ? "closed" : "open";
}

/** Detect a changed/shortened confirmed prefix without treating recovery as proof. */
export function validateTicketContinuation(previous: unknown, next: unknown, source: ConsultationRead, requestId: string) {
  const before = validateTicketRead(previous, source, requestId), after = validateTicketRead(next, source, requestId);
  if (before.history.state !== "ready" || after.history.state !== "ready") return { data: after, continuity: "unknown" as const };
  const oldEvents = before.history.events, newEvents = after.history.events;
  if (newEvents.length < oldEvents.length || oldEvents.some((event, index) => stable(event) !== stable(newEvents[index]))) throw Error("تاریخچهٔ تأییدشده بازنویسی شده است.");
  return { data: after, continuity: "verified" as const };
}

export interface TicketEntitlementRow {
  id: string; user_id: string; kind: "consulting" | "webinar" | "manual"; source: string | null;
  starts_at: string; expires_at: string; revoked_at: string | null;
}
export type TicketEntitlementSnapshot = { state: "not_connected"; rows: null } | { state: "unavailable"; rows: null } | { state: "ready"; rows: unknown[]; complete: boolean };
/** In-memory classification, not an authority or an operational entitlement reader. */
export function classifyTicketEntitlement(snapshot: unknown, clientId: string, evaluatedAt: string): { state: "active" | "inactive" | "unknown" | "not_connected"; writeEnabled: false; authority: "not_connected"; matchingIds: string[] | null } {
  const result = (state: "active" | "inactive" | "unknown" | "not_connected", matchingIds: string[] | null = null) => ({ state, writeEnabled: false as const, authority: "not_connected" as const, matchingIds });
  try {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return result("unknown");
    const state = (snapshot as Record<string, unknown>).state;
    const input = object(snapshot, state === "ready" ? ["state", "rows", "complete"] : ["state", "rows"]);
    if (state === "not_connected" && input.rows === null) return result("not_connected");
    if (state !== "ready" || input.complete !== true) return result("unknown");
    const client = id(clientId), now = timestamp(evaluatedAt);
    if (!Array.isArray(input.rows) || input.rows.length > 1000) return result("unknown");
    const rows: TicketEntitlementRow[] = input.rows.map(value => {
      const row = object(value, ["id", "user_id", "kind", "source", "starts_at", "expires_at", "revoked_at"]);
      if (!["consulting", "webinar", "manual"].includes(String(row.kind)) || id(row.user_id) !== client || row.source !== null && typeof row.source !== "string") throw Error("منبع حق معتبر نیست.");
      const startsAt = timestamp(row.starts_at), expiresAt = timestamp(row.expires_at);
      if (compareInstants(expiresAt, startsAt) <= 0) throw Error("دورهٔ حق معتبر نیست.");
      return { id: id(row.id), user_id: client, kind: row.kind as TicketEntitlementRow["kind"], source: row.source as string | null, starts_at: startsAt, expires_at: expiresAt, revoked_at: row.revoked_at === null ? null : timestamp(row.revoked_at) };
    });
    if (new Set(rows.map(row => row.id)).size !== rows.length) return result("unknown");
    const matchingIds = rows.filter(row => row.kind === "consulting" && row.revoked_at === null && compareInstants(row.starts_at, now) <= 0 && compareInstants(now, row.expires_at) < 0).map(row => row.id);
    return result(matchingIds.length ? "active" : "inactive", matchingIds);
  } catch { return result("unknown"); }
}
