import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Only the content-feed sync imports this client. Never expose its key to a browser. */
export function tryCreateContentSyncClient() {
  const key = process.env.CONTENT_SYNC_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!key || !url) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
