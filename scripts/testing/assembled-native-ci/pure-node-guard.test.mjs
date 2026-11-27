import test from 'node:test';
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import http2 from 'node:http2';
import dgram from 'node:dgram';
import dns from 'node:dns';
import { Worker } from 'node:worker_threads';
test('guard was installed before any reviewed test module',()=>{
  assert.deepEqual(globalThis[Symbol.for('p03.pure.guard.v1')],{version:1});
  assert.equal(Object.isFrozen(globalThis[Symbol.for('p03.pure.guard.v1')]),true);
});
test('child processes workers and native addon loading reject before I/O',()=>{
  for(const name of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])assert.throws(()=>cp[name]('not-a-command'),/P03_PURE_IO_FORBIDDEN/);
  assert.throws(()=>new cp.ChildProcess().spawn({file:'not-a-command'}),/P03_PURE_IO_FORBIDDEN/);
  assert.throws(()=>new Worker('not-a-worker'),/P03_PURE_IO_FORBIDDEN/);
  assert.throws(()=>process.dlopen({},'not-an-addon'),/P03_PURE_IO_FORBIDDEN/);
  assert.throws(()=>process.kill(999999999),/P03_PURE_IO_FORBIDDEN/);
});
test('network and DNS entrypoints reject before resolution or connection',()=>{
  for(const fn of [()=>net.connect(1,'invalid.test'),()=>new net.Socket().connect(1),()=>net.createServer().listen(1),()=>tls.connect(1),()=>http.get('http://invalid.test'),()=>https.request('https://invalid.test'),()=>http2.connect('https://invalid.test'),()=>dgram.createSocket('udp4'),()=>dns.lookup('invalid.test',()=>{}),()=>dns.promises.lookup('invalid.test'),()=>new dns.Resolver().resolve4('invalid.test'),()=>new dns.promises.Resolver().resolve4('invalid.test')])assert.throws(fn,/P03_PURE_IO_FORBIDDEN/);
});
test('fetch starts denied while an explicit mock remains replaceable',async()=>{
  const original=globalThis.fetch;
  assert.throws(()=>original('https://invalid.test'),/P03_PURE_IO_FORBIDDEN/);
  let calls=0;try{globalThis.fetch=async()=>{calls++;return 'synthetic';};assert.equal(await fetch('synthetic'),'synthetic');assert.equal(calls,1);}finally{globalThis.fetch=original;}
});
