// This application contains PR185+187 only. NEXT09 is not included or executed.
// Real Auth/Storage/REST remain native. Only three PUBLIC market datasets and
// CoinGecko are routed to the separate owned synthetic HTTP fixture.
const fs=require('node:fs'),os=require('node:os'),mod=require('node:module');
const cpu=os.cpus()[0];os.cpus=()=>[cpu];os.availableParallelism=()=>1;mod.syncBuiltinESMExports();
const realNow=Date.now;Date.now=()=>realNow()+Number(fs.readFileSync(process.env.FOLLOWUP_CLOCK_FILE,'utf8')||0);
const original=global.fetch;
global.fetch=(input,init)=>{
 const url=new URL(typeof input==='string'||input instanceof URL?String(input):input.url);
 if(url.hostname==='api.coingecko.com')return original('http://127.0.0.1:15913/world',init);
 if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)){
  fs.appendFileSync(process.env.FOLLOWUP_EGRESS_AUDIT,JSON.stringify({at:new Date().toISOString(),host:url.hostname,action:'DENIED',performed:false})+'\n');
  return Promise.reject(new Error('Owned sandbox denies external egress'));
 }
 if(url.port==='3399'&&/^\/supabase\/rest\/v1\/(ir_market_snapshots|symbol_history|codal_reports)$/.test(url.pathname)){
  return original('http://127.0.0.1:15913'+url.pathname.replace('/supabase','')+url.search,init);
 }
 return original(input,init);
};
