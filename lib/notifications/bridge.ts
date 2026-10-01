import {createHmac,timingSafeEqual,createHash,randomBytes} from 'node:crypto';
export const CONTRACT='notifications.v1';
export const TOKEN=/^[a-f0-9]{64}$/;
export function confirmation(){const value=randomBytes(32).toString('hex');return {value,hash:createHash('sha256').update(value).digest('hex')};}
export function bridgeSignature(secret:string,timestamp:string,body:string){return createHmac('sha256',secret).update('notifications.v1\n'+timestamp+'\n'+body).digest('hex');}
export function verifyBridge(secret:string|undefined,timestamp:string|null,signature:string|null,body:string,now=Date.now()){
 if(!secret || secret.length<32 || !timestamp || !/^\d{13}$/.test(timestamp) || Math.abs(now-Number(timestamp))>60000 || !signature || !TOKEN.test(signature))return false;
 const expected=bridgeSignature(secret,timestamp,body);return timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(expected,'hex'));
}
export function publicationLink(origin:string,path:string){
 const u=new URL(origin);if(u.protocol!=='https:' || u.username || u.password || u.pathname!=='/' || u.search || u.hash)throw new Error('invalid origin');
 if(!/^\/publications\/[a-f0-9-]{36}$/.test(path) && path!=='/notifications')throw new Error('invalid path');
 return new URL('/login?next='+encodeURIComponent(path),u).href;
}
