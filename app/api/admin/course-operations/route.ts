import {postSeasonal} from "@/lib/seasonal/http";
import {connectSeasonal,seasonalResponse,seasonalUnavailable} from "@/lib/seasonal/server";
export const dynamic="force-dynamic";
export async function GET(){try{const db=await connectSeasonal(),a=await db.authenticate();if(a.error)return seasonalUnavailable();if(!a.user)return seasonalResponse(null,401);const r=await db.rpc("seasonal_operations",{p_body:null});return r.error?(r.error.code==="42501"?seasonalResponse(null,403):seasonalUnavailable()):seasonalResponse(r.data);}catch{return seasonalUnavailable();}}
export async function POST(req:Request){return postSeasonal(req,connectSeasonal,"operations");}
