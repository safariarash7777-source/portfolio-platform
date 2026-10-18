import "server-only";
import { unstable_noStore as noStore } from "next/cache";
import type { createClient } from "@/lib/supabase/server";
import { withDeadline } from "@/lib/deadline";
import {
  isSiteLayout,
  requestedPreviewLayout,
  type SiteAppearance,
} from "./site-layout";

/** Existing append-only media RPC is the one site-appearance storage contract.
 * Its legacy name is intentionally retained; no second setting or schema change.
 */
export async function readSiteAppearance(
  client: Awaited<ReturnType<typeof createClient>>,
  search: Record<string, string | string[] | undefined> = {},
): Promise<SiteAppearance> {
  noStore();
  // One request-local budget covers the setting and optional preview checks.
  // If preview lookup stalls, keep a global choice already read successfully.
  let fallback: SiteAppearance = {
    state: "unavailable", globalLayout: null, previewLayout: null,
  };
  try {
    return await withDeadline(async (signal) => {
      const { data, error } = await client.rpc("get_media_layout").abortSignal(signal);
      if (signal.aborted || error || !isSiteLayout(data)) return fallback;
      const canonical: SiteAppearance = {
        state: "ready", globalLayout: data, previewLayout: null,
      };
      fallback = canonical;
      const requested = search.appearance_preview === "1"
        ? requestedPreviewLayout(search.design) : null;
      if (requested === null) return canonical;
      // URL values never establish authority. Current DB role, not JWT metadata,
      // grants this explicitly labelled, non-persistent administrator preview only.
      const {
        data: { user }, error: authError,
      } = await client.auth.getUser();
      if (signal.aborted || authError || !user) return canonical;
      const { data: profile, error: profileError } = await client
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .abortSignal(signal)
        .maybeSingle();
      if (!signal.aborted && !profileError && profile?.role === "admin")
        return { ...canonical, previewLayout: requested };
      return canonical;
    }, 4000);
  } catch {
    // The existing helper also observes late rejections from abort-ignoring work.
    return fallback;
  }
}
