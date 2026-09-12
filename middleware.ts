import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { activeEntitlementFilter } from '@/lib/entitlement-filter'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  const isProtected = pathname.startsWith('/dashboard') || pathname.startsWith('/admin') || pathname.startsWith('/terminal')
  if (isProtected && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Admin gate — DB-backed (single source of truth)
  if (pathname.startsWith('/admin') && user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    if (profile?.role !== 'admin') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
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
          .is('revoked_at', null)
          // NULL یعنی بدونِ انقضا. تعریفِ مشترک با lib/access.ts تا این دو
          // هرگز واگرا نشوند.
          .or(activeEntitlementFilter(nowIso))
          .limit(1)
        entitled = !error && !!ents && ents.length > 0
      } catch {
        entitled = false
      }
      if (!entitled) {
        return NextResponse.redirect(new URL('/dashboard', request.url))
      }
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*', '/terminal/:path*'],
}
