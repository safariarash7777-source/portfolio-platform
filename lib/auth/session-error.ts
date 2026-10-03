import {isAuthSessionMissingError} from '@supabase/supabase-js';

const REJECTED_SESSION_CODES = new Set([
  'bad_jwt', 'no_authorization', 'session_expired', 'session_not_found',
  'refresh_token_not_found', 'refresh_token_already_used',
  'flow_state_expired', 'flow_state_not_found',
]);

/** Session validation/refresh only; OTP/form/provider errors have their own contract. */
export function authSessionFailure(error: unknown): 401 | 503 | null {
  if (!error) return null;
  if (isAuthSessionMissingError(error)) return 401;
  const failure = typeof error === 'object' ? error as {status?: unknown; code?: unknown} : {};
  if (failure.status === 401 || failure.status === 403) return 401;
  // A 400 refresh response can explicitly revoke/expire a session. A bare 400,
  // wrong-path 404 or rate-limit 429 does not establish that the user signed out.
  if (failure.status === 400 && typeof failure.code === 'string' && REJECTED_SESSION_CODES.has(failure.code)) return 401;
  return 503;
}
