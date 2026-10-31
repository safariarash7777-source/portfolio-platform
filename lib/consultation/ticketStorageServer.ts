import type { SupabaseClient } from "@supabase/supabase-js";
import { consultationWritesReleased } from "./consultationWriteRelease";
import { TICKET_RELEASE_ERROR } from "./ticketStorageContracts";
import { withDeadline } from "../deadline";
import { authSessionFailure } from "../auth/session-error";
import { validateConsultationRead } from "./contracts";
import { consultationError, type ConsultationErrorCode } from "./errors";
import { TICKET_BODY_LIMIT, validateTicketReceipt, validateTicketRequest, type TicketRequest } from "./tickets";
import { parseTicketStorageSelection, ticketStorageErrorStatus, ticketStorageParent, validateTicketStorageEnvelope, TICKET_RIGHT_ERROR, type TicketStorageError, type TicketStorageSelection } from "./ticketStorageContracts";

interface DbResult { data: unknown; error: { code?: string } | null }
export interface TicketStorageDb {
  authenticate(): Promise<{ user: { id: string } | null; error: unknown }>;
  parent(relationshipId: string, signal: AbortSignal): PromiseLike<DbResult>;
  read(selection: TicketStorageSelection, signal: AbortSignal): PromiseLike<DbResult>;
  write(input: TicketRequest, signal: AbortSignal): PromiseLike<DbResult>;
}
export function ticketStorageDb(client: SupabaseClient): TicketStorageDb {
  return {
    async authenticate() { const { data, error } = await client.auth.getUser(); return { user: data.user, error }; },
    parent: (relationshipId, signal) => client.rpc("load_consultation", { p_relation: relationshipId, p_start_on: null, p_end_on: null }).abortSignal(signal),
    read: (selection, signal) => selection.mode === "inbox"
      ? client.rpc("load_consultation_ticket_inbox", { p_relationship: selection.relationshipId }).abortSignal(signal)
      : selection.mode === "read"
        ? client.rpc("load_consultation_ticket", { p_relationship: selection.relationshipId, p_request: selection.requestId }).abortSignal(signal)
        : client.rpc("lookup_consultation_ticket", { p_relationship: selection.relationshipId, p_request: selection.requestId, p_client_token: selection.clientToken }).abortSignal(signal),
    write: (input, signal) => client.rpc("command_consultation_ticket", { p_request: input }).abortSignal(signal),
  };
}
class Failure extends Error { constructor(readonly code: ConsultationErrorCode | "SERVICE_RIGHT_NOT_CONNECTED") { super(code); } }
const response = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
function fail(error: unknown, fallback: ConsultationErrorCode) {
  const code = error instanceof Failure ? error.code : fallback;
  const value: TicketStorageError = code === "SERVICE_RIGHT_NOT_CONNECTED" ? TICKET_RIGHT_ERROR : consultationError(code);
  return response(value, ticketStorageErrorStatus(value));
}
function databaseFailure(code: string | undefined, read = false): never {
  throw new Failure(code === "42501" ? "FORBIDDEN" : code === "P0002" ? "NOT_FOUND"
    : ["PT409", "40001", "23505"].includes(code ?? "") ? "CONFLICT"
      : code === "PT503" ? "SERVICE_RIGHT_NOT_CONNECTED"
        : ["22023", "22P02", "22003", "23514"].includes(code ?? "") ? "INVALID_INPUT" : read ? "READ_UNAVAILABLE" : "WRITE_UNAVAILABLE");
}
async function authenticate(db: TicketStorageDb): Promise<string> {
  let identity;
  try { identity = await db.authenticate(); } catch { throw new Failure("AUTH_UNAVAILABLE"); }
  const status = authSessionFailure(identity.error);
  if (status === 503) throw new Failure("AUTH_UNAVAILABLE");
  if (status === 401 || !identity.user) throw new Failure("AUTH_REQUIRED");
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(identity.user.id)) throw new Failure("AUTH_UNAVAILABLE");
  return identity.user.id;
}
async function parent(db: TicketStorageDb, actorId: string, relationshipId: string, signal: AbortSignal) {
  const result = await db.parent(relationshipId, signal);
  if (result.error) databaseFailure(result.error.code, true);
  // No private fallback on authorization failure. DB repeats this check under
  // the same relation lock as revocation, in the read/write transaction itself.
  let validated;
  try { validated = validateConsultationRead(result.data, { actorId, relationshipId }); } catch { throw new Failure("READ_UNAVAILABLE"); }
  try { return ticketStorageParent(validated, actorId, relationshipId); } catch { throw new Failure("FORBIDDEN"); }
}
async function inputBody(request: Request, signal: AbortSignal): Promise<unknown> {
  if (!request.body) throw new Failure("INVALID_INPUT");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      if (signal.aborted) throw Error("deadline");
      const item = await reader.read();
      if (signal.aborted) throw Error("deadline");
      if (item.done) break;
      size += item.value.byteLength;
      if (size > TICKET_BODY_LIMIT) { cancel(); throw new Failure("BODY_TOO_LARGE"); }
      chunks.push(item.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const item of chunks) { bytes.set(item, offset); offset += item.byteLength; }
    try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { throw new Failure("INVALID_INPUT"); }
  } finally { signal.removeEventListener("abort", cancel); reader.releaseLock(); }
}
export async function getTicketStorage(request: Request, connect: () => Promise<TicketStorageDb>): Promise<Response> {
  try {
    let selection: TicketStorageSelection;
    try { selection = parseTicketStorageSelection(new URL(request.url).searchParams); } catch { throw new Failure("INVALID_INPUT"); }
    return await withDeadline(async signal => {
      let db: TicketStorageDb;
      try { db = await connect(); } catch { throw new Failure("AUTH_UNAVAILABLE"); }
      const actorId = await authenticate(db), source = await parent(db, actorId, selection.relationshipId, signal);
      if (signal.aborted) throw Error("deadline");
      const result = await db.read(selection, signal);
      if (result.error) databaseFailure(result.error.code, true);
      return response(validateTicketStorageEnvelope(result.data, source, selection));
    }, 10_000);
  } catch (error) { return fail(error, "READ_UNAVAILABLE"); }
}
export async function postTicketStorage(request: Request, connect: () => Promise<TicketStorageDb>): Promise<Response> {
  if (request.headers.get("origin") !== new URL(request.url).origin) return fail(new Failure("ORIGIN_FORBIDDEN"), "WRITE_UNAVAILABLE");
  if (!consultationWritesReleased()) return response(TICKET_RELEASE_ERROR, 503);
  let prepared: { db: TicketStorageDb; input: TicketRequest };
  try {
    prepared = await withDeadline(async signal => {
      let db: TicketStorageDb;
      try { db = await connect(); } catch { throw new Failure("AUTH_UNAVAILABLE"); }
      const actorId = await authenticate(db), value = await inputBody(request, signal);
      let input: TicketRequest;
      try { input = validateTicketRequest(value); } catch { throw new Failure("INVALID_INPUT"); }
      if (input.expectedActorId !== actorId) throw new Failure("ACTOR_CHANGED");
      await parent(db, actorId, input.command.relationshipId, signal);
      if (signal.aborted) throw Error("deadline");
      return { db, input }; // A preparation timeout can never launch a late write.
    }, 10_000);
  } catch (error) { return fail(error, "WRITE_UNAVAILABLE"); }
  if (!consultationWritesReleased()) return response(TICKET_RELEASE_ERROR, 503);
  try {
    const result = await withDeadline(signal => Promise.resolve(prepared.db.write(prepared.input, signal)), 10_000);
    if (result.error) databaseFailure(result.error.code);
    const receipt = validateTicketReceipt(result.data, prepared.input);
    return response(receipt, receipt.reused ? 200 : 201);
  } catch (error) { return fail(error, "WRITE_UNAVAILABLE"); }
}
