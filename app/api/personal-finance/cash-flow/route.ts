import { createClient } from "@/lib/supabase/server";
import { cashFlowDb, getCashFlow, postCashFlow } from "@/lib/portfolio/cashFlowServer";

export const dynamic = "force-dynamic";
const connect = async () => cashFlowDb(await createClient());
export async function GET(request: Request) { return getCashFlow(request, connect); }
export async function POST(request: Request) { return postCashFlow(request, connect); }
