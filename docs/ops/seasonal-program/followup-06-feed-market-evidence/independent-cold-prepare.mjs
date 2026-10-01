import fs from 'node:fs';
import {dir} from './independent-core.mjs';
const manifest=JSON.parse(fs.readFileSync(dir+'/app-manifest.json'));
fs.writeFileSync('C:/Users/Asus/.codex/private/followup06-feed-market/clock.txt','0');
fs.writeFileSync('C:/Users/Asus/.codex/private/followup06-feed-market/fault.json','{}');
const r=await fetch('http://127.0.0.1:15913/control?db=hang&world=ready&analytics=ready&pageMs=40');
const body=await r.json();if(!body.synthetic||body.db!=='hang')throw Error('Cold fixture not ready');
const evidence={at:new Date().toISOString(),sha:manifest.sha,environment:manifest.environment,fixtureHTTP:r.status,control:body,clockOffset:0,faults:{},applicationRequestsMade:0,nextStep:'Root restart only owned Next3398 same immutable build, then independent cold API first before any page/login/source warmup'};
fs.writeFileSync(dir+'/independent-cold-preparation.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
