import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { accountEntryHref, normalizeReturnPath } from '@/components/account/returnPath'
import { authSessionFailure } from '@/lib/auth/session-error'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // همان قانونی که لینک‌های ورود/ثبت‌نام با آن ساخته می‌شوند. پیش از این
  // اینجا یک بررسیِ جداگانه و سست‌تر بود (backslash و نویسهٔ کنترلی را رد
  // نمی‌کرد)؛ دو تعریف از «مسیرِ امن» یعنی روزی یکی‌شان عقب می‌ماند.
  const next = normalizeReturnPath(searchParams.get('next'), '/dashboard')

  const supabaseResponse = NextResponse.redirect(`${origin}${next}`)
  supabaseResponse.headers.set('Cache-Control', 'private, no-store')
  const failed = (reason: 'auth_unavailable' | 'auth_callback_failed') => {
    const response = NextResponse.redirect(new URL(accountEntryHref('/login', next) + '&error=' + reason, origin))
    supabaseResponse.cookies.getAll().forEach(cookie => response.cookies.set(cookie))
    for (const name of ['cache-control', 'expires', 'pragma']) {
      const value = supabaseResponse.headers.get(name)
      if (value) response.headers.set(name, value)
    }
    return response
  }
  if (!code) return failed('auth_callback_failed')
  const controller = new AbortController()
  let deadline: ReturnType<typeof setTimeout> | undefined
  try {

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        ...(process.env.NEXT_PUBLIC_SUPABASE_COOKIE_NAME
          ? {cookieOptions:{name:process.env.NEXT_PUBLIC_SUPABASE_COOKIE_NAME}}
          : {}),
        global: { fetch: (input, init) => fetch(input, { ...init, signal: controller.signal }) },
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet, headers) {
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            )
            Object.entries(headers ?? {}).forEach(([name, value]) => supabaseResponse.headers.set(name, value))
          },
        },
      }
    )

    return await Promise.race([
      supabase.auth.exchangeCodeForSession(code).then(({error}) => error
        ? failed(authSessionFailure(error) === 503 ? 'auth_unavailable' : 'auth_callback_failed')
        : supabaseResponse),
      new Promise<NextResponse>(resolve => {
        deadline = setTimeout(() => { controller.abort(); resolve(failed('auth_unavailable')) }, 8000)
      }),
    ])
  } catch {
    return failed('auth_unavailable')
  } finally {
    if (deadline) clearTimeout(deadline)
  }
}
