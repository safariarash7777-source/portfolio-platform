import {publicationLink} from './bridge';
export interface Rpc {rpc(name:string,args?:Record<string,unknown>):PromiseLike<{data:unknown;error:unknown}>}
export type Delivery={status:'accepted'|'retry'|'failed'|'unknown'|'cancelled';code:'ok'|'rate_limit'|'rejected'|'network_ambiguous'|'authorization_changed'|'transport_disabled';messageId?:number;retrySeconds?:number};
export interface Job {attemptId:string;telegramId:string;kind:'published'|'withdrawn';version:number;sitePath:string}
export async function telegramDelivery(token:string,job:Job,origin:string,transport:typeof fetch=fetch):Promise<Delivery>{
 const text=job.kind==='withdrawn'?'محتوای قبلی متوقف شده است. وضعیت تازه را در سایت ببینید.':job.version>1?'نسخه تازه محتوا در سایت آماده است. برای مشاهده وارد حساب شوید.':'محتوای تازه در سایت آماده است. برای مشاهده وارد حساب شوید.';
 const url=publicationLink(origin,job.sitePath);
 try {
  const res=await transport('https://api.telegram.org/bot'+token+'/sendMessage',{method:'POST',redirect:'error',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:job.telegramId,text,link_preview_options:{is_disabled:true},reply_markup:{inline_keyboard:[[{text:'مشاهده در حساب',url}]]}}),signal:AbortSignal.timeout(5000)});
  const b=await res.json() as {ok?:boolean;result?:{message_id?:number};error_code?:number;parameters?:{retry_after?:number}};
  if(res.ok && b.ok===true && Number.isSafeInteger(b.result?.message_id) && b.result!.message_id!>0)return {status:'accepted',code:'ok',messageId:b.result!.message_id!};
  if(b.ok===false && b.error_code===429)return {status:'retry',code:'rate_limit',retrySeconds:Math.ceil(Math.max(1,Math.min(3600,Number.isFinite(b.parameters?.retry_after)?b.parameters!.retry_after!:60)))};
  if(b.ok===false && b.error_code && b.error_code>=400 && b.error_code<500)return {status:'failed',code:'rejected'};
  // Telegram offers no sendMessage idempotency key. Ambiguous outcomes must not auto-retry.
  return {status:'unknown',code:'network_ambiguous'};
 }catch{return {status:'unknown',code:'network_ambiguous'};}
}
async function rpc(db:Rpc,name:string,args?:Record<string,unknown>){const r=await db.rpc(name,args);if(r.error)throw new Error('notifications_unavailable');return r.data;}
export async function runDistribution(db:Rpc,send:(job:Job)=>Promise<Delivery>,limit=10){
 const staged=await rpc(db,'next09_stage');let processed=0;
 for(let i=0;i<Math.min(10,limit);i++){
  const job=await rpc(db,'next09_claim') as Job|null;if(!job)break;
  const valid=await rpc(db,'next09_check_attempt',{p_attempt:job.attemptId});
  let result:Delivery={status:'cancelled',code:'authorization_changed'};
  if(valid===true){try{result=await send(job);}catch{result={status:'unknown',code:'network_ambiguous'};}}
  await rpc(db,'next09_finish',{p_attempt:job.attemptId,p_status:result.status,p_code:result.code,p_message:result.messageId??null,p_retry_seconds:result.retrySeconds??null});processed++;
 }
 return {staged,processed};
}
