import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AuthSessionMissingError} from '@supabase/supabase-js';
import {memberNotifications} from './http';
import {notificationSessionStatus} from './session-status';
import {publicationLink} from './bridge';
import {normalizeReturnPath} from '../../components/account/returnPath';
import {planChannelAdmission,type AdmissionInput} from './channel-plan';
const version='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',cohort='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
for(const [name,user,error,status] of [
 ['healthy guest',null,null,401],['missing native session',null,new AuthSessionMissingError(),401],
 ['expired SDK credentials',null,{status:401},401],['rejected SDK credentials',null,{status:403},401],
 ['returned service outage',null,{status:503},503],['unknown transport error',null,new Error('unavailable'),503],
 ['stale user with returned outage',{id:'stale'},{status:500},503],['healthy native user',{id:'canonical'},null,200],
] as const)test('NEXT09 matches Auth190 categories: '+name,async()=>{
 assert.equal(notificationSessionStatus(user,error),status);let calls=0;
 const gateway={authenticate:async()=>({user,error}),rpc:async()=>{calls++;return {data:[],error:null};}};
 const r=await memberNotifications(new Request('https://example.invalid/api/notifications'),async()=>gateway,true);
 assert.equal(r.status,status);assert.equal(calls,status===200?1:0);assert.match(r.headers.get('cache-control')!,/no-store/);
});
test('cohort+version deep link survives authenticated local return path; no read receipt implied',()=>{
 const path=`/publications/${version}?cohort=${cohort}`;const link=new URL(publicationLink('https://example.invalid',path));
 assert.equal(link.pathname,'/login');assert.equal(link.searchParams.get('next'),path);assert.equal(normalizeReturnPath(link.searchParams.get('next')),path);
 assert.equal(link.searchParams.has('hasBeenRead'),false);assert.equal(link.searchParams.has('acknowledged'),false);
 for(const forged of [path+'&next=//evil.invalid',path+'&cohort='+cohort,path+'#fragment',path.replace(cohort,'not-a-uuid'),'/publications/'+version+'?read=true','//evil.invalid'])assert.throws(()=>publicationLink('https://example.invalid',forged));
 assert.ok(publicationLink('https://example.invalid','/publications/'+version));assert.ok(publicationLink('https://example.invalid','/notifications'));
});
const allowed:AdmissionInput={now:100000,observedAt:99999,operationKey:'synthetic-request-1',alreadyRecorded:false,ingressVerified:true,identityVerified:true,linkCurrent:true,scopeBound:true,canonicalAccess:'allowed',channelConsent:true,botAdmin:true,canInviteUsers:true,memberState:'pending'};
for(const [name,patch,action] of [
 ['verified pending join',{},'approve'],['forged ingress',{ingressVerified:false},'hold'],['unproven identity',{identityVerified:false},'hold'],
 ['unlink or changed link epoch',{linkCurrent:false},'hold'],['wrong configured channel/cohort binding',{scopeBound:false},'hold'],['Auth/ledger outage',{canonicalAccess:'unavailable'},'hold'],
 ['expired decision snapshot',{observedAt:1},'hold'],['future snapshot',{observedAt:100001},'hold'],['replayed receipt',{alreadyRecorded:true},'duplicate'],
 ['missing admin',{botAdmin:false},'hold'],['missing invite right',{canInviteUsers:false},'hold'],
 ['notification opt-in does not provide channel consent',{channelConsent:false},'decline'],['expired/revoked canonical entitlement',{canonicalAccess:'denied'},'decline'],
 ['unknown member observation',{memberState:'unknown'},'hold'],['membership alone does not renew entitlement',{memberState:'member',canonicalAccess:'denied'},'review_removal'],
 ['existing eligible member',{memberState:'member'},'already_member'],['no actual join request',{memberState:'absent'},'hold'],
 ['invalid clock',{now:NaN},'hold'],['denied absent member',{memberState:'absent',canonicalAccess:'denied'},'hold'],['denied unknown member',{memberState:'unknown',canonicalAccess:'denied'},'hold'],
] as const)test('draft channel adapter mock: '+name,()=>assert.equal(planChannelAdmission({...allowed,...patch}).action,action));
test('mock port rechecks revocation immediately before approval and records no API acceptance/read',()=>{
 const first=planChannelAdmission(allowed);assert.equal(first.action,'approve');
 const fresh=planChannelAdmission({...allowed,canonicalAccess:'denied'});const calls:string[]=[];
 if(fresh.action==='approve')calls.push('mock-approve');assert.deepEqual(calls,[]);
 assert.equal('messageId' in fresh,false);assert.equal('readAt' in fresh,false);
});
