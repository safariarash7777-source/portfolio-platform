import { PUBLICATION_CONTRACT } from '../intelligence/publication-feed';
import { MemberReadError, type MemberRequest } from './http';
export async function publicationData<T>(path:string,guard:(v:unknown)=>v is T,request:MemberRequest=fetch,init?:RequestInit):Promise<T>{
 let response:Response;try{response=await request(path,{...init,cache:'no-store',credentials:'same-origin'});}catch{throw new MemberReadError(503);}
 if(!response.ok)throw new MemberReadError(response.status);
 let b:unknown;try{b=await response.json();}catch{throw new MemberReadError(503);}
 if(!b||typeof b!=='object')throw new MemberReadError(503);
 const body=b as Record<string,unknown>;if(body.contractVersion!==PUBLICATION_CONTRACT||!guard(body.data))throw new MemberReadError(503);
 return body.data;
}
