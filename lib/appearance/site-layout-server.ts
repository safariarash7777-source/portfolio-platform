import "server-only";
import { unstable_noStore as noStore } from "next/cache";
import type { createClient } from "@/lib/supabase/server";
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
  let globalLayout;
  try {
    const { data, error } = await client
      .rpc("get_media_layout")
      .abortSignal(AbortSignal.timeout(4000));
    if (error || !isSiteLayout(data))
      return { state: "unavailable", globalLayout: null, previewLayout: null };
    globalLayout = data;
  } catch {
    return { state: "unavailable", globalLayout: null, previewLayout: null };
  }
  const canonical: SiteAppearance = {
    state: "ready",
    globalLayout,
    previewLayout: null,
  };
  const requested =
    search.appearance_preview === "1"
      ? requestedPreviewLayout(search.design)
      : null;
  if (requested === null) return canonical;
  // URL values never establish authority. Current DB role, not JWT metadata,
  // grants this explicitly labelled, non-persistent administrator preview only.
  try {
    const {
      data: { user },
      error: authError,
    } = await client.auth.getUser();
    if (authError || !user) return canonical;
    const { data: profile, error } = await client
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (!error && profile?.role === "admin")
      return { ...canonical, previewLayout: requested };
  } catch {
    /* Fail closed for preview; the successfully read global choice remains. */
  }
  return canonical;
}
