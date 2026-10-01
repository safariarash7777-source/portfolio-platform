import {createAdminClient} from '@/lib/supabase/admin';
import {confirmation,verifyBridge,TOKEN} from '@/lib/notifications/bridge';
export const runtime='nodejs';
export async function POST(req:Request){
 const reply=(b:unknown,status:number)=>Response.json(b,{status,headers:{'cache-control':'private, no-store'}});
 if(process.env.NEXT09_ENABLED!=='true')return reply({error:'اتصال فعال نشده است.'},503);
 try{
  const body=await req.text();if(body.length>2048)return reply({error:'درخواست بزرگ است.'},413);
  if(!verifyBridge(process.env.NEXT09_BRIDGE_SECRET,req.headers.get('x-next09-time'),req.headers.get('x-next09-signature'),body))return reply({error:'دسترسی معتبر نیست.'},403);
  const b=JSON.parse(body);if(!b || Object.keys(b).sort().join(',')!=='contractVersion,telegramId,token' || b.contractVersion!=='notifications.v1' || !TOKEN.test(b.token) || !/^[1-9][0-9]{0,15}$/.test(b.telegramId))return reply({error:'درخواست معتبر نیست.'},422);
  const c=confirmation();const r=await createAdminClient().rpc('next09_prove_link',{p_token:b.token,p_telegram:b.telegramId,p_confirmation_hash:c.hash});
  if(r.error)return reply({error:'اثبات اتصال رد شد؛ کد تازه از سایت بگیرید.'},r.error.code==='PT409'?409:r.error.code==='P0002'?404:503);
  return reply({contractVersion:'notifications.v1',data:r.data,confirmation:c.value},200);
 }catch{return reply({error:'اتصال در دسترس نیست.'},503);}
}
