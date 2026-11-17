import { withDeadline } from "../deadline";
import { financialJson, type FinancialDb } from "./financialHttp";
import { validatePaymentRead, samePaymentRequest, validateInstallmentRequest, type InstallmentPaymentRequest } from "./installmentPayments";
import { cashFlowUuid } from "./cashFlowApiContract";
export async function installmentHttp(request: Request, connect: ()=>Promise<FinancialDb>) {
 try {
  if(request.method==='POST'&&request.headers.get('origin')!==new URL(request.url).origin)return financialJson({error:"ORIGIN_FORBIDDEN"},403);
  return await withDeadline(async signal=>{
   const db=await connect(),auth=await db.authenticate();
   if(auth.error)return financialJson({error:"AUTH_UNAVAILABLE"},503);
   if(!auth.user)return financialJson({error:"AUTH_REQUIRED"},401);
   const owner=auth.user.id;
   if(request.method==='GET'){
    const result=await db.rpc('read_member_installments',{});if(result.error)throw Error('read_failed');
    return financialJson(validatePaymentRead(result.data,owner));
   }
   if(request.method!=='POST')return financialJson({error:"METHOD_NOT_ALLOWED"},405);
   let input:InstallmentPaymentRequest;
   try {
    if(!request.body)throw Error();const reader=request.body.getReader();let raw='';const decoder=new TextDecoder('utf-8',{fatal:true});let size=0;
    const abort=()=>{void reader.cancel();};signal.addEventListener('abort',abort,{once:true});
    try {while(true){const part=await reader.read();if(signal.aborted)throw Error();if(part.done)break;size+=part.value.byteLength;if(size>4096){await reader.cancel();throw Error();}raw+=decoder.decode(part.value,{stream:true});}raw+=decoder.decode();}finally{signal.removeEventListener('abort',abort);reader.releaseLock();}
    input=validateInstallmentRequest(JSON.parse(raw));
   }catch{return financialJson({error:"INVALID_INPUT"},400);}
   if(input.expectedOwnerId!==owner)return financialJson({error:"OWNER_CHANGED"},403);
   if(signal.aborted)throw Error();
   const result=await db.rpc('record_member_installment',{p_request:input});
   if(result.error){const code=result.error.code;return financialJson({error:code==='PT409'?'CONFLICT':'WRITE_UNCONFIRMED'},code==='PT409'?409:code==='42501'?403:code.startsWith('22')||code.startsWith('23')?400:503);}
   const r=result.data as {id:string;version:number;reused:boolean;request:unknown};
   if(!r||!cashFlowUuid(r.id)||!Number.isSafeInteger(r.version)||r.version<1||typeof r.reused!=='boolean'||!samePaymentRequest(validateInstallmentRequest(r.request),input))throw Error('unconfirmed');
   return financialJson({...r,ownerId:owner},r.reused?200:201);
  },10000);
 }catch{return financialJson({error:request.method==='POST'?'WRITE_UNCONFIRMED':'READ_UNAVAILABLE'},503);}
}
