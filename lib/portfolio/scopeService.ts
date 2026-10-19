import "server-only";
import { createClient } from "@/lib/supabase/server";
import { scopeReviewFromStored, type ScopeRead } from "./scopeContract";
import type { HoldingVersion } from "./contracts";
import { withDeadline } from "@/lib/deadline";
export async function loadInvestmentScope(holdings: HoldingVersion, connect = createClient): Promise<ScopeRead> {
  const failed: ScopeRead = { status: "error", review: null };
  try {
    return await withDeadline(async signal => {
    const db = await connect();
    if (signal.aborted) return failed;
    const { data: { user }, error } = await db.auth.getUser();
    if (signal.aborted || error || !user) return failed;
    const result = await db.from("member_investment_scope_reviews").select("id,holding_version_id,scope_version,rules_version,member_confirmed_at,assignments")
      .eq("user_id", user.id).eq("holding_version_id", holdings.id).order("scope_version", { ascending: false }).limit(1).abortSignal(signal).maybeSingle();
    if (signal.aborted || result.error) return failed;
    return { status: "ready", review: result.data ? scopeReviewFromStored(result.data, holdings) : null };
    }, 10000);
  } catch { return failed; }
}
