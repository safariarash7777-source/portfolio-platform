import { CONTRACT_VERSION } from "../seasonal/contracts";
import { authSessionFailure } from "../auth/session-error";
export class MemberReadError extends Error { constructor(public status: number) { super("Member request unavailable"); } }
export type MemberRequest = (path: string, init?: RequestInit) => Promise<Response>;
export async function memberData<T>(path: string, guard: (v: unknown) => v is T, request: MemberRequest = fetch, init?: RequestInit): Promise<T> {
  let r: Response;
  try { r = await request(path, { ...init, cache: "no-store", credentials: "same-origin" }); } catch { throw new MemberReadError(503); }
  if (!r.ok) throw new MemberReadError(r.status);
  let body: unknown; try { body = await r.json(); } catch { throw new MemberReadError(503); }
  if (!body || typeof body !== "object") throw new MemberReadError(503);
  const b = body as Record<string, unknown>;
  if (b.contractVersion !== CONTRACT_VERSION || !guard(b.data)) throw new MemberReadError(503);
  return b.data;
}
export const memberErrorStatus = (e: unknown): number => e instanceof MemberReadError ? e.status : 503;
// Presentation of the existing Auth response; this does not create an Auth policy.
export function memberAuthErrorStatus(error: unknown): 401 | 503 {
  return authSessionFailure(error) ?? 503;
}
