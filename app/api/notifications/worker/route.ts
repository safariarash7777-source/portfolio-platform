import {createAdminClient} from '@/lib/supabase/admin';
import {runDistribution,telegramDelivery} from '@/lib/notifications/worker';
import {publicationLink} from '@/lib/notifications/bridge';
import {createHash,timingSafeEqual} from 'node:crypto';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(req:Request){
 const reply=(b:unknown,status=200)=>Response.json(b,{status,headers:{'cache-control':'private, no-store'}});
 const secret=process.env.CRON_SECRET;if(!secret || !timingSafeEqual(createHash('sha256').update(req.headers.get('authorization')??'').digest(),createHash('sha256').update('Bearer '+secret).digest()))return reply({error:'دسترسی معتبر نیست.'},401);
 if(process.env.NEXT09_ENABLED!=='true')return reply({error:'مرکز اعلان فعال نیست.'},503);
 try{
  const db=createAdminClient();
  if(process.env.NEXT09_SEND_ENABLED!=='true'){
   const r=await db.rpc('next09_stage');if(r.error)throw new Error('unavailable');return reply({staged:r.data,sending:false});
  }
  const token=process.env.TELEGRAM_BOT_TOKEN,origin=process.env.NEXT09_SITE_ORIGIN;
  if(!token||!origin)return reply({error:'تنظیم ارسال آماده نیست.'},503);
  publicationLink(origin,'/notifications');
  return reply(await runDistribution(db,job=>telegramDelivery(token,job,origin)));
 }catch{return reply({error:'پردازش اعلان انجام نشد.'},503);}
}
