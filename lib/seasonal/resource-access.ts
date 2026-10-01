import {isAuthSessionMissingError} from "@supabase/supabase-js";

/** A missing SDK session is a login requirement; transport/config failures are outages. */
export function resourceAuthStatus(error:unknown,user:unknown):401|503|null {
 if(error)return isAuthSessionMissingError(error)?401:503;
 return user?null:401;
}

interface ModuleClient {
 rpc(name:"seasonal_module_access",args:{p_module:string;p_cohort:string}):PromiseLike<{data:unknown;error:unknown}>;
}
/** Metadata management permissions do not establish course-content membership. */
export async function resourceModuleAllowed(db:ModuleClient,moduleKey:string,cohortId:string):Promise<boolean|null>{
 const {data,error}=await db.rpc("seasonal_module_access",{p_module:moduleKey,p_cohort:cohortId});
 if(error||!data||typeof data!=="object"||!("allowed" in data)||typeof data.allowed!=="boolean")return null;
 return data.allowed;
}
