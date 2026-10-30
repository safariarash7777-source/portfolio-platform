import { createClient } from "@/lib/supabase/server";
import { debtPaymentsDb, getDebtPayments, postDebtPayment } from "@/lib/portfolio/debtPaymentsServer";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const connect = async () => debtPaymentsDb(await createClient());
export async function GET(request: Request) { return getDebtPayments(request, connect); }
export async function POST(request: Request) { return postDebtPayment(request, connect); }
