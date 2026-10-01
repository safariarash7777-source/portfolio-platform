// Dedicated Node service. Never imported by Next/browser bundles; never logs payloads.
import {createHmac, timingSafeEqual} from 'node:crypto';
export class SmsError extends Error {
  constructor(code, status = 503) { super(code); this.code = code; this.status = status; }
}
export function phone(value) {
  const digits = String(value).replace(/[۰-۹]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace(/[\s()-]/g,'');
  const national = digits.replace(/^(?:\+98|0098|98|0)/,'');
  if (!/^9\d{9}$/.test(national)) throw new SmsError('invalid_phone',400);
  return '+98'+national;
}
export const fingerprint = (secret, value) => createHmac('sha256',secret).update(value).digest('hex');
export function verifyHook(raw, headers, secrets, now = Date.now()) {
  const id = headers['webhook-id'], timestamp = headers['webhook-timestamp'], signatures = headers['webhook-signature'];
  if (!id || !/^[\w-]{1,200}$/.test(id) || !/^\d{10}$/.test(timestamp ?? '') || !signatures || Math.abs(now / 1000 - Number(timestamp)) > 300) throw new SmsError('invalid_signature',401);
  const signed = `${id}.${timestamp}.${raw}`;
  const matches = secrets.split('|').some(secret=>{
    if (!/^v1,whsec_[A-Za-z0-9+/=]{32,88}$/.test(secret)) return false;
    const key = Buffer.from(secret.slice(9),'base64');
    if (key.length < 24) return false;
    const expected = createHmac('sha256',key).update(signed).digest();
    return signatures.split(' ').some(signature=>{
      const [version,encoded] = signature.split(',');
      if(version!=='v1' || !encoded) return false;
      const actual = Buffer.from(encoded,'base64');
      return actual.length===expected.length && timingSafeEqual(actual,expected);
    });
  });
  if (!matches) throw new SmsError('invalid_signature',401);
  let body; try { body = JSON.parse(raw); } catch { throw new SmsError('invalid_payload',400); }
  // v2.197.0 supplies sms.phone: the delivery target may be the NEW phone,
  // while user.phone still refers to the old account identity during linking.
  const target=body.sms?.phone ?? body.user?.phone;
  if (!/^\d{6}$/.test(body.sms?.otp ?? '') || typeof target !== 'string') throw new SmsError('invalid_payload',400);
  return {id, phone:phone(target), otp:body.sms.otp};
}
export async function kavenegarSend(config, message, fetcher = fetch) {
  // API key is part of the provider's mandated path; no tracing/logging URL/errors/body.
  const url = `https://api.kavenegar.com/v1/${encodeURIComponent(config.apiKey)}/verify/lookup.json`;
  let response, payload;
  try {
    response = await fetcher(url,{method:'POST',redirect:'error',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({receptor:'0'+message.phone.slice(3),token:message.otp,template:config.template,type:'sms'}),signal:AbortSignal.timeout(5000)});
    payload = await response.json();
  } catch { throw new SmsError('provider_unavailable'); }
  const entry = payload.entries?.[0];
  if (!response.ok || payload.return?.status!==200 || !entry?.messageid || ![1,2,4,5,10].includes(entry.status) || !Number.isFinite(entry.cost) || entry.cost < 0) throw new SmsError('provider_rejected');
  return {accepted:true,costRial:entry.cost}; // Receipt is not OTP verification or delivery.
}
export function readConfig(env) {
  const mock = env.SMS_PROVIDER==='local-mock';
  if (mock && (env.NODE_ENV==='production' || env.AUTH_SMS_LOCAL_SANDBOX!=='true' || !['127.0.0.1','localhost'].includes(env.SMS_BIND ?? '127.0.0.1'))) throw new SmsError('mock_forbidden');
  if (!mock && env.SMS_PROVIDER!=='kavenegar') throw new SmsError('provider_not_configured');
  const config = {mock,bind:env.SMS_BIND ?? '127.0.0.1',port:Number(env.PORT ?? 8788),secret:env.SEND_SMS_HOOK_SECRET,controlSecret:env.AUTH_SMS_CONTROL_SECRET,hmacSecret:env.AUTH_SMS_FINGERPRINT_SECRET,dbPath:env.AUTH_SMS_DB_PATH,apiKey:env.KAVENEGAR_API_KEY,template:env.KAVENEGAR_TEMPLATE,allowlist:env.AUTH_SMS_PHONE_ALLOWLIST ?? ''};
  for(const key of ['secret','controlSecret','hmacSecret','dbPath']) if(!config[key]) throw new SmsError('configuration_missing');
  if(config.controlSecret.length<32 || config.hmacSecret.length<32) throw new SmsError('configuration_invalid');
  if(!mock && (!config.apiKey || !/^[a-zA-Z0-9]+$/.test(config.template ?? '') || env.KAVENEGAR_TEMPLATE_APPROVED!=='true')) throw new SmsError('template_not_approved');
  config.dailySends=Number(env.SMS_DAILY_SEND_LIMIT);
  config.dailyBudget=Number(env.SMS_DAILY_BUDGET_RIAL);
  config.reserveCost=Number(env.SMS_MAX_MESSAGE_COST_RIAL);
  if (![config.dailySends,config.dailyBudget,config.reserveCost].every(x=>Number.isSafeInteger(x)&&x>0)) throw new SmsError('budget_not_configured');
  return config;
}
