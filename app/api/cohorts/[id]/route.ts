import {createClient} from "@/lib/supabase/server";
import {seasonalResponse,seasonalUnavailable} from "@/lib/seasonal/server";
export const dynamic="force-dynamic";
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){try{
 const {id}=await params,db=await createClient();
 const {data,error}=await db.from("course_cohorts").select("id,course_id,title,starts_at,ends_at,timezone,policy_version,status,module_keys").eq("id",id).eq("status","published").maybeSingle();
 if(error)return seasonalUnavailable();if(!data)return seasonalResponse(null,404);
 const webinars=await db.from("webinars").select("id,title,description,starts_at,ends_at,platform,status").eq("cohort_id",id).in("status",["published","live","ended"]);
 if(webinars.error)return seasonalUnavailable();
 return seasonalResponse({id:data.id,courseId:data.course_id,title:data.title,startsAt:data.starts_at,endsAtExclusive:data.ends_at,timeZone:data.timezone,policyVersion:data.policy_version,moduleKeys:data.module_keys,registrationAction:{enabled:false,reason:"registration_not_enabled"},webinars:webinars.data});
}catch{return seasonalUnavailable();}}
