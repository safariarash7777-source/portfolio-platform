import {postSeasonal} from "@/lib/seasonal/http";
import {createClient} from "@/lib/supabase/server";
import {connectSeasonal,seasonalResponse,seasonalUnavailable} from "@/lib/seasonal/server";
export const dynamic="force-dynamic";
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){return postSeasonal(req,connectSeasonal,"needs",(await params).id);}
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){try{
 const db=await createClient();const {data:{user},error}=await db.auth.getUser();if(error)return seasonalUnavailable();if(!user)return seasonalResponse(null,401);
 const r=await db.from("needs_assessment_versions").select("id,version,body,submitted_at,created_at").eq("cohort_id",(await params).id).eq("user_id",user.id).order("version",{ascending:false}).limit(1).maybeSingle();
 return r.error?seasonalUnavailable():seasonalResponse(r.data);
}catch{return seasonalUnavailable();}}
