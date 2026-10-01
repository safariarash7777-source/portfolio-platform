import {createClient} from '@/lib/supabase/server';
import {memberNotifications} from '@/lib/notifications/http';
export const dynamic='force-dynamic';
async function connect(){const db=await createClient();return {authenticate:async()=>{const r=await db.auth.getUser();return {user:r.data.user,error:!!r.error};},rpc:async(name:string,args?:Record<string,unknown>)=>db.rpc(name,args)};}
export async function GET(req:Request){return memberNotifications(req,connect,process.env.NEXT09_ENABLED==='true');}
export async function POST(req:Request){return memberNotifications(req,connect,process.env.NEXT09_ENABLED==='true');}
