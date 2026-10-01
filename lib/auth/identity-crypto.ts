import 'server-only';
import {createCipheriv,createDecipheriv,createHmac,randomBytes} from 'node:crypto';
export interface PrivateIdentity {firstName:string;lastName:string;nationalId:string;}
function material(){
  const version=process.env.AUTH_IDENTITY_KEY_VERSION;
  const encryption=Buffer.from(process.env.AUTH_IDENTITY_ENCRYPTION_KEY??'','base64');
  const hmac=Buffer.from(process.env.AUTH_IDENTITY_HMAC_KEY??'','base64');
  if(!version || !/^[a-zA-Z0-9-]{1,40}$/.test(version) || encryption.length!==32 || hmac.length<32)throw new Error('identity_keys_unavailable');
  return {version,encryption,hmac};
}
export function encryptIdentity(userId:string,value:PrivateIdentity){
  const keys=material();const nonce=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',keys.encryption,nonce);
  cipher.setAAD(Buffer.from(userId+':'+keys.version));
  const encrypted=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return {ciphertext:Buffer.concat([nonce,cipher.getAuthTag(),encrypted]).toString('base64'),digest:createHmac('sha256',keys.hmac).update(value.nationalId).digest('hex'),keyVersion:keys.version};
}
export function decryptIdentity(userId:string,ciphertext:string,keyVersion:string):PrivateIdentity{
  const keys=material();
  // Rotation must retain old decryption keys before switching writes; fail closed if absent.
  const key=keyVersion===keys.version?keys.encryption:Buffer.from(JSON.parse(process.env.AUTH_IDENTITY_OLD_ENCRYPTION_KEYS??'{}')[keyVersion]??'','base64');
  if(key.length!==32)throw new Error('identity_old_key_unavailable');
  const body=Buffer.from(ciphertext,'base64');const decipher=createDecipheriv('aes-256-gcm',key,body.subarray(0,12));
  decipher.setAAD(Buffer.from(userId+':'+keyVersion));decipher.setAuthTag(body.subarray(12,28));
  return JSON.parse(Buffer.concat([decipher.update(body.subarray(28)),decipher.final()]).toString('utf8'));
}
