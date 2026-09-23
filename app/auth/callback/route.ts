import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { normalizeReturnPath } from '@/components/account/returnPath'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // همان قانونی که لینک‌های ورود/ثبت‌نام با آن ساخته می‌شوند. پیش از این
  // اینجا یک بررسیِ جداگانه و سست‌تر بود (backslash و نویسهٔ کنترلی را رد
  // نمی‌کرد)؛ دو تعریف از «مسیرِ امن» یعنی روزی یکی‌شان عقب می‌ماند.
  const next = normalizeReturnPath(searchParams.get('next'), '/dashboard')

  if (code) {
    const supabaseResponse = NextResponse.redirect(`${origin}${next}`)

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return supabaseResponse
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
