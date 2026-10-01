import {confirmation,TOKEN} from './bridge';
import {isPrivateBotConversation} from '../telegram/private-chat';
import type {Rpc} from './worker';
export async function connectionMessage(message:{from?:{id?:number;is_bot?:boolean};chat?:{id?:number;type?:string};text?:string},db:Rpc,reply:(chat:number,text:string)=>Promise<unknown>){
 if(!message.text?.startsWith('/link '))return false;
 if(!isPrivateBotConversation(message))return true;
 const token=message.text.slice(6).trim();if(!TOKEN.test(token)){await reply(message.chat!.id!,'فرمان اتصال معتبر نیست؛ کد تازه از سایت بگیرید.');return true;}
 const c=confirmation();const r=await db.rpc('next09_prove_link',{p_token:token,p_telegram:message.from!.id!,p_confirmation_hash:c.hash});
 if(r.error){await reply(message.chat!.id!,'اتصال تأیید نشد؛ کد تازه از سایت بگیرید.');return true;}
 await reply(message.chat!.id!,'برای پایان اتصال، این کد را فقط در همان صفحه سایت که خودتان باز کرده‌اید وارد کنید:\n'+c.value+'\nهنوز اتصال نهایی یا رضایت اعلان ثبت نشده است.');return true;
}
