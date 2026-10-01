import {createClient} from "@/lib/supabase/server";
import {seasonalResponse,seasonalUnavailable} from "@/lib/seasonal/server";
export const dynamic="force-dynamic";
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){try{
 const db=await createClient();const {data:{user},error}=await db.auth.getUser();if(error)return seasonalUnavailable();if(!user)return seasonalResponse(null,401);
 const {id}=await params;
 // The existing per-resource RLS evaluates the exact cohort and module for every row.
 const result=await db.from("course_resources").select("id,title,module_key,created_at").eq("cohort_id",id).eq("published",true).order("created_at",{ascending:false});
 if(result.error)return seasonalUnavailable();
 return seasonalResponse((result.data??[]).map(r=>({resourceRef:r.id,title:r.title,moduleKey:r.module_key,createdAt:r.created_at,resourcePath:`/api/cohorts/${id}/resources/${r.id}`})));
}catch{return seasonalUnavailable();}}
