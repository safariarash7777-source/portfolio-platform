import fs from 'node:fs';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import dgram from 'node:dgram';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';

const attempts = { network: 0, childProcess: 0, sensitiveEnvironment: 0, privateFile: 0 };
const deny = kind => () => { attempts[kind]++; throw new Error('B2 offline guard denied '+kind); };
globalThis.fetch = deny('network');
net.Socket.prototype.connect = deny('network');
net.connect = net.createConnection = deny('network');
tls.connect = deny('network');
http.request = http.get = https.request = https.get = deny('network');
for (const key of ['lookup','resolve','resolve4','resolve6','reverse']) dns[key] = deny('network');
for (const key of ['lookup','resolve','resolve4','resolve6','reverse']) dns.promises[key] = deny('network');
dgram.Socket.prototype.send = deny('network');
for (const key of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork']) childProcess[key] = deny('childProcess');
const env = process.env;
process.env = new Proxy(env, {get(target,key) {
 if(typeof key==='string'&&/BRSAPI|SUPABASE|SECRET|PASSWORD|PRIVATE_KEY|API_KEY|(?:^|_)TOKEN(?:$|_)/i.test(key)) return deny('sensitiveEnvironment')();
 return Reflect.get(target,key);
}});
const checkPath = file => {
 const text=String(file);
 if(/(?:^|[\\/])\.env(?:[.\\/]|$)|\.private\.|(?:^|[\\/])\.ssh[\\/]|inventory-after/i.test(text)) deny('privateFile')();
};
const readFile=fs.readFileSync;
fs.readFileSync=function(file,...args){checkPath(file);return readFile.call(this,file,...args);};
const asyncReadFile=fs.promises.readFile;
fs.promises.readFile=async function(file,...args){checkPath(file);return asyncReadFile.call(this,file,...args);};
syncBuiltinESMExports();
process.on('exit',()=> {
 console.log('B2_OFFLINE_GUARD '+JSON.stringify(attempts));
 if(Object.values(attempts).some(x=>x>0))process.exitCode=1;
});
