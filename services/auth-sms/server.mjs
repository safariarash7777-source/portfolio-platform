import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import {timingSafeEqual} from 'node:crypto';
import {readConfig, verifyHook, kavenegarSend, SmsError, phone} from './core.mjs';
import {Ledger} from './ledger.mjs';
export function startService(config, options={}) {
  const ledger=options.ledger ?? new Ledger(config);
  const server=createServer(async(req,res)=>{
    const respond=(status,body)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(body));};
    try {
      if(req.method==='GET' && req.url==='/health')return respond(200,{service:'auth-sms',mock:config.mock});
      if(req.method!=='POST' || !['/hooks/send-sms','/v1/admit'].includes(req.url))return respond(404,{});
      const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>32768)throw new SmsError('payload_too_large',413);chunks.push(chunk);}const raw=Buffer.concat(chunks).toString('utf8');
      if(req.url==='/v1/admit') {
        const actual=Buffer.from(req.headers.authorization ?? '');const expected=Buffer.from('Bearer '+config.controlSecret);
        if(actual.length!==expected.length || !timingSafeEqual(actual,expected))throw new SmsError('unauthorized',401);
        const input=JSON.parse(raw);
        ledger.admit(input.action,String(input.ip??'').slice(0,200),String(input.device??'').slice(0,200),phone(input.phone));
        return respond(200,{});
      }
      const message=verifyHook(raw,req.headers,config.secret);
      if(config.allowlist && !config.allowlist.split(',').map(phone).includes(message.phone))throw new SmsError('rollout_not_allowed',403);
      if(!ledger.reserve(message))return respond(200,{});
      try {
        const receipt=config.mock?await options.mockSend?.(message):await (options.send ?? kavenegarSend)(config,message);
        if(!receipt?.accepted)throw new SmsError('mock_sink_missing');
        ledger.settle(message,receipt);
      } catch(error) {ledger.settle(message,null);throw error;}
      return respond(200,{});
    } catch(error) {
      // Deliberately omit raw error, URL, phone, OTP, provider body and user object.
      const safe=error instanceof SmsError?error:new SmsError('service_unavailable');
      return respond(safe.status,{error:{http_code:safe.status,message:safe.code}});
    }
  });
  server.requestTimeout=10000;server.headersTimeout=10000;
  server.listen(config.port,config.bind);
  return {server,ledger};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const config=readConfig(process.env);
    // Local mock intentionally cannot start from CLI without an explicit in-process sink.
    if(config.mock)throw new SmsError('mock_requires_test_harness');
    startService(config);
    console.log('auth-sms service started; payload logging disabled');
  } catch {console.error('auth-sms configuration invalid; service not started');process.exitCode=1;}
}
