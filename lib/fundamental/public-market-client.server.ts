import "server-only";
import { createClient as anonymousClient } from "@supabase/supabase-js";
import { publicMarketOverride } from "./read-config.node.mjs";
export { publicMarketOverride };

export function publicMarketClient() {
  const override = publicMarketOverride();
  const url = override === undefined ? process.env.NEXT_PUBLIC_SUPABASE_URL : override.pair?.url;
  const key = override === undefined ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY : override.pair?.anon;
  if (!url || !key) throw new Error("Public market source unavailable");
  return anonymousClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}
