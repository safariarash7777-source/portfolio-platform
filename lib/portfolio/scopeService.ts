import "server-only";
import { createClient } from "@/lib/supabase/server";
import { scopeReviewFromStored, type ScopeRead } from "./scopeContract";
import type { HoldingVersion } from "./contracts";
export async function loadInvestmentScope(holdings: HoldingVersion): Promise<ScopeRead> {
  try {
    const db = await createClient(); const { data: { user }, error } = await db.auth.getUser();
    if (error || !user) return { status: "error", review: null };
    const result = await db.from("member_investment_scope_reviews").select("id,holding_version_id,scope_version,rules_version,member_confirmed_at,assignments")
      .eq("user_id", user.id).eq("holding_version_id", holdings.id).order("scope_version", { ascending: false }).limit(1).maybeSingle();
    if (result.error) return { status: "error", review: null };
    return { status: "ready", review: result.data ? scopeReviewFromStored(result.data, holdings) : null };
  } catch { return { status: "error", review: null }; }
}
