import type { SupabaseClient } from "@supabase/supabase-js";
import { withDeadline } from "../deadline";
import { authSessionFailure } from "../auth/session-error";
import { filterRoster, parseRosterFilters, validateRosterRead } from "./rosterContracts";

export interface RosterDb {
  authenticate(): Promise<{ user: { id: string } | null; error: unknown }>;
  read(period: { startOn?: string; endOn?: string }, signal: AbortSignal): PromiseLike<{ data: unknown; error: { code?: string } | null }>;
}
export function rosterDb(client: SupabaseClient): RosterDb {
  return {
    async authenticate() { const { data, error } = await client.auth.getUser(); return { user: data.user, error }; },
    read: (p, signal) => client.rpc("load_consultation_roster", { p_start_on: p.startOn ?? null, p_end_on: p.endOn ?? null }).abortSignal(signal),
  };
}
class RosterFailure extends Error { constructor(readonly code: string, readonly status: number) { super(code); } }
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
export async function getRoster(request: Request, connect: () => Promise<RosterDb>): Promise<Response> {
  try {
    let filters;
    try { filters = parseRosterFilters(new URL(request.url).searchParams); } catch { throw new RosterFailure("INVALID_INPUT", 400); }
    return await withDeadline(async signal => {
      let db: RosterDb;
      try { db = await connect(); } catch { throw new RosterFailure("AUTH_UNAVAILABLE", 503); }
      let auth;
      try { auth = await db.authenticate(); } catch { throw new RosterFailure("AUTH_UNAVAILABLE", 503); }
      const status = authSessionFailure(auth.error);
      if (status === 503) throw new RosterFailure("AUTH_UNAVAILABLE", 503);
      if (status === 401 || !auth.user) throw new RosterFailure("AUTH_REQUIRED", 401);
      if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(auth.user.id)) throw new RosterFailure("AUTH_UNAVAILABLE", 503);
      if (signal.aborted) throw Error("deadline");
      const result = await db.read(filters, signal);
      if (result.error) throw new RosterFailure(result.error.code === "42501" ? "FORBIDDEN" : "READ_UNAVAILABLE", result.error.code === "42501" ? 403 : 503);
      const snapshot = validateRosterRead(result.data, auth.user.id);
      if (filters.startOn && (snapshot.period.startOn !== filters.startOn || snapshot.period.endOn !== filters.endOn)) throw Error("period mismatch");
      return json(validateRosterRead(filterRoster(snapshot, filters), auth.user.id));
    }, 10_000, request.signal);
  } catch (error) {
    const failure = error instanceof RosterFailure ? error : new RosterFailure("READ_UNAVAILABLE", 503);
    return json({ error: { code: failure.code, message: failure.code === "INVALID_INPUT" ? "فیلترهای درخواست معتبر نیستند." : failure.code === "FORBIDDEN" ? "دسترسی مشاور فعال لازم است." : failure.code === "AUTH_REQUIRED" ? "ورود لازم است." : "دریافت فهرست ممکن نشد؛ دوباره تلاش کنید." } }, failure.status);
  }
}
