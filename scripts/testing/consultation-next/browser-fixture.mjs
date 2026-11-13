/** Loopback-only synthetic UI fixture. No Auth, API, database or production acceptance claim. */
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const output = mkdtempSync(join(tmpdir(), 'advisor-ui-synthetic-'));
const source = `
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import RepliesPanel from './components/consultation/RepliesPanel';
import RosterPanel from './components/consultation/RosterPanel';
function App(){
 const [member,setMember]=useState(false),[risk,setRisk]=useState(''),[selected,setSelected]=useState(''),[history,setHistory]=useState([]);
 const rows=[{relationshipId:'synthetic-a',label:'عضو آزمایشی با نام طولانی برای بررسی نمایش موبایل',risk:{label:'متعادل',status:'معتبر',assessedAt:'2026-10-01T10:00:00Z',expiresAt:'2027-03-30T10:00:00Z'},assets:{valueToman:null,asOf:null,definition:'ارزش دارایی؛ هنوز محاسبه نشده',partial:false},missingInformation:['جریان نقد دوره ثبت نشده']},{relationshipId:'synthetic-b',label:'عضو آزمایشی دوم',risk:{label:null,status:'ثبت نشده',assessedAt:null,expiresAt:null},assets:{valueToman:null,asOf:null,definition:'ارزش دارایی؛ هنوز محاسبه نشده',partial:false},missingInformation:['ارزیابی ریسک ثبت نشده','دارایی ثبت نشده']}];
 return <main className="mx-auto max-w-4xl space-y-5 p-4" dir="rtl"><h1 className="text-xl font-bold">نمونهٔ نمایشی — آزمون رابط میز مشاور</h1><p>همه اطلاعات ساختگی‌اند؛ هیچ پاسخی به عضو واقعی ارسال نمی‌شود.</p><button className="btn btn-outline" onClick={()=>setMember(!member)}>{member?'نمای مشاور':'نمای عضو'}</button>
 <RosterPanel advisorMode={!member} state={{status:'ready',rows:risk?rows.filter(r=>r.risk.label===risk):rows}} filters={[{key:'risk',label:'دسته ریسک',value:risk,options:[{value:'',label:'همه'},{value:'متعادل',label:'متعادل'}]}]} locked={false} selectedId={selected} onFilter={(_,v)=>setRisk(v)} onSelect={setSelected} onRetry={()=>{}}/>
 <RepliesPanel sessionId="synthetic-session" sessionVersion={1} questions={[{id:'synthetic-question',text:'آیا پیش از اقدام باید اطلاعات درآمد و هزینه این ماه را تکمیل کنم؟',createdAt:'2026-10-24T10:00:00Z',replies:history}]} canReply={!member} locked={false} onSave={async e=>{setHistory(h=>[...h,{id:'synthetic-'+(h.length+1),version:h.length+1,text:e.text,createdAt:'2026-10-24T12:00:00Z'}]);return true;}}/>
 </main>;
}
createRoot(document.getElementById('root')).render(<App/>);
`;
await build({stdin:{contents:source,resolveDir:root,sourcefile:'synthetic-ui.tsx',loader:'tsx'},bundle:true,platform:'browser',format:'iife',outfile:join(output,'app.js'),tsconfig:join(root,'tsconfig.json'),define:{'process.env.NODE_ENV':'"development"'}});
const css=spawnSync(process.execPath,[join(root,'node_modules/tailwindcss/lib/cli.js'),'-i',join(root,'app/globals.css'),'-o',join(output,'app.css')],{cwd:root,encoding:'utf8'});
if(css.status!==0)throw Error(css.stderr);
const html='<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>آزمون ساختگی میز مشاور</title><link rel="stylesheet" href="/app.css"><style>@font-face{font-family:Vazirmatn;src:url(/font.woff2)}body{font-family:Vazirmatn,Tahoma,sans-serif}</style><body><div id="root"></div><script src="/app.js"></script></body></html>';
const files={'/app.js':[join(output,'app.js'),'text/javascript; charset=utf-8'],'/app.css':[join(output,'app.css'),'text/css; charset=utf-8'],'/font.woff2':[join(root,'public/fonts/Vazirmatn-Variable.woff2'),'font/woff2']};
const server=createServer((req,res)=>{res.setHeader('Cache-Control','no-store');const file=files[req.url];if(file){res.setHeader('Content-Type',file[1]);res.end(readFileSync(file[0]));}else if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);}else{res.statusCode=404;res.end();}});
server.listen(4318,'127.0.0.1',()=>console.log('Synthetic UI only: http://127.0.0.1:4318'));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)));
