import { createClient } from "@/lib/supabase/server";
import { postFinancialSnapshot, financialAuthentication } from "@/lib/portfolio/financialHttp";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return postFinancialSnapshot(request, "debts", async () => {
    const db = await createClient();
    return { async authenticate() { const { data, error } = await db.auth.getUser(); return financialAuthentication(data.user, error); },
      async rpc(name, args) { return db.rpc(name, args); } };
  });
}
