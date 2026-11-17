import { readFundamentals } from "@/lib/fundamental/registry";

export async function GET(_request: Request, {params}: {params: Promise<{symbol:string}>}) {
  const {symbol} = await params;
  if (!symbol.trim() || symbol.length > 80) return Response.json({error:"invalid_symbol"},{status:400});
  const {state,data} = await readFundamentals(symbol);
  return Response.json({state,data},{status:state==="error"?503:state==="empty"?404:200});
}
