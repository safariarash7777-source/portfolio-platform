import "server-only";
import { createClient as anonymousClient } from "@supabase/supabase-js";
import { fundamentalReadPair } from "./read-config.server";

export function publicMarketOverride() {
  if (process.env.FUNDAMENTAL_READ_URL === undefined && process.env.FUNDAMENTAL_READ_ANON_KEY === undefined) return undefined;
  const pair = fundamentalReadPair(process.env);
  return {pair: pair && pair.expiresAt > Date.now()/1000 ? pair : null};
}

export function publicMarketClient() {
  const override = publicMarketOverride();
  const url = override === undefined ? process.env.NEXT_PUBLIC_SUPABASE_URL : override.pair?.url;
  const key = override === undefined ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY : override.pair?.anon;
  if (!url || !key) throw new Error("Public market source unavailable");
  return anonymousClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}
