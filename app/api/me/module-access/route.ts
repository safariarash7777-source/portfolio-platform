import {getModuleAccess,seasonalResponse} from "@/lib/seasonal/server";
export const dynamic="force-dynamic";
export async function GET(req:Request){const u=new URL(req.url);const d=await getModuleAccess(u.searchParams.get("module")??"",u.searchParams.get("cohort")??undefined);return seasonalResponse(d,d.reason==="unavailable"?503:200);}
