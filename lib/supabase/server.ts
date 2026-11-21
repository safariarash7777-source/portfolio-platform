import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { previewDossierFetch } from '../portfolio/preview-dossier-fetch'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      ...(process.env.VERCEL_ENV === 'preview' ? { global: { fetch: previewDossierFetch(fetch) } } : {}),
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options))
          } catch {}
        },
      },
    }
  )
}
