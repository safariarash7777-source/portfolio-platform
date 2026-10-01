// Test process only: forbid external fetch; route CoinGecko to synthetic local HTTP.
const fs=require('node:fs');
const realNow=Date.now;
if(process.env.FOLLOWUP_CLOCK_FILE)Date.now=()=>realNow()+Number(fs.readFileSync(process.env.FOLLOWUP_CLOCK_FILE,'utf8')||0);
const original=globalThis.fetch;
globalThis.fetch=function(input,init){
 const url=new URL(typeof input==='string'||input instanceof URL?String(input):input.url);
 if(url.hostname==='api.coingecko.com')return original('http://127.0.0.1:15903/world',init);
 if(!['127.0.0.1','localhost'].includes(url.hostname))throw new Error('Fixture forbids external fetch');
 return original(input,init);
};
