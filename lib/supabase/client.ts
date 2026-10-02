import { createBrowserClient } from '@supabase/ssr'
import { DeadlineError, withDeadline } from '../deadline'

export function createClient(authSignal?: AbortSignal) {
  const cookieOptions = process.env.NEXT_PUBLIC_SUPABASE_COOKIE_NAME
    ? {cookieOptions:{name:process.env.NEXT_PUBLIC_SUPABASE_COOKIE_NAME}}
    : undefined
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    authSignal ? {
      ...cookieOptions,
      // A request-scoped signal must never be cached in the default SDK singleton.
      isSingleton: false,
      global: {fetch: (input, init) => withDeadline(async signal => {
        const combined = init?.signal ? AbortSignal.any([signal, init.signal]) : signal
        const response = await fetch(input, {...init, signal: combined})
        const body = await response.arrayBuffer()
        // Buffer through the deadline before the SDK can persist a session.
        // This also prevents a late response from an abort-ignoring transport.
        if (combined.aborted) throw new DeadlineError()
        return new Response([204,205,304].includes(response.status) ? null : body, {
          status: response.status, statusText: response.statusText, headers: response.headers,
        })
      }, 8000, authSignal)},
    } : cookieOptions
  )
}
