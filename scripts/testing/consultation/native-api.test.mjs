import assert from 'node:assert/strict';
import test from 'node:test';
import {runNative} from './native-api.mjs';
import * as contract from '../../../lib/consultation/contracts.ts';
import * as errors from '../../../lib/consultation/errors.ts';

const preview='https://portfolio-platform-synthetic-safariarash7777-4463s-projects.vercel.app';
const jwt=value=>'e30.'+Buffer.from(JSON.stringify(value)).toString('base64url')+'.synthetic';
function fixture(){
 const states=Object.fromEntries(['owner','a','b','admin'].map((actor,index)=>{
  const id=`00000000-0000-4000-8000-00000000000${index+1}`,marker='consultation-20261024-'+actor;
  return [actor,{id,marker,anonKey:jwt({role:'anon'}),session:{access_token:jwt({sub:id,role:'authenticated',exp:Date.now()/1000+3600}),refresh_token:'synthetic',user:{id,email:marker+'-a@example.invalid',app_metadata:{acceptance_run:marker}}}}];
 }));
 function createServerClient(_url,_key,options){let user;return {auth:{
  setSession:async({access_token})=>{user=Object.values(states).find(state=>state.session.access_token===access_token).session.user;options.cookies.setAll([{name:'sb-synthetic-auth-token',value:user.id}]);return {error:null};},
  getUser:async()=>({error:null,data:{user}}),
 } };}
 const read=init=>{
  const id=init.headers.Cookie?.split('=')[1];
  if(!id)return new Response(JSON.stringify(errors.consultationError('AUTH_REQUIRED')),{status:401});
  const actor=Object.entries(states).find(([,state])=>state.id===id)?.[0];
  return new Response(JSON.stringify({contractVersion:'consultation-read.v1',actor:{id,isAdvisor:actor==='owner',isOwner:actor==='owner'},advisors:[],relationships:[],selected:null,dossier:null,sessions:[],notes:[],events:[],actions:[]}),{status:200});
 };
 return {states,createServerClient,read};
}

test('durable intent failure prevents any POST',async()=>{
 const f=fixture();let posts=0;
 await assert.rejects(runNative({...f,preview,contract,errors,store:async name=>{if(name.startsWith('attempt-'))throw Error('synthetic_journal_failure');},transport:async(_url,init)=>{if(init.method==='POST'){posts++;throw Error('unexpected_post');}return f.read(init);}}),{message:'synthetic_journal_failure'});
 assert.equal(posts,0);
});

test('unknown POST stops once with exact validated intent durable before send',async()=>{
 const f=fixture();let posts=0;const journal=[];
 await assert.rejects(runNative({...f,preview,contract,errors,store:async(name,value)=>{journal.push({name,value});},transport:async(_url,init)=>{
  if(init.method==='POST'){
   posts++;const attempt=journal.find(row=>row.name.startsWith('attempt-'));
   assert.ok(attempt);assert.equal(attempt.value.body,init.body);
   assert.deepEqual(contract.validateConsultationRequest(JSON.parse(init.body)),attempt.value.request);
   throw Error('synthetic_timeout');
  }
  return f.read(init);
 }}),{message:'write_outcome_unknown_stop_no_replay'});
 assert.equal(posts,1);assert.equal(journal.filter(row=>row.name.startsWith('attempt-')).length,1);
 assert.equal(journal.some(row=>row.name==='result.json'),false);
});

test('production alias rejected before auth or transport',async()=>{
 await assert.rejects(runNative({preview:'https://portfolio-platform-fawn.vercel.app',states:{},createServerClient:()=>assert.fail('auth attempted'),transport:()=>assert.fail('network attempted')}),{message:'reviewed_preview_required'});
});
