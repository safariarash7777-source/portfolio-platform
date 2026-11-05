// Controlled unit values only; not DB time, Auth, permission or persistence evidence.
import { opening, uid } from "./unit-fixture";
import { validateTicketRequest, type TicketRequest } from "../../../lib/consultation/tickets";
import { ticketBodyHash, type TicketPrepared, type TicketPreparationReceipt, type TicketAttemptList, type TicketAttemptLookup } from "../../../lib/consultation/ticketAttemptStorageContracts";
export async function prepared(input: TicketRequest = opening()): Promise<TicketPrepared> {
  const request = validateTicketRequest(input), body = JSON.stringify(request);
  return { contractVersion: "consultation-ticket-prepared.v1", actorId: request.expectedActorId, relationshipId: request.command.relationshipId, preparationId: uid(50), requestId: request.command.requestId, clientToken: request.clientToken, bodyHash: await ticketBodyHash(body), createdAt: "2026-10-31T00:00:00.123456Z", fixtureRunId: "unit-boundary-only", body };
}
export function preparationReceipt(p: TicketPrepared, reused = false): TicketPreparationReceipt {
  const { body: _body, contractVersion: _version, ...metadata } = p;
  return { contractVersion: "consultation-ticket-preparation.v1", ...metadata, reused };
}
export function attemptList(p: TicketPrepared): TicketAttemptList {
  const input = validateTicketRequest(JSON.parse(p.body));
  return { contractVersion: "consultation-ticket-attempt-list.v1", actorId: p.actorId, relationshipId: p.relationshipId, attempts: [{ preparationId: p.preparationId, requestId: p.requestId, kind: input.command.kind, baseVersion: input.command.baseVersion, bodyHash: p.bodyHash, createdAt: p.createdAt }] };
}
export function attemptLookup(p: TicketPrepared, byId = false, found = true): TicketAttemptLookup {
  return { contractVersion: "consultation-ticket-attempt-lookup.v1", actorId: p.actorId, relationshipId: p.relationshipId, preparationId: byId ? p.preparationId : null, clientToken: byId ? null : p.clientToken, state: found ? "found" : "confirmed_absent", prepared: found ? p : null };
}
