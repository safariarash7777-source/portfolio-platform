import {TOKEN,CONTRACT} from './bridge';
import {notificationSessionStatus} from './session-status';
export interface MemberGateway {authenticate():Promise<{user:unknown;error:unknown}>;rpc(name:string,args?:Record<string,unknown>):Promise<{data:unknown;error:{code?:string}|null}>}
export async function memberNotifications(req:Request,connect:()=>Promise<MemberGateway>,feature:boolean):Promise<Response>{
 const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'private, no-store'}});
 if(!feature)return reply({error:'مرکز اعلان هنوز فعال نشده است.'},503);
 try{
  const db=await connect();const auth=await db.authenticate();const sessionStatus=notificationSessionStatus(auth.user,auth.error);
  if(sessionStatus!==200)return reply({error:sessionStatus===401?'ابتدا وارد شوید.':'بررسی نشست انجام نشد؛ دوباره تلاش کنید.'},sessionStatus);
  let name:string,args:Record<string,unknown>={};
  if(req.method==='GET')name=new URL(req.url).searchParams.get('view')==='connection'?'next09_connection':'next09_notices';
  else{
   const origin=req.headers.get('origin');if(!origin || origin!==new URL(req.url).origin)return reply({error:'مبدأ درخواست معتبر نیست.'},403);
   const text=await req.text();if(text.length>2048)return reply({error:'درخواست بزرگ است.'},413);
   const b=JSON.parse(text) as Record<string,unknown>;if(!b || Array.isArray(b) || typeof b!=='object')return reply({error:'درخواست معتبر نیست.'},422);
   const keys:Record<string,string[]>={start:['action'],confirm:['action','challengeId','confirmation'],unlink:['action'],preferences:['action','course','updates'],acknowledge:['action','noticeId']};
   if(typeof b.action!=='string' || !keys[b.action] || Object.keys(b).some(k=>!keys[b.action as string].includes(k)))return reply({error:'فرمان معتبر نیست.'},422);
   const uuid=(x:unknown)=>typeof x==='string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(x);
   switch(b.action){
    case 'start':name='next09_start_link';break;
    case 'confirm':if(!uuid(b.challengeId)||typeof b.confirmation!=='string'||!TOKEN.test(b.confirmation))return reply({error:'کد تأیید معتبر نیست.'},422);name='next09_confirm_link';args={p_challenge:b.challengeId,p_confirmation:b.confirmation};break;
    case 'unlink':name='next09_unlink';break;
    case 'preferences':if(typeof b.course!=='boolean'||typeof b.updates!=='boolean')return reply({error:'ترجیح معتبر نیست.'},422);name='next09_preferences';args={p_course:b.course,p_updates:b.updates};break;
    default:if(!uuid(b.noticeId))return reply({error:'اعلان معتبر نیست.'},422);name='next09_acknowledge';args={p_notice:b.noticeId};
   }
  }
  const r=await db.rpc(name,args);if(r.error){const code=r.error.code;const status=code==='42501'?403:code==='PT409'?409:code==='P0429'?429:code==='22023'||code==='22P02'?422:503;return reply({error:status===409?'اتصال دیگری وجود دارد؛ ابتدا آن را قطع کنید.':status===429?'تعداد درخواست زیاد است؛ بعداً تلاش کنید.':status===403?'نشست یا اثبات اتصال معتبر نیست.':'عملیات انجام نشد؛ دوباره تلاش کنید.'},status);}
  return reply({contractVersion:CONTRACT,data:r.data});
 }catch{return reply({error:'عملیات انجام نشد؛ اطلاعات خود را نگه دارید.'},503);}
}
