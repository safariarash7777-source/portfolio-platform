import { createClient } from "@/lib/supabase/server";
import { financialAuthentication } from "@/lib/portfolio/financialHttp";
import { installmentHttp } from "@/lib/portfolio/installmentServer";
export const dynamic="force-dynamic";
const connect=async()=>{const db=await createClient();return {
 async authenticate(){const {data,error}=await db.auth.getUser();return financialAuthentication(data.user,error);},
 async rpc(name:string,args:Record<string,unknown>){return db.rpc(name,args);}
};};
export async function GET(request:Request){return installmentHttp(request,connect);}
export async function POST(request:Request){return installmentHttp(request,connect);}
