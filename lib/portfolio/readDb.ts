import "server-only";
import { createClient } from "@/lib/supabase/server";
import { financialAuthentication } from "./financialHttp";
import type { FinancialReadDb } from "./financialReadHttp";
export async function connectFinancialReadDb(): Promise<FinancialReadDb> {
  const db = await createClient();
  return {
    async authenticate() { const { data, error } = await db.auth.getUser(); return financialAuthentication(data.user, error); },
    async version(owner, lookup) {
      let query = db.from("member_holding_versions").select("id,version,user_id,client_token,content_hash,note").eq("user_id", owner);
      if (lookup.id) query = query.eq("id", lookup.id);
      if (lookup.token) query = query.eq("client_token", lookup.token);
      const { data, error } = await query.order("version", { ascending: false }).limit(1).maybeSingle();
      if (error) throw new Error("canonical version unavailable"); return data;
    },
    async positions(version) {
      const { data, error } = await db.from("member_holding_positions").select("position_key,symbol,manual_label,asset_class,qty,unit,cost_basis,as_of,title,ownership_pct,valuation_mode,declared_value,valuation_source,valuation_as_of,valuation_status").eq("version_id", version).limit(501);
      if (error) throw new Error("canonical positions unavailable"); return data ?? [];
    },
    async debts(version) {
      const { data, error } = await db.from("member_debt_positions").select("debt_key,title,kind,balance_toman,currency,balance_as_of,next_installment_toman,next_due_on,note").eq("version_id", version).limit(501);
      if (error) throw new Error("canonical debts unavailable"); return data ?? [];
    },
  };
}
