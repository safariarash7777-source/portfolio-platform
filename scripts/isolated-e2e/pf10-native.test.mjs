import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyEnvironment,verifyContainer,verifyIngress,verifyRestArtifact,verifyDatabaseMountInfo,restArtifact,allowedURL,images,origin} from './pf10-native.mjs';
const state={id:'synthetic-run',network:'synthetic-internal',edge:'synthetic-edge',imageIds:{db:'sha256:synthetic',node:'sha256:synthetic-node'}};
const container=()=>({Config:{Labels:{'pf10.native-lab':state.id}},State:{Running:true},Image:state.imageIds.db,Mounts:[{Type:'tmpfs',Destination:'/var/lib/postgresql/data'}],NetworkSettings:{Networks:{[state.network]:{}}},HostConfig:{PortBindings:{}}});
test('PF10 real Auth harness cannot launch on Windows or outside existing Linux CI',()=>{
 const env={CI:'true',GITHUB_ACTIONS:'true',RUNNER_TEMP:'/tmp/synthetic-runner'};
 assert.doesNotThrow(()=>verifyEnvironment(env,'linux'));
 for(const [values,platform] of [[env,'win32'],[{...env,CI:'false'},'linux'],[{...env,GITHUB_ACTIONS:undefined},'linux'],[{...env,RUNNER_TEMP:'relative'},'linux']])assert.throws(()=>verifyEnvironment(values,platform));
});
test('PF10 real Auth SQL and cleanup require owned image/internal network/no service port/no bind/tmpfs',()=>{
 assert.doesNotThrow(()=>verifyContainer(state,container(),'db'));
 const legacyTmpfs=container();legacyTmpfs.Mounts=[];legacyTmpfs.HostConfig.Tmpfs={'/var/lib/postgresql/data':''};assert.doesNotThrow(()=>verifyContainer(state,legacyTmpfs,'db'));
 const wrongTmpfs=container();wrongTmpfs.Mounts=[];wrongTmpfs.HostConfig.Tmpfs={'/tmp':''};assert.throws(()=>verifyContainer(state,wrongTmpfs,'db'));
 for(const change of [c=>{c.Config.Labels={};},c=>{c.Image='another';},c=>{c.State.Running=false;},c=>{c.Mounts.push({Type:'bind'});},c=>{c.Mounts=[];},c=>{c.NetworkSettings.Networks.bridge={};},c=>{c.HostConfig.PortBindings={'5432/tcp':[{HostIp:'127.0.0.1'}]};}]){const c=container();change(c);assert.throws(()=>verifyContainer(state,c,'db'));}
});
test('PF10 gateway requires exact loopback ingress and two owned networks',()=>{
 const fixture=()=>({...container(),Image:state.imageIds.node,Mounts:[],NetworkSettings:{Networks:{[state.network]:{},[state.edge]:{}}},HostConfig:{PortBindings:{'32190/tcp':[{HostIp:'127.0.0.1',HostPort:'32190'}]}}});
 assert.doesNotThrow(()=>verifyIngress(state,fixture()));
 for(const change of [c=>{c.Config.Labels={};},c=>{c.HostConfig.PortBindings['32190/tcp'][0].HostIp='0.0.0.0';},c=>{c.NetworkSettings.Networks.bridge={};},c=>{c.Mounts.push({Type:'bind'});}]){const c=fixture();change(c);assert.throws(()=>verifyIngress(state,c));}
});
test('PF10 harness HTTP accepts only fixed synthetic localhost and bounded route families',()=>{
 assert.equal(origin,'http://localhost:32189');
 for(const path of ['/auth/v1/user','/rest/v1/rpc/load_member_debt_payments','/api/personal-finance/debt-payments?clientToken=synthetic'])assert.equal(allowedURL(origin+path),origin+path);
 for(const url of ['https://portfolio-platform-fawn.vercel.app/api/personal-finance/debt-payments','http://127.0.0.1:32189/auth/v1/user',origin+'/api/payment',origin+'/api/cron/research',origin+'/api/admin/intelligence/workbooks','http://user@localhost:32189/auth/v1/user'])assert.throws(()=>allowedURL(url));
});
test('PF10 pins immutable source identities including approved official REST, with no tag fallback',()=>{
 assert.equal(Object.keys(images).length,4);assert.ok(Object.values(images).every(image=>/^[a-z0-9./-]+@sha256:[a-f0-9]{64}$/.test(image)));
});
test('PF10 official REST mapping requires exact amd64 manifest, config and version readback',()=>{
 const details={Os:'linux',Architecture:'amd64',Id:restArtifact.config},index={manifests:[{digest:restArtifact.manifest,platform:{os:'linux',architecture:'amd64'}}]};
 assert.doesNotThrow(()=>verifyRestArtifact(details,index,'PostgREST 14.17 (synthetic readback)'));
 for(const [d,i,v] of [[{...details,Id:restArtifact.legacy},index,'PostgREST 14.17'],[{...details,Architecture:'arm64'},index,'PostgREST 14.17'],[details,{manifests:[]},'PostgREST 14.17'],[details,index,'PostgREST 14.18']])assert.throws(()=>verifyRestArtifact(d,i,v));
});
test('PF10 SQL transport also requires actual kernel tmpfs mount, never a volume or metadata-only claim',()=>{
 assert.doesNotThrow(()=>verifyDatabaseMountInfo('101 99 0:20 / /var/lib/postgresql/data rw,nosuid - tmpfs tmpfs rw'));
 for(const text of ['', '101 99 8:1 / /var/lib/postgresql/data rw - ext4 /dev/sda1 rw', '101 99 0:20 / /tmp rw - tmpfs tmpfs rw'])assert.throws(()=>verifyDatabaseMountInfo(text));
});

import {nativeAuthProfile,allowedProfileURL,runNativeAuthProfile} from './native-auth-runtime.mjs';
import {gatewayProfile} from './native-auth-gateway.mjs';
test('Shared runtime has only two immutable profiles; application gateway and HTTP policy agree',()=>{
 for(const profile of ['pf10','p09']){
  const config=nativeAuthProfile(profile),gateway=gatewayProfile(profile);
  assert.ok(Object.isFrozen(config));
  assert.deepEqual(gateway.routes,config.routes);assert.equal(gateway.identityPath,config.identityPath);
  for(const path of [...config.routes,config.identityPath,'/auth/v1/user','/rest/v1/'])assert.equal(allowedProfileURL(profile,origin+path),origin+path);
  for(const path of ['/api/cron/research','/api/payments','/api/admin/provider',...(profile==='pf10'?nativeAuthProfile('p09'):nativeAuthProfile('pf10')).routes])assert.throws(()=>allowedProfileURL(profile,origin+path));
  assert.throws(()=>config.sql.push('sql/arbitrary.sql'));assert.throws(()=>{config.actors.a='service_role';});
 }
 for(const value of ['other','__proto__','constructor',{target:origin},undefined]){assert.throws(()=>nativeAuthProfile(value));assert.throws(()=>gatewayProfile(value));}
});
test('Shared runner fails before provisioning for unknown profiles and arbitrary runtime options',async()=>{
 await assert.rejects(runNativeAuthProfile({profile:'pf10',sql:['arbitrary.sql']},()=>{}),/unknown_profile/);
 await assert.rejects(runNativeAuthProfile('pf10',{target:origin}),/scenario_required/);
});
