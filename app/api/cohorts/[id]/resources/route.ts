import {createClient} from "@/lib/supabase/server";
import {seasonalResponse,seasonalUnavailable} from "@/lib/seasonal/server";
import {resourceAuthStatus,resourceModuleAllowed} from "@/lib/seasonal/resource-access";
export const dynamic="force-dynamic";
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){try{
 const db=await createClient();const {data:{user},error}=await db.auth.getUser();const authStatus=resourceAuthStatus(error,user);if(authStatus)return authStatus===401?seasonalResponse(null,401):seasonalUnavailable();
 const {id}=await params;
 // RLS also permits operational metadata management. This member endpoint must
 // additionally enforce the existing course/module evaluator, including for admins.
 const result=await db.from("course_resources").select("id,title,module_key,created_at").eq("cohort_id",id).eq("published",true).order("created_at",{ascending:false});
 if(result.error)return seasonalUnavailable();
 const modules=new Map<string,boolean>();
 for(const row of result.data??[]){if(modules.has(row.module_key))continue;const allowed=await resourceModuleAllowed(db,row.module_key,id);if(allowed===null)return seasonalUnavailable();modules.set(row.module_key,allowed);}
 return seasonalResponse((result.data??[]).filter(r=>modules.get(r.module_key)).map(r=>({resourceRef:r.id,title:r.title,moduleKey:r.module_key,createdAt:r.created_at,resourcePath:`/api/cohorts/${id}/resources/${r.id}`})));
}catch{return seasonalUnavailable();}}
