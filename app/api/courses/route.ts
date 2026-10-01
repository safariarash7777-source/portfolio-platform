import {createClient} from "@/lib/supabase/server";
import {CONTRACT_VERSION} from "@/lib/seasonal/contracts";
import {seasonalUnavailable} from "@/lib/seasonal/server";
export const dynamic="force-dynamic";
export async function GET(){try{
 const db=await createClient();const {data,error}=await db.from("courses").select("id,title,summary,course_cohorts(id,title,starts_at,ends_at,timezone,policy_version,status,registration_open)").eq("status","published");
 if(error) return seasonalUnavailable();
 const courses=(data??[]).map(c=>({id:c.id,title:c.title,summary:c.summary,cohorts:(c.course_cohorts??[]).filter(x=>x.status==="published").map(x=>({id:x.id,title:x.title,startsAt:x.starts_at,endsAtExclusive:x.ends_at,timeZone:x.timezone,policyVersion:x.policy_version,status:x.status,registrationAction:{enabled:false,reason:"registration_not_enabled"}}))}));
 return Response.json({contractVersion:CONTRACT_VERSION,courses},{headers:{"Cache-Control":"no-store"}});
}catch{return seasonalUnavailable();}}
