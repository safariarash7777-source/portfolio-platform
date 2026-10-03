import {isAuthSessionMissingError} from '@supabase/supabase-js';

const REJECTED_SESSION_CODES = new Set([
  'bad_jwt', 'no_authorization', 'session_expired', 'session_not_found',
  'refresh_token_not_found', 'refresh_token_already_used',
  'flow_state_expired', 'flow_state_not_found',
]);

/** Validation/refresh only: ambiguous transport/provider faults do not prove logout. */
export function authSessionFailure(error: unknown): 401 | 503 | null {
  if (!error) return null;
  if (isAuthSessionMissingError(error)) return 401;
  const failure = typeof error === 'object' ? error as {status?: unknown; code?: unknown} : {};
  if (failure.status === 401 || failure.status === 403) return 401;
  if (failure.status === 400 && typeof failure.code === 'string' && REJECTED_SESSION_CODES.has(failure.code)) return 401;
  return 503;
}
