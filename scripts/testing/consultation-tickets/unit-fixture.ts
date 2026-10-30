// Unit-boundary values only. Not database/Auth/runtime evidence or a right provider.
import type { ConsultationRead } from "../../../lib/consultation/contracts";
import type { TicketRequest, TicketReceipt, TicketRead } from "../../../lib/consultation/tickets";
import type { TicketStorageEnvelope } from "../../../lib/consultation/ticketStorageContracts";
export const uid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
export const M = uid(1), O = uid(2), R = uid(3), Q = uid(4);
export function parent(advisor = false): ConsultationRead {
  const relation = { id: R, clientId: M, advisorId: O, clientLabel: "عضو ساختگی آزمون واحد", createdAt: "2026-10-01T00:00:00Z", revoked: false };
  return { contractVersion: "consultation-read.v1", actor: { id: advisor ? O : M, isAdvisor: advisor, isOwner: advisor }, advisors: [{ id: O, displayName: "مالک ساختگی", isOwner: true }], relationships: [relation], selected: relation, dossier: { basis: { holdingsVersionId: null, cashFlowVersionId: null, goalsVersionId: null, cashFlowPeriod: { startOn: "2026-10-01", endOn: "2026-10-31" } }, holdings: null, cashFlow: null, goals: null }, sessions: [], notes: [], events: [], actions: [] };
}
export function opening(): TicketRequest { return { contractVersion: "consultation-ticket-request.v1", expectedActorId: M, clientToken: "unit-attempt", command: { kind: "open", relationshipId: R, requestId: Q, baseVersion: 0, subject: "پرسش ساختگی", text: "متن خصوصی آزمون واحد", recommendation: null } }; }
export function receipt(input = opening()): TicketReceipt { return { contractVersion: "consultation-ticket-write.v1", actorId: input.expectedActorId, clientToken: input.clientToken, command: input.command, id: uid(5), version: 1, reused: false, canonicalContentHash: "a".repeat(64) }; }
export function history(input = opening()): TicketRead { const saved = receipt(input); return { contractVersion: "consultation-ticket-read.v1", actorId: input.expectedActorId, relationshipId: R, requestId: Q, writeAvailability: "service_entitlement_not_connected", history: { state: "ready", events: [{ id: saved.id, actorId: saved.actorId, version: 1, createdAt: "2026-10-31T00:00:00Z", command: saved.command, contentHash: saved.canonicalContentHash }] } }; }
export function lookup(options: { found?: boolean; attempt?: boolean; product?: boolean } = {}, input = opening()): Extract<TicketStorageEnvelope, { mode: "lookup" }> {
  return { contractVersion: "consultation-ticket-storage.v1", mode: "lookup", capability: options.product ? { state: "not_connected", runId: null } : { state: "owned_fixture", runId: "unit-boundary-only" }, data: { contractVersion: "consultation-ticket-lookup.v1", actorId: input.expectedActorId, relationshipId: input.command.relationshipId, requestId: input.command.requestId, clientToken: input.clientToken, authority: "not_connected", request: options.found ? { state: "found", data: history(input) } : { state: "confirmed_absent", data: null }, attempt: options.attempt ? { state: "found", receipt: receipt(input) } : { state: "confirmed_absent", receipt: null } } };
}
