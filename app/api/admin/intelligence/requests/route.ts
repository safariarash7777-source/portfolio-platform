import { NextResponse } from 'next/server';
import { publicationAdmin } from '@/lib/intelligence/publication-server';
import { publicationId } from '@/lib/intelligence/publication';
export const dynamic='force-dynamic';
const headers={'cache-control':'private, no-store'};
export async function GET(){
 try{const {db,status}=await publicationAdmin();if(status!==200)return NextResponse.json({error:'دسترسی داخلی لازم است.'},{status,headers});
 const {data,error}=await db.from('leads').select('id,name,phone,topic,message,status,notes,preferred_date,preferred_time,created_at,updated_at').order('created_at',{ascending:false}).limit(100);
 return error?NextResponse.json({state:'unavailable',error:'درخواست‌ها قابل دریافت نیستند.'},{status:503,headers}):NextResponse.json({state:'available',items:data??[]},{headers});
 }catch{return NextResponse.json({state:'unavailable',error:'درخواست‌ها قابل دریافت نیستند.'},{status:503,headers});}
}
export async function PATCH(req:Request){
 try{const {db,status}=await publicationAdmin();if(status!==200)return NextResponse.json({error:'دسترسی داخلی لازم است.'},{status,headers});
 let p:Record<string,unknown>,id:string;try{p=await req.json();id=publicationId(p.id);}catch{return NextResponse.json({error:'اطلاعات پیگیری معتبر نیست.'},{status:422,headers});}if(typeof p.status!=='string'||!['new','contacted','converted','archived'].includes(p.status)||typeof p.notes!=='string'||p.notes.trim().length<5||p.notes.length>2000||typeof p.updatedAt!=='string'||!Number.isFinite(Date.parse(p.updatedAt)))return NextResponse.json({error:'وضعیت و یادداشت پیگیری را کامل کنید.'},{status:422,headers});
 const {data,error}=await db.from('leads').update({status:p.status,notes:p.notes.trim()}).eq('id',id).eq('updated_at',p.updatedAt).select('id').maybeSingle();
 if(error)return NextResponse.json({error:'پیگیری ثبت نشد.'},{status:503,headers});if(!data)return NextResponse.json({error:'درخواست تغییر کرده است؛ دوباره دریافت کنید.'},{status:409,headers});
 return NextResponse.json({id:data.id},{headers});
 }catch{return NextResponse.json({error:'پیگیری ثبت نشد؛ درخواست و متن شما حفظ شده است.'},{status:503,headers});}
}
