import { createClient } from "./supabase/server";
import { getAccess } from "./access";
import { decodeMarketGrant, type MarketModuleKey } from "./market-module-contract";

/** Session-only RPC, same entitlements as NEXT-04. A course never becomes a global full role. */
export async function getMarketModuleAccess(moduleKey: MarketModuleKey, cohortId?: string) {
  const legacy = await getAccess();
  if (legacy.level === "full") return { allowed: true, reason: "legacy", authorizedByCohortIds: [], until: legacy.expiresAt, policyVersion: "seasonal.v0.1" };
  if (!legacy.userId) return decodeMarketGrant(null);
  try {
    const client = await createClient();
    const { data, error } = await client.rpc("seasonal_module_access", { p_module: moduleKey, p_cohort: cohortId ?? null });
    return decodeMarketGrant(error ? null : data);
  } catch { return decodeMarketGrant(null); }
}
