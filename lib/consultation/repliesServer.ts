import type { SupabaseClient } from "@supabase/supabase-js";
import { withDeadline } from "@/lib/deadline";
import { authSessionFailure } from "@/lib/auth/session-error";
import { REPLY_BODY_LIMIT, validateReplyRequest, validateReplyRead, validateReplyReceipt, type ReplyRequest } from "./replies";
import { CONSULTATION_ERRORS, consultationError, type ConsultationErrorCode } from "./errors";

interface DbResult { data: unknown; error: { code?: string } | null }
export interface ReplyDb {
  authenticate(): Promise<{ user: { id: string } | null; error: unknown }>;
  read(selection: { relationshipId: string; sessionId: string }, signal: AbortSignal): PromiseLike<DbResult>;
  write(request: ReplyRequest, signal: AbortSignal): PromiseLike<DbResult>;
}
export function replyDb(client: SupabaseClient): ReplyDb {
  return {
    async authenticate() { const { data, error } = await client.auth.getUser(); return { user: data.user, error }; },
    read: (s, signal) => client.rpc("load_consultation_replies", { p_relationship: s.relationshipId, p_session: s.sessionId }).abortSignal(signal),
    write: (request, signal) => client.rpc("command_consultation_reply", { p_request: request }).abortSignal(signal),
  };
}
class Failure extends Error { constructor(readonly code: ConsultationErrorCode) { super(code); } }
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const fail = (error: unknown, fallback: ConsultationErrorCode) => {
  const code = error instanceof Failure ? error.code : fallback;
  return json(consultationError(code), CONSULTATION_ERRORS[code][0]);
};
function dbFailure(code?: string): never {
  throw new Failure(code === "42501" ? "FORBIDDEN" : code === "P0002" ? "NOT_FOUND" : ["PT409", "40001", "23505"].includes(code ?? "") ? "CONFLICT" : ["22023", "22P02", "22007", "22008", "23514"].includes(code ?? "") ? "INVALID_INPUT" : "WRITE_UNAVAILABLE");
}
async function actor(db: ReplyDb) {
  let auth: Awaited<ReturnType<ReplyDb["authenticate"]>>;
  try { auth = await db.authenticate(); } catch { throw new Failure("AUTH_UNAVAILABLE"); }
  const status = authSessionFailure(auth.error);
  if (status === 503) throw new Failure("AUTH_UNAVAILABLE");
  if (status === 401 || !auth.user) throw new Failure("AUTH_REQUIRED");
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(auth.user.id)) throw new Failure("AUTH_UNAVAILABLE");
  return auth.user.id;
}
async function body(request: Request, signal: AbortSignal): Promise<unknown> {
  if (!request.body) throw new Failure("INVALID_INPUT");
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let bytes = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      if (signal.aborted) throw new Error("deadline");
      const chunk = await reader.read();
      if (signal.aborted) throw new Error("deadline");
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > REPLY_BODY_LIMIT) { cancel(); throw new Failure("BODY_TOO_LARGE"); }
      chunks.push(chunk.value);
    }
    const buffer = new Uint8Array(bytes); let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
    try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer)); } catch { throw new Failure("INVALID_INPUT"); }
  } finally { signal.removeEventListener("abort", cancel); reader.releaseLock(); }
}
export async function postReply(request: Request, connect: () => Promise<ReplyDb>): Promise<Response> {
  if (request.headers.get("origin") !== new URL(request.url).origin) return fail(new Failure("ORIGIN_FORBIDDEN"), "WRITE_UNAVAILABLE");
  let prepared: { db: ReplyDb; input: ReplyRequest };
  try {
    prepared = await withDeadline(async signal => {
      let db: ReplyDb;
      try { db = await connect(); } catch { throw new Failure("AUTH_UNAVAILABLE"); }
      const actorId = await actor(db), value = await body(request, signal);
      let input: ReplyRequest;
      try { input = validateReplyRequest(value); } catch { throw new Failure("INVALID_INPUT"); }
      if (input.expectedActorId !== actorId) throw new Failure("ACTOR_CHANGED");
      if (signal.aborted) throw new Error("deadline");
      return { db, input }; // No write can start inside the preparation deadline.
    }, 10_000);
  } catch (error) { return fail(error, "WRITE_UNAVAILABLE"); }
  try {
    const result = await withDeadline(signal => Promise.resolve(prepared.db.write(prepared.input, signal)), 10_000);
    if (result.error) dbFailure(result.error.code);
    const receipt = validateReplyReceipt(result.data, prepared.input);
    return json(receipt, receipt.reused ? 200 : 201);
  } catch (error) { return fail(error, "WRITE_UNAVAILABLE"); }
}
export async function getReplies(request: Request, connect: () => Promise<ReplyDb>): Promise<Response> {
  try {
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(key => !["relationshipId", "sessionId"].includes(key) || params.getAll(key).length !== 1)) throw new Failure("INVALID_INPUT");
    const relationshipId = params.get("relationshipId"), sessionId = params.get("sessionId");
    const validId = (v: string | null): v is string => v !== null && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
    if (!validId(relationshipId) || !validId(sessionId)) throw new Failure("INVALID_INPUT");
    return await withDeadline(async signal => {
      let db: ReplyDb;
      try { db = await connect(); } catch { throw new Failure("AUTH_UNAVAILABLE"); }
      const actorId = await actor(db);
      if (signal.aborted) throw new Error("deadline");
      const result = await db.read({ relationshipId, sessionId }, signal);
      if (result.error) {
        if (result.error.code === "42501") throw new Failure("FORBIDDEN");
        if (result.error.code === "P0002") throw new Failure("NOT_FOUND");
        throw new Failure("READ_UNAVAILABLE");
      }
      return json(validateReplyRead(result.data, { relationshipId, sessionId, actorId }));
    }, 10_000);
  } catch (error) { return fail(error, "READ_UNAVAILABLE"); }
}