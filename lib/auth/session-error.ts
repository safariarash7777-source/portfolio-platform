import {isAuthSessionMissingError} from '@supabase/supabase-js';

/** SDK-returned failures need classification even when getUser did not throw. */
export function authSessionFailure(error: unknown): 401 | 503 | null {
  if (!error) return null;
  if (isAuthSessionMissingError(error)) return 401;
  const status = typeof error === 'object' && 'status' in error ? error.status : undefined;
  // Expired/rejected credentials require login; transport/configuration is retryable.
  return typeof status === 'number' && status >= 400 && status < 500 ? 401 : 503;
}
