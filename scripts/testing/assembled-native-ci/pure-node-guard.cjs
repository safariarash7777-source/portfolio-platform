'use strict';
// v1: accidental I/O guard for reviewed, hash-pinned pure test fixtures.
// Not an OS sandbox and not containment for deliberately malicious JavaScript.
const deny=()=>{throw new Error('P03_PURE_IO_FORBIDDEN');};
const cp=require('node:child_process');
for(const name of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])cp[name]=deny;
cp.ChildProcess.prototype.spawn=deny;
const net=require('node:net');net.connect=net.createConnection=deny;net.Socket.prototype.connect=deny;net.Server.prototype.listen=deny;
const tls=require('node:tls');tls.connect=deny;
for(const name of ['node:http','node:https']){const m=require(name);m.request=m.get=deny;}
require('node:http2').connect=deny;
const dgram=require('node:dgram');dgram.createSocket=deny;dgram.Socket.prototype.send=dgram.Socket.prototype.bind=deny;
const dns=require('node:dns');
for(const key of Object.keys(dns)){if(/^(lookup|resolve|reverse)/.test(key)&&typeof dns[key]==='function')dns[key]=deny;}
for(const key of Object.keys(dns.promises)){if(/^(lookup|resolve|reverse)/.test(key)&&typeof dns.promises[key]==='function')dns.promises[key]=deny;}
for(const proto of [dns.Resolver.prototype,dns.promises.Resolver.prototype])for(const key of Object.getOwnPropertyNames(proto)){if(/^(resolve|reverse)/.test(key)&&typeof proto[key]==='function')proto[key]=deny;}
require('node:worker_threads').Worker=class {constructor(){deny();}};
process.dlopen=process.kill=deny;
globalThis.fetch=deny; // Deliberate synthetic mock replacement remains possible.
if('WebSocket' in globalThis)globalThis.WebSocket=class {constructor(){deny();}};
require('node:module').syncBuiltinESMExports();
Object.defineProperty(globalThis,Symbol.for('p03.pure.guard.v1'),{value:Object.freeze({version:1}),writable:false,configurable:false});
process.stdout.write('P03_PURE_GUARD_INSTALLED_V1\n');
