"use client";
import { useEffect, useRef, useState } from "react";
import type { CashFlowRead } from "@/lib/portfolio/cashFlowApiContract";
import { cashFlowUuid } from "@/lib/portfolio/cashFlowApiContract";
import { installmentTotals, validatePaymentRead, samePaymentRequest, type PaymentRead, type InstallmentPaymentRequest } from "@/lib/portfolio/installmentPayments";
import type { DebtPosition } from "@/lib/portfolio/balanceSheet";
import { formatJalali, formatToman } from "@/lib/format";
const endpoint="/api/personal-finance/installments";
export default function InstallmentPayments({ data, disabled }: {data:CashFlowRead;disabled:boolean}) {
 const [ledger,setLedger]=useState<PaymentRead|null>(null),[debts,setDebts]=useState<{id:string;items:DebtPosition[]}|null>(null);
 const [debt,setDebt]=useState(''),[entry,setEntry]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[unknown,setUnknown]=useState(false);
 const pending=useRef<InstallmentPaymentRequest|null>(null),lock=useRef(false),alive=useRef(false);
 useEffect(()=>{alive.current=true;const controller=new AbortController();
  void Promise.all([fetch(endpoint,{cache:'no-store',signal:controller.signal}),fetch('/api/portfolio/holdings',{cache:'no-store',signal:controller.signal})]).then(async([a,b])=>{
   if(!a.ok||!b.ok)throw Error();const l=validatePaymentRead(await a.json(),data.ownerId),h=await b.json();
   if(h.ownerId!==data.ownerId||h.state!=='ready'||!cashFlowUuid(h.version?.id)||!Array.isArray(h.debts))throw Error();
   if(alive.current){setLedger(l);setDebts({id:h.version.id,items:h.debts.filter((d:DebtPosition)=>d.next_due_on&&Number.isSafeInteger(d.next_installment_toman)&&d.next_installment_toman!>0)});}
  }).catch(()=>{if(alive.current)setMessage('خواندن دفتر پرداخت یا بدهی‌ها کامل نشد؛ ثبت فعال نیست.');});
  return()=>{alive.current=false;controller.abort();};
 },[data.ownerId]);
 async function readback(){
  const r=await fetch(endpoint,{cache:'no-store'});if(!r.ok)throw Error();const next=validatePaymentRead(await r.json(),data.ownerId);
  if(!alive.current)return false;setLedger(next);
  if(pending.current){const found=next.payments.find(p=>p.client_token===pending.current!.clientToken&&samePaymentRequest(p.request,pending.current!));
   if(!found){setUnknown(true);setMessage('نتیجه هنوز مشخص نیست؛ ثبت تکرار نمی‌شود. فقط بازخوانی کنید.');return false;}
   pending.current=null;setUnknown(false);setMessage('پرداخت مستقل بازخوانی شد؛ مانده بدهی تغییر نکرده است.');
  }return true;
 }
 async function save(original?:InstallmentPaymentRequest){
  if(lock.current||disabled||unknown||!ledger||!debts||!data.snapshot)return;
  const request:InstallmentPaymentRequest=original?{...original,action:'void',clientToken:crypto.randomUUID(),baseVersion:ledger.version}:{expectedOwnerId:data.ownerId,clientToken:crypto.randomUUID(),baseVersion:ledger.version,paymentKey:crypto.randomUUID(),action:'record',holdingVersionId:debts.id,debtKey:debt,cashVersionId:data.snapshot.id,entryKey:entry};
  lock.current=true;setBusy(true);pending.current=request;setUnknown(true);
  try{const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)});
   if(!alive.current)return;
   if([400,403,409].includes(r.status)){pending.current=null;setUnknown(false);setMessage('ثبت رد شد؛ ممکن است نسخه عوض شده یا این خروج نقد قبلاً تخصیص یافته باشد. دفتر را دوباره بخوانید.');return;}
   // Even an acknowledged POST must be independently reconciled; no automatic replay.
   await readback();
  }catch{if(alive.current)setMessage('نتیجه ثبت نامعلوم است؛ درخواست دوباره ارسال نمی‌شود. فقط بازخوانی کنید.');}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 const entries=data.snapshot?.payload.entries.filter(e=>e.basis==='actual'&&e.kind==='expense'&&e.amountToman!==null&&e.amountToman>0&&e.occurredOn&&e.source)??[];
 const latest=new Map<string,PaymentRead['payments'][number]>();ledger?.payments.forEach(p=>latest.set(p.payment_key,p));
 const groups=ledger?installmentTotals(ledger.payments):[];
 return <section className="card p-5 space-y-4" aria-label="پرداخت اقساط از جریان نقد">
  <h2 className="font-bold">ثبت پرداخت کامل یا جزئی قسط</h2>
  <p className="text-sm leading-7">ابتدا خروج نقد واقعی را در همین دوره ثبت کنید؛ سپس آن را به قسط متصل کنید. این کار خروج نقد دیگری نمی‌سازد و مانده بدهی را خودکار کم نمی‌کند. سهم اصل و سود فعلاً نامعلوم است.</p>
  {message&&<p role="status" className="text-sm leading-7">{message}</p>}
  <button type="button" className="btn btn-outline" disabled={busy} onClick={()=>{void readback().catch(()=>setMessage('بازخوانی انجام نشد؛ نتیجه قبلی حفظ شد.'));}}>بازخوانی دفتر پرداخت</button>
  {ledger&&debts&&<>
   <fieldset disabled={disabled||busy||unknown} className="grid gap-3 md:grid-cols-2">
    <label>قسط ثبت‌شده<select className="input w-full" value={debt} onChange={e=>setDebt(e.target.value)}><option value="">انتخاب قسط</option>{debts.items.map(d=><option key={d.debt_key} value={d.debt_key}>{d.title} · {formatToman(d.next_installment_toman!)} · {formatJalali(d.next_due_on!)}</option>)}</select></label>
    <label>خروج نقد واقعی<select className="input w-full" value={entry} onChange={e=>setEntry(e.target.value)}><option value="">انتخاب پرداخت ثبت‌شده</option>{entries.map(e=><option key={e.entryKey} value={e.entryKey}>{e.category??'خروج نقد ثبت‌شده'} · {formatToman(e.amountToman!)} · {formatJalali(e.occurredOn!)}</option>)}</select></label>
    <button type="button" className="btn btn-primary" disabled={!debt||!entry} onClick={()=>void save()}>اتصال پرداخت به قسط</button>
   </fieldset>
   {debts.items.length===0&&<p>قسط دارای مبلغ و موعد ثبت نشده است؛ <a className="underline" href="/dashboard/holdings#debt-editor">ثبت بدهی و قسط</a>.</p>}
   {entries.length===0&&<p>در نسخه انتخابی خروج نقد واقعیِ دارای مبلغ، روز و منبع وجود ندارد.</p>}
   <ul className="space-y-3">{groups.map(g=><li key={JSON.stringify([g.debtKey,g.dueOn])} className="border rounded-xl p-3" style={{borderColor:'var(--line)'}}>
    <p>{debts.items.find(d=>d.debt_key===g.debtKey)?.title??'قسط ثبت‌شده در سابقه'} · {formatJalali(g.dueOn)}</p>
    <p>{g.needsReconciliation?'اطلاعات نقدی مرتبط اصلاح شده؛ پرداخت و باقیمانده نیازمند تطبیق‌اند.':`پرداخت ثبت‌شده: ${formatToman(g.paidToman!)}؛ باقیمانده قسط: ${formatToman(g.remainingToman!)}`}</p>
   </li>)}</ul>
   <ul className="space-y-2">{[...latest.values()].filter(p=>p.action==='record').map(p=><li key={p.id} className="flex flex-wrap items-center gap-3"><span>{formatToman(p.amount_toman)} · {formatJalali(p.due_on)}</span><button type="button" className="btn btn-outline" disabled={disabled||busy||unknown} onClick={()=>void save(p.request)}>لغو اتصال این پرداخت با حفظ سابقه</button></li>)}</ul>
  </>}
 </section>;
}
