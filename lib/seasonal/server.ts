import "server-only";
import { createClient } from "../supabase/server";
import { CONTRACT_VERSION, MODULE_KEYS, type ModuleDecision } from "./contracts";
import type { SeasonalGateway } from "./http";
export async function connectSeasonal():Promise<SeasonalGateway> {
 const db=await createClient();
 return {async authenticate(){const r=await db.auth.getUser();return {user:r.data.user,error:!!r.error};},async rpc(name,args){return db.rpc(name,args);}};
}
export async function getModuleAccess(moduleKey:string,cohortId?:string):Promise<ModuleDecision> {
 if(!MODULE_KEYS.includes(moduleKey as typeof MODULE_KEYS[number])) return {allowed:false,reason:"unknown_module",authorizedByCohortIds:[],until:null,policyVersion:null};
 const db=await createClient();const {data:{user},error:authError}=await db.auth.getUser();
 if(authError) return {allowed:false,reason:"unavailable",authorizedByCohortIds:[],until:null,policyVersion:null};
 if(!user) return {allowed:false,reason:"sign_in_required",authorizedByCohortIds:[],until:null,policyVersion:null};
 const {data,error}=await db.rpc("seasonal_module_access",{p_module:moduleKey,p_cohort:cohortId??null});
 if(error||!data) return {allowed:false,reason:"unavailable",authorizedByCohortIds:[],until:null,policyVersion:null};
 return data as ModuleDecision;
}
export function seasonalResponse(data:unknown,status=200) {return Response.json({contractVersion:CONTRACT_VERSION,data},{status,headers:{"Cache-Control":"private, no-store"}});}
export function seasonalUnavailable() {return Response.json({contractVersion:CONTRACT_VERSION,availability:"unavailable",error:"دریافت اطلاعات دوره انجام نشد. دوباره تلاش کنید."},{status:503,headers:{"Cache-Control":"private, no-store"}});}
