import { createServerClient } from '@supabase/ssr'
import {activeEntitlementFilter} from "./lib/entitlement-filter";
import { NextResponse, type NextRequest } from 'next/server'
import { accountEntryHref } from './components/account/returnPath'
import { authSessionFailure } from './lib/auth/session-error'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })
  supabaseResponse.headers.set('Cache-Control', 'private, no-store')

  const controller = new AbortController()

  const { pathname } = request.nextUrl
  // Auth may refresh cookies during getUser even when the eventual result is a
  // redirect. Preserve those updates; dropping them can repeat refresh/failures.
  const redirect = (path: string) => {
    const response = NextResponse.redirect(new URL(path, request.url))
    supabaseResponse.cookies.getAll().forEach(cookie => response.cookies.set(cookie))
    for (const name of ['cache-control', 'expires', 'pragma']) {
      const value = supabaseResponse.headers.get(name)
      if (value) response.headers.set(name, value)
    }
    return response
  }

  const unavailable = () => redirect(accountEntryHref('/login', pathname + request.nextUrl.search) + '&error=auth_unavailable')
  const runGate = async () => {
  // Configuration errors are part of the same bounded, fail-closed gate.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      ...(process.env.NEXT_PUBLIC_SUPABASE_COOKIE_NAME
        ? {cookieOptions:{name:process.env.NEXT_PUBLIC_SUPABASE_COOKIE_NAME}}
        : {}),
      global: { fetch: (input, init) => fetch(input, { ...init, signal: controller.signal }) },
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options))
          supabaseResponse.headers.set('Cache-Control', 'private, no-store')
          Object.entries(headers ?? {}).forEach(([name, value]) => supabaseResponse.headers.set(name, value))
        },
      },
    }
  )

  const { data: { user }, error } = await supabase.auth.getUser()
  const authFailure = authSessionFailure(error)
  if (authFailure === 503) return unavailable()
  if (authFailure === 401) return redirect(accountEntryHref('/login', pathname + request.nextUrl.search))

  const isProtected = pathname.startsWith('/dashboard') || pathname.startsWith('/admin') || pathname.startsWith('/terminal')
  if (isProtected && !user) {
    return redirect(accountEntryHref('/login', pathname + request.nextUrl.search))
  }

  // Admin gate — DB-backed (single source of truth)
  if (pathname.startsWith('/admin') && user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    if (profile?.role !== 'admin') {
      return redirect('/dashboard')
    }
  }

  // Terminal gate — دسترسی کامل: ادمین یا entitlement فعّال (مشاوره/وبینار)
  // هم‌خوان با lib/access.ts و layout ترمینال؛ مشتری «۳ ماه دسترسی کامل» باید عبور کند
  if (pathname.startsWith('/terminal') && user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    if (profile?.role !== 'admin') {
      let entitled = false
      try {
        const nowIso = new Date().toISOString()
        const { data: ents, error } = await supabase
          .from('entitlements')
          .select('id')
          .eq('user_id', user.id)
          .is('cohort_id', null)
          .is('revoked_at', null)
          .lte('starts_at', nowIso)
          .or(activeEntitlementFilter(nowIso))
          .limit(1)
        entitled = !error && !!ents && ents.length > 0
      } catch {
        entitled = false
      }
      if (!entitled) {
        return redirect('/dashboard')
      }
    }
  }

  return supabaseResponse
  }
  let deadline: ReturnType<typeof setTimeout> | undefined
  try {
    // Bound the entire gate, including SDK refresh retries and role reads.
    return await Promise.race([runGate(), new Promise<NextResponse>(resolve => {
      deadline = setTimeout(() => { controller.abort(); resolve(unavailable()) }, 8000)
    })])
  } catch {
    return unavailable()
  } finally {
    if (deadline) clearTimeout(deadline)
  }
}

export const config = {
  runtime: 'nodejs',
  matcher: ['/dashboard/:path*', '/admin/:path*', '/terminal/:path*'],
}
