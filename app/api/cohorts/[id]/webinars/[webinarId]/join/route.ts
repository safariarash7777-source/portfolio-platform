import {connectSeasonal,seasonalResponse,seasonalUnavailable} from "@/lib/seasonal/server";
export const dynamic="force-dynamic";
export async function GET(_req:Request,{params}:{params:Promise<{id:string;webinarId:string}>}){try{
 const db=await connectSeasonal(),a=await db.authenticate();if(a.error)return seasonalUnavailable();if(!a.user)return seasonalResponse(null,401);
 const p=await params,r=await db.rpc("seasonal_join_webinar",{p_cohort:p.id,p_webinar:p.webinarId});
 return r.error?(r.error.code==="42501"?seasonalResponse({error:"عضویت مجاز این دوره لازم است."},403):r.error.code==="PT409"?seasonalResponse({error:"ورود به وبینار در این زمان باز نیست."},409):seasonalUnavailable()):seasonalResponse(r.data);
}catch{return seasonalUnavailable();}}
