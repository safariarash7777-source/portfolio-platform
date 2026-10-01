import {createClient} from "@/lib/supabase/server";
import {seasonalResponse,seasonalUnavailable} from "@/lib/seasonal/server";
import {standing} from "@/lib/seasonal/time";
export const dynamic="force-dynamic";
export async function GET(){try{
 const db=await createClient();const {data:{user},error}=await db.auth.getUser();if(error)return seasonalUnavailable();if(!user)return seasonalResponse(null,401);
 const r=await db.from("entitlements").select("id,cohort_id,module_keys,starts_at,expires_at,revoked_at,course_cohorts(title,policy_version,status)").eq("user_id",user.id).not("cohort_id","is",null).order("starts_at",{ascending:false});
 if(r.error)return seasonalUnavailable();const now=new Date().toISOString();
 return seasonalResponse((r.data??[]).map(e=>{const relation=e.course_cohorts as unknown as {title:string;policy_version:string;status:string}|null;return {grantRef:e.id,cohortId:e.cohort_id,moduleKeys:e.module_keys,startsAt:e.starts_at,endsAtExclusive:e.expires_at,standing:relation?.status==="cancelled"?"revoked":standing(e.starts_at,e.expires_at,e.revoked_at,now),title:relation?.title,policyVersion:relation?.policy_version};}));
}catch{return seasonalUnavailable();}}
