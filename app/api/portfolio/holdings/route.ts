import { createClient } from "@/lib/supabase/server";
import { postFinancialSnapshot, financialAuthentication } from "@/lib/portfolio/financialHttp";
import { getFinancialSnapshot } from "@/lib/portfolio/financialReadHttp";
import { connectFinancialReadDb } from "@/lib/portfolio/readDb";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return getFinancialSnapshot(new URL(request.url).searchParams.get("version") ?? undefined, connectFinancialReadDb);
}
export async function POST(request: Request) {
  return postFinancialSnapshot(request, "holdings", async () => {
    const db = await createClient();
    return { async authenticate() { const { data, error } = await db.auth.getUser(); return financialAuthentication(data.user, error); },
      async rpc(name, args) { return db.rpc(name, args); } };
  });
}
