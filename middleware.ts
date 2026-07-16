import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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

  // پیش‌نمایش محلی ترمینال — فقط با TERMINAL_PREVIEW_OPEN=1 (هرگز روی Vercel ست نمی‌شود)
  const terminalPreviewOpen = process.env.TERMINAL_PREVIEW_OPEN === '1'
  const isProtected = pathname.startsWith('/dashboard') || pathname.startsWith('/admin') || (pathname.startsWith('/terminal') && !terminalPreviewOpen)
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

  // Terminal gate — ادمین یا دارندهٔ دسترسی فعال (مشاوره/وبینار/دستی) — هم‌خوان با lib/access.ts.
  // RLS (entitlements_select_own) اجازهٔ خواندن ردیف‌های خود کاربر را با سشن anon می‌دهد.
  if (pathname.startsWith('/terminal') && !terminalPreviewOpen && user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    if (profile?.role !== 'admin') {
      const nowIso = new Date().toISOString()
      const { data: ents } = await supabase
        .from('entitlements')
        .select('id')
        .eq('user_id', user.id)
        .is('revoked_at', null)
        .lte('starts_at', nowIso)
        .gt('expires_at', nowIso)
        .limit(1)
      if (!ents || ents.length === 0) {
        return NextResponse.redirect(new URL('/dashboard?upgrade=terminal', request.url))
      }
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*', '/terminal/:path*'],
}
