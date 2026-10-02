import {isAuthPKCECodeVerifierMissingError, isAuthSessionMissingError} from '@supabase/supabase-js';

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

/** A consumed/absent PKCE verifier invalidates this callback, not the session service. */
export function authCallbackFailure(error: unknown): 'auth_callback_failed' | 'auth_unavailable' {
  if (isAuthPKCECodeVerifierMissingError(error)) return 'auth_callback_failed';
  return authSessionFailure(error) === 503 ? 'auth_unavailable' : 'auth_callback_failed';
}

/** OTP/password actions preserve input errors and limits without calling them logout. */
export function authActionFailure(error: unknown): 400 | 429 | 503 | null {
  if (!error) return null;
  const failure = typeof error === 'object' ? error as {status?: unknown; code?: unknown} : {};
  if (failure.status === 429) return 429;
  if (typeof failure.code === 'string' && [
    'phone_provider_disabled', 'email_provider_disabled', 'provider_disabled', 'otp_disabled',
    'sms_send_failed', 'hook_timeout', 'hook_timeout_after_retry', 'request_timeout',
  ].includes(failure.code)) return 503;
  return [400, 401, 403, 422].includes(failure.status as number) ? 400 : 503;
}
