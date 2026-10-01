import {postSeasonal} from "@/lib/seasonal/http";
import {connectSeasonal,seasonalResponse,seasonalUnavailable} from "@/lib/seasonal/server";
export const dynamic="force-dynamic";
export async function POST(req:Request){return postSeasonal(req,connectSeasonal,"claim");}
export async function GET(){try{const db=await connectSeasonal(),auth=await db.authenticate();if(auth.error)return seasonalUnavailable();if(!auth.user)return seasonalResponse(null,401);const r=await db.rpc("seasonal_claim_candidates",{});return r.error?seasonalUnavailable():seasonalResponse(r.data);}catch{return seasonalUnavailable();}}
