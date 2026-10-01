import { publicationId, PUBLICATION_CONTRACT } from './publication';
import { decodePublicationCursor, publicationFeedDto, isReadReceipt, isPublicationDetail } from './publication-feed';
import type { PublicationHttpAdapter } from './publication-http';
const headers={'cache-control':'private, no-store'};
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers});
const failure=(status:number)=>reply({error:status===401?'برای مشاهده وارد حساب شوید.':status===403?'دسترسی این دوره برای حساب شما تأیید نشد.':status===404?'محتوا در دسترس نیست.':status===400?'درخواست معتبر نیست.':'دریافت اطلاعات انجام نشد؛ دوباره تلاش کنید.'},status);
const rpcStatus=(code?:string)=>code==='42501'?403:code==='P0002'?404:code?.startsWith('22')?400:503;
export async function getPublicationFeed(req:Request,cohort:string,connect:()=>Promise<PublicationHttpAdapter>):Promise<Response>{
 try{
  let id:string;try{id=publicationId(cohort);}catch{return failure(404);}
  const db=await connect();if(db.status!==200)return failure(db.status);
  const query=new URL(req.url).searchParams;let limit=20,beforeAt:string|null=null,beforeId:string|null=null;
  try{
   if([...query.keys()].some(k=>!['cursor','limit'].includes(k))||query.getAll('cursor').length>1||query.getAll('limit').length>1)throw Error();
   if(query.has('limit')){const raw=query.get('limit')!;if(!/^[1-9]\d?$/.test(raw)||Number(raw)>50)throw Error();limit=Number(raw);}
   if(query.has('cursor')){const cursor=decodePublicationCursor(query.get('cursor')!,id);beforeAt=cursor.publishedAt;beforeId=cursor.versionId;}
  }catch{return failure(400);}
  const {data,error}=await db.rpc('list_cohort_research_publications',{p_cohort:id,p_before_at:beforeAt,p_before_id:beforeId,p_limit:limit});
  if(error)return failure(rpcStatus(error.code));
  return reply({data:publicationFeedDto(data,id),contractVersion:PUBLICATION_CONTRACT});
 }catch{return failure(503);}
}
export async function getScopedPublication(req:Request,version:string,connect:()=>Promise<PublicationHttpAdapter>):Promise<Response>{
 try{
  let id:string,cohort:string;try{const q=new URL(req.url).searchParams;if(q.getAll('cohort').length!==1)throw Error();id=publicationId(version);cohort=publicationId(q.get('cohort'));}catch{return failure(404);}
  const db=await connect();if(db.status!==200)return failure(db.status);
  const {data,error}=await db.rpc('read_cohort_research_publication',{p_version:id,p_cohort:cohort});
  if(error)return failure(rpcStatus(error.code));if(data===null)return failure(404);if(!isPublicationDetail(data)||data.id!==id)return failure(503);
  return reply({data:{id:data.id,title:data.title,summary:data.summary,content:data.content,version:data.version,sources:data.sources.map(s=>({url:s.url,asOf:s.asOf}))},contractVersion:PUBLICATION_CONTRACT});
 }catch{return failure(503);}
}
export async function postPublicationRead(req:Request,version:string,connect:()=>Promise<PublicationHttpAdapter>):Promise<Response>{
 try{
  let id:string;try{id=publicationId(version);}catch{return failure(404);}
  const db=await connect();if(db.status!==200)return failure(db.status);
  let cohort:string;try{
   const raw=await req.text();if(new TextEncoder().encode(raw).length>1024)throw Error();const body=JSON.parse(raw);
   if(!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).join(',')!=='cohortId')throw Error();cohort=publicationId(body.cohortId);
  }catch{return failure(400);}
  const {data,error}=await db.rpc('mark_research_publication_read',{p_version:id,p_cohort:cohort});
  if(error)return failure(rpcStatus(error.code));if(!isReadReceipt(data)||data.versionId!==id)return failure(503);
  return reply({data:{versionId:data.versionId,readAt:data.readAt,hasBeenRead:true},contractVersion:PUBLICATION_CONTRACT});
 }catch{return failure(503);}
}
