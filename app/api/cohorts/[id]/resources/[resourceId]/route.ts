import {createClient} from "@/lib/supabase/server";
import {seasonalResponse,seasonalUnavailable} from "@/lib/seasonal/server";
import {resourceAuthStatus,resourceModuleAllowed} from "@/lib/seasonal/resource-access";
export const dynamic="force-dynamic";
export async function GET(_req:Request,{params}:{params:Promise<{id:string;resourceId:string}>}){try{
 const db=await createClient();const {data:{user},error}=await db.auth.getUser();const authStatus=resourceAuthStatus(error,user);if(authStatus)return authStatus===401?seasonalResponse(null,401):seasonalUnavailable();
 const {id,resourceId}=await params;const r=await db.from("course_resources").select("title,module_key,storage_bucket,storage_path,webinar_id").eq("id",resourceId).eq("cohort_id",id).eq("published",true).maybeSingle();
 if(r.error)return seasonalUnavailable();if(!r.data)return seasonalResponse({error:"منبع برای این حساب در دسترس نیست."},403);
 const allowed=await resourceModuleAllowed(db,r.data.module_key,id);
 if(allowed===null)return seasonalUnavailable();if(!allowed)return seasonalResponse({error:"منبع برای این حساب در دسترس نیست."},403);
 if(r.data.webinar_id)return seasonalResponse({joinPath:`/api/cohorts/${id}/webinars/${r.data.webinar_id}/join`});
 if(r.data.storage_bucket!=="course-private"||!r.data.storage_path)return seasonalUnavailable();
 const signed=await db.storage.from("course-private").createSignedUrl(r.data.storage_path,60);
 if(signed.error){const status=Number(signed.error.statusCode);return status===401||status===403?seasonalResponse({error:"منبع برای این حساب در دسترس نیست."},403):seasonalUnavailable();}
 return seasonalResponse({title:r.data.title,url:signed.data.signedUrl,expiresInSeconds:60});
}catch{return seasonalUnavailable();}}
