import {publicationCommand,publicationFailure} from './publication';
export interface PublicationHttpAdapter {status:number;rpc(name:string,args:Record<string,unknown>):Promise<{data:unknown;error:{code?:string}|null}>}
const headers={'cache-control':'private, no-store'};
export async function postPublication(req:Request,connect:()=>Promise<PublicationHttpAdapter>):Promise<Response>{
 try{const db=await connect();if(db.status!==200)return Response.json({error:'دسترسی داخلی لازم است.'},{status:db.status,headers});
 const raw=await req.text();if(new TextEncoder().encode(raw).length>110000)return Response.json({error:'متن بیش از حد بزرگ است.'},{status:413,headers});
 let cmd:ReturnType<typeof publicationCommand>;try{cmd=publicationCommand(JSON.parse(raw));}catch(e){return Response.json({error:e instanceof Error?e.message:'فرمان معتبر نیست.'},{status:422,headers});}
 const {data,error}=await db.rpc(cmd.rpc,cmd.args);if(error){const failure=publicationFailure(error);return Response.json(failure,{status:failure.status,headers});}
 return Response.json({receipt:data,contractVersion:'publication.v1'},{status:201,headers});
 }catch{return Response.json({error:'ذخیره انجام نشد؛ متن را نگه دارید.'},{status:503,headers});}
}
