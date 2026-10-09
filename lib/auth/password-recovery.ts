import { authSessionFailure } from './session-error'

export type PasswordRecoveryStatus = 'ready' | 'invalid' | 'unavailable'

type RecoveryAuth = {
  setSession(tokens: { access_token: string; refresh_token: string }): Promise<{ error: unknown }>
  getUser(): Promise<{ data: { user: unknown | null }; error: unknown }>
}

/** Use the existing SSR client's cookie/session contract; no parallel Auth client. */
export async function initializePasswordRecovery(input: {
  fragment: string
  clearFragment: () => void
  createAuth: () => RecoveryAuth
}): Promise<PasswordRecoveryStatus> {
  if (input.fragment.length > 32768) {
    input.clearFragment()
    return 'invalid'
  }
  const params = new URLSearchParams(input.fragment.replace(/^#/, ''))
  const hasCredentials = ['access_token', 'refresh_token', 'error', 'error_description', 'error_code']
    .some(key => params.has(key)) || params.has('type')

  // Remove credentials before creating the PKCE client or performing any async work.
  // The standard operator recovery redirect has a fragment, not a PKCE code.
  if (hasCredentials) input.clearFragment()

  const access_token = params.get('access_token')
  const refresh_token = params.get('refresh_token')
  if (hasCredentials && (
    params.get('type') !== 'recovery' ||
    params.has('error') || params.has('error_description') || params.has('error_code') ||
    params.getAll('access_token').length !== 1 || params.getAll('refresh_token').length !== 1 ||
    params.getAll('type').length !== 1 || !access_token || !refresh_token
  )) return 'invalid'

  try {
    const auth = input.createAuth()
    if (hasCredentials && access_token && refresh_token) {
      // GoTrue-issued tokens only: the SDK validates/refreshes and writes its own cookies.
      const { error } = await auth.setSession({ access_token, refresh_token })
      if (error) return authSessionFailure(error) === 401 ? 'invalid' : 'unavailable'
    }
    // Also handles the existing PKCE callback's already established session.
    const { data, error } = await auth.getUser()
    if (error) return authSessionFailure(error) === 401 ? 'invalid' : 'unavailable'
    return data.user ? 'ready' : 'invalid'
  } catch {
    return 'unavailable'
  }
}

export function passwordRecoveryRequestError(error: unknown): string | null {
  if (!error) return null
  const failure = typeof error === 'object' ? error as { status?: unknown; code?: unknown } : {}
  if (failure.status === 429 || failure.code === 'over_email_send_rate_limit' ||
      failure.code === 'over_request_rate_limit') {
    return 'تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.'
  }
  // Same response for provider, transport and account-specific failures.
  return 'درخواست بازیابی انجام نشد. لطفاً کمی بعد دوباره تلاش کنید.'
}
