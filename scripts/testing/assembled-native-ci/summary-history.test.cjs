'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module'),{createHash,webcrypto}=require('node:crypto');
const root=__dirname,argument=name=>process.argv.find(v=>v.startsWith(name+'='))?.slice(name.length+1),control=argument('--control-root');
const request=createRequire(control?path.join(path.resolve(control),'package.json'):__filename),sha=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'capsule-manifest.json'))),rawFixture=fs.readFileSync(path.join(root,'actual-component-fixture.json'));
assert.equal(globalThis[Symbol.for('p03.pure.guard.v1')]?.version,1);
assert.equal(sha(fs.readFileSync(path.join(root,'pure-node-guard.cjs'))),'4f572d05be71696339860f301d4891f6dbe0e4ab3a7f70570052ce69eb9bb028');
for(const pin of Object.values(manifest.runtimeFiles)){const filename=path.join(path.dirname(request.resolve(pin.package+'/package.json')),pin.relative),data=fs.readFileSync(filename);assert.equal(data.length,pin.bytes);assert.equal(sha(data),pin.sha256);}
assert.equal(sha(rawFixture),manifest.fixtureSha256);const fixture=JSON.parse(rawFixture),records=new Map(fixture.modules.map(r=>[r.path,r]));
const ts=request('typescript'),React=request('react'),{renderToStaticMarkup}=request('react-dom/server'),realJsx=request('react/jsx-runtime');
let hostNodes=[];
const jsxObserver={...realJsx,jsx(type,props,key){const node=realJsx.jsx(type,props,key);if(typeof type==='string')hostNodes.push(node);return node;},jsxs(type,props,key){const node=realJsx.jsxs(type,props,key);if(typeof type==='string')hostNodes.push(node);return node;}};
const cache=new Map();
function actual(file){
 if(cache.has(file))return cache.get(file).exports;
 const record=records.get(file);assert(record,'actual e0 dependency must be pinned');const raw=Buffer.from(record.text);
 assert.equal(raw.length,record.bytes);assert.equal(sha(raw),record.sha256);assert.equal(createHash('sha1').update(Buffer.from('blob '+raw.length+'\0')).update(raw).digest('hex'),record.gitBlob);
 const mod={exports:{}};cache.set(file,mod);
 const code=ts.transpileModule(record.text,{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{module:mod,exports:mod.exports,Buffer,TextEncoder,TextDecoder,crypto:webcrypto,URLSearchParams,console,
  require(spec){if(spec==='react')return React;if(spec==='react/jsx-runtime')return jsxObserver;if(spec==='node:crypto')return request(spec);const rel=spec.startsWith('@/')?spec.slice(2):path.posix.normalize(path.posix.join(path.posix.dirname(file),spec));const key=records.has(rel)?rel:records.has(rel+'.ts')?rel+'.ts':rel+'.tsx';return actual(key);},
 },{filename:'actual-e0-json/'+file});return mod.exports;
}
const contracts=actual('lib/consultation/contracts.ts'),replyContracts=actual('lib/consultation/replies.ts'),unit=actual('scripts/testing/consultation-tickets/unit-fixture.ts'),SessionCard=actual('components/consultation/SessionCard.tsx').default;
function text(node){if(node==null||typeof node==='boolean')return '';if(typeof node==='string'||typeof node==='number')return String(node);if(Array.isArray(node))return node.map(text).join('');return node.props?text(node.props.children):'';}
function render(advisor,version=1,seed=0){
 const source=unit.parent(advisor),sessionId=unit.uid(80+seed),keys=[unit.uid(91+seed),unit.uid(92+seed)],date='2026-10-31T00:00:00Z',privateNote='SYNTHETIC_COMPOSED_PRIVATE_OWNER_NOTE';
 const body={topic:'SYNTHETIC_COMPOSED_VERSIONED_SUMMARY',goal:'Software acceptance only',clientSummary:'SYNTHETIC_MEMBER_VISIBLE_SUMMARY',rationale:'Synthetic fixture only',limitations:'Not personal advice',reviewOn:'2099-12-31',basis:source.dossier.basis,researchVersionIds:[],evidence:[{label:'Owned synthetic financial declaration',url:null,asOf:'2026-10-29'}],actions:keys.map((actionKey,i)=>({actionKey,title:i?'SYNTHETIC_ADVISOR_ACTION':'SYNTHETIC_MEMBER_ACTION',dueOn:'2099-12-31',responsible:i?'advisor':'member'}))};
 source.sessions=[{id:sessionId,relationshipId:unit.R,sessionKey:unit.uid(81+seed),version,createdAt:date,actorId:unit.O,contentHash:'a'.repeat(64),body,approval:{actorId:unit.O,createdAt:date},state:'published'}];
 source.actions=[{id:unit.uid(101+seed),sessionId,actionKey:null,version:1,status:'question',text:'SYNTHETIC_VERSION_BOUND_MEMBER_QUESTION',actorId:unit.M,createdAt:date},{id:unit.uid(102+seed),sessionId,actionKey:keys[0],version:1,status:'doing',text:null,actorId:unit.M,createdAt:date},{id:unit.uid(103+seed),sessionId,actionKey:keys[1],version:1,status:'done',text:null,actorId:unit.O,createdAt:date}];
 source.notes=advisor?[{sessionId,note:privateNote}]:[];
 const parent=contracts.validateConsultationRead(source,{actorId:advisor?unit.O:unit.M,relationshipId:unit.R});
 const replies=replyContracts.validateReplyRead({contractVersion:'consultation-reply-read.v1',actorId:parent.actor.id,relationshipId:unit.R,sessionId,canReply:advisor,readOnlyReason:advisor?null:'not_owner',replies:[{id:unit.uid(104+seed),questionId:unit.uid(101+seed),sessionId,version:1,text:'SYNTHETIC_VERSION_BOUND_OWNER_REPLY',actorId:unit.O,createdAt:date,contentHash:'b'.repeat(64)}]},{actorId:parent.actor.id,relationshipId:unit.R,sessionId});
 hostNodes=[];
 const html=renderToStaticMarkup(React.createElement(SessionCard,{session:parent.sessions[0],latest:true,advisor,owner:advisor,revoked:false,basis:parent.dossier.basis,feedback:parent.actions,privateNote:advisor?privateNote:null,locked:false,onCommand:async()=>false,onEdit(){},onDirty(){},replies}));
 const roots=hostNodes.filter(n=>n.type==='article'&&n.props['aria-label']);assert.equal(roots.length,1);
 const summaries=hostNodes.filter(n=>n.type==='summary').map(n=>text(n.props.children));
 assert(html.includes('SYNTHETIC_MEMBER_VISIBLE_SUMMARY'));assert(html.includes('در حال انجام'));assert(html.includes('انجام‌شده طبق اعلام'));assert(html.includes('SYNTHETIC_VERSION_BOUND_MEMBER_QUESTION'));assert(html.includes('SYNTHETIC_VERSION_BOUND_OWNER_REPLY'));
 assert.equal(html.includes(privateNote),advisor);
 return {label:roots[0].props['aria-label'],summaries,html,parent};
}
function pageModel(cards){
 const clicks=[];
 const page={locator(selector){assert.equal(selector,'article[aria-label="جمع‌بندی نسخهٔ ۱"]');const scoped=cards.filter(c=>c.label==='جمع‌بندی نسخهٔ ۱');return {count:async()=>scoped.length,locator(child){assert(['details summary','summary'].includes(child));const nodes=scoped.flatMap(card=>card.summaries.map(label=>({card,label})));const locator=entries=>({count:async()=>entries.length,filter({hasText}){assert.equal(typeof hasText,'string');return locator(entries.filter(n=>n.label.includes(hasText)));},click:async()=>{if(entries.length!==1)throw Error('selector_ambiguous');clicks.push(entries[0]);}});return locator(nodes);}};}};
 return {page,clicks};
}
function line(candidate){const source=candidate?fixture.phase.candidate:fixture.phase.base;assert.equal(sha(Buffer.from(source)),candidate?manifest.phaseCandidateSha256:manifest.phaseBaseSha256);const selected=source.split('\n').filter(l=>l.includes("const card=page.locator('article[aria-label="));assert.equal(selected.length,1);return selected[0];}
const run=(candidate,model)=>vm.runInNewContext('(async()=>{'+line(candidate)+'})()',{page:model.page,check(v,code){if(!v)throw Error('p03_composition_'+code);}});
test('actual e0 parent contracts and React SessionCard SSR contain distinct evidence/private/history summaries',()=>{
 for(const advisor of [false,true]){const card=render(advisor);assert.equal(card.summaries.length,advisor?3:2);assert(card.summaries.includes('شاهدها و مبنای این نسخه'));assert.equal(card.summaries.filter(s=>s.includes('سابقهٔ مشاهده و اقدام‌ها (')).length,1);assert.equal(card.summaries.includes('یادداشت خصوصی مشاور'),advisor);}
 assert.equal(fixture.phase.candidate.replace(manifest.newLine,manifest.oldLine),fixture.phase.base);
});
test('old generic selector is ambiguous against both real SSR card variants, without private logs or native execution',async()=>{
 for(const advisor of [false,true]){const model=pageModel([render(advisor)]);await assert.rejects(run(false,model),/selector_ambiguous/);assert.equal(model.clicks.length,0);}
});
test('candidate opens only the intended history summary in the same session article despite another valid version card',async()=>{
 for(const advisor of [false,true]){const target=render(advisor),outside=render(advisor,2),model=pageModel([outside,target]);await run(true,model);assert.equal(model.clicks.length,1);assert.equal(model.clicks[0].card,target);assert.equal(model.clicks[0].label,'سابقهٔ مشاهده و اقدام‌ها (۳)');}
});
test('candidate rejects duplicate session articles rather than using first/force or weakening later history assertions',async()=>{
 const left=render(false),right=render(false,1,1000);
 const combined=contracts.validateConsultationRead({...left.parent,sessions:[...left.parent.sessions,...right.parent.sessions],actions:[...left.parent.actions,...right.parent.actions]},{actorId:unit.M,relationshipId:unit.R});
 assert.equal(combined.sessions.length,2);assert.notEqual(combined.sessions[0].id,combined.sessions[1].id);
 const model=pageModel([left,right]);await assert.rejects(run(true,model),/p03_composition_feedback_session_article_not_unique/);assert.equal(model.clicks.length,0);
 assert(!manifest.newLine.includes('.first('));assert(!manifest.newLine.includes('force:'));assert.equal(fixture.phase.candidate.replace(manifest.newLine,manifest.oldLine),fixture.phase.base);
});
