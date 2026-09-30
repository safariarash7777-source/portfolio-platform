import { CONTRACT_VERSION, validNeeds } from "./contracts";
import { parseImport, maskContact } from "./import";
import { toLatinDigits } from "../format";
import {tehranLocalToUtc} from "./time";
export interface SeasonalGateway {
 authenticate(): Promise<{user:{id:string}|null;error:boolean}>;
 rpc(name:string,args:Record<string,unknown>):Promise<{data:unknown;error:{code?:string}|null}>;
}
export type Command = "claim" | "needs" | "preview" | "commit" | "access" | "operations";
const privateHeaders = {"Cache-Control":"private, no-store"};
export async function postSeasonal(req:Request, connect:()=>Promise<SeasonalGateway>, command:Command, ref?:string):Promise<Response> {
 const response=await runSeasonal(req,connect,command,ref);
 response.headers.set("Cache-Control","private, no-store");
 return response;
}
async function runSeasonal(req:Request, connect:()=>Promise<SeasonalGateway>, command:Command, ref?:string):Promise<Response> {
 try {
  const db=await connect(); const auth=await db.authenticate();
  if(auth.error) return Response.json({error:"بررسی نشست انجام نشد."},{status:503,headers:privateHeaders});
  if(!auth.user) return Response.json({error:"ابتدا وارد شوید."},{status:401,headers:privateHeaders});
  const text=await req.text(); if(text.length>550000) return Response.json({error:"درخواست بیش از حد بزرگ است."},{status:413});
  let b:Record<string,unknown>; try { b=JSON.parse(text); } catch { return Response.json({error:"درخواست نامعتبر است."},{status:422}); }
  if(!b || typeof b!=="object" || Array.isArray(b) || "userId" in b && !["access","operations"].includes(command)) return Response.json({error:"هویت از نشست خوانده می‌شود."},{status:422});
  let name:string,args:Record<string,unknown>,preview:ReturnType<typeof parseImport>|undefined;
  switch(command) {
   case "claim": {
    const row=Number(toLatinDigits(String(b.registrationRef??"")));
    if(!Number.isSafeInteger(row)||row<1) return Response.json({error:"مرجع ثبت‌نام نامعتبر است."},{status:422});
    name="seasonal_claim_registration";args={p_row:row};break;
   }
   case "needs":
    if(!validNeeds(b.body)||!Number.isInteger(b.baseVersion)||Number(b.baseVersion)<0||typeof b.submitted!=="boolean") return Response.json({error:"پاسخ نیازسنجی نامعتبر است."},{status:422});
    name="seasonal_save_needs";args={p_cohort:ref,p_base:b.baseVersion,p_body:b.body,p_submit:b.submitted};break;
   case "preview":
    if(typeof b.csv!=="string"||typeof b.cohortId!=="string"||typeof b.cohortRef!=="string"||typeof b.evidence!=="string"||b.evidence.trim().length<10) return Response.json({error:"دوره، فایل و دلیل ورود لازم است."},{status:422});
    try{preview=parseImport(b.csv,b.cohortRef);}catch(e){return Response.json({error:e instanceof Error?e.message:"فایل نامعتبر"},{status:422});}
    if(preview.errors.length) return Response.json({error:"پیش‌نمایش دارای خطاست؛ هیچ ردیفی وارد نشد.",errors:preview.errors},{status:422});
    name="seasonal_import_preview";args={p_cohort:b.cohortId,p_hash:preview.hash,p_source:String(b.sourceLabel??"registration.csv"),p_evidence:b.evidence,p_rows:preview.rows};break;
   case "commit":
    if(typeof b.hash!=="string"||!/^[a-f0-9]{64}$/.test(b.hash)) return Response.json({error:"پیش‌نمایش معتبر لازم است."},{status:422});
    name="seasonal_import_commit";args={p_id:Number(ref),p_hash:b.hash};break;
   case "access":
    if(typeof b.reason!=="string"||b.reason.trim().length<10) return Response.json({error:"دلیل روشن حداقل ده نویسه لازم است."},{status:422});
    name="seasonal_access_command";args={p_body:b};break;
   case "operations":
    if(!["review","create-cohort","cancel-cohort"].includes(String(b.action))) return Response.json({error:"عملیات ناشناخته است."},{status:422});
    if(b.action==="create-cohort") {try{b.startsAt=tehranLocalToUtc(String(b.startsLocal));delete b.startsLocal;}catch{return Response.json({error:"تاریخ تهران معتبر نیست."},{status:422});}}
    name="seasonal_operations";args={p_body:b};break;
  }
  const result=await db.rpc(name,args);
  if(result.error) {
   const code=result.error.code; const status=code==="42501"?403:code==="PT409"?409:code==="22023"||code==="22P02"||code==="23514"?422:503;
   return Response.json({error:status===403?"این اقدام برای حساب شما مجاز نیست.":status===409?"وضعیت تغییر کرده یا نیازمند بررسی است. دوباره دریافت کنید.":status===422?"ورودی یا بازه معتبر نیست.":"دریافت یا ذخیره انجام نشد؛ دوباره تلاش کنید.",code:status===503?"SEASONAL_UNAVAILABLE":code},{status,headers:privateHeaders});
  }
  return Response.json({contractVersion:CONTRACT_VERSION,data:result.data,...(preview?{rows:preview.rows.map(r=>({externalId:r.externalId,status:r.status,contact:maskContact(r.contactValue)}))}:{})},{status:200,headers:privateHeaders});
 } catch { return Response.json({error:"ذخیره انجام نشد؛ اطلاعات خود را نگه دارید و دوباره تلاش کنید.",code:"SEASONAL_UNAVAILABLE"},{status:503,headers:privateHeaders}); }
}
