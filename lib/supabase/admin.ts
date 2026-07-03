import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role Supabase client. SERVER-ONLY — the `server-only` import above
// turns any accidental import from a client component into a BUILD error, so
// this key can never leak into the client bundle. Never expose the key. Bypasses RLS, so it is used exclusively by
// trusted server route handlers (payment verify + telegram webhook) that call
// the SECURITY DEFINER functions restricted to service_role.
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY تنظیم نشده است.");
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
