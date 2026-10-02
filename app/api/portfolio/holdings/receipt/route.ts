import { connectFinancialReadDb } from "@/lib/portfolio/readDb";
import { lookupFinancialReceipt } from "@/lib/portfolio/financialReadHttp";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** POST carries opaque token in body; this route only SELECTs. */
export async function POST(request: Request) { return lookupFinancialReceipt(request, connectFinancialReadDb); }
