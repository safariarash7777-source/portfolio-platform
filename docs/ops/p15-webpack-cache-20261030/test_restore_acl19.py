from pathlib import Path
import ast,copy,hashlib,json,re,unittest

work=Path(__file__).resolve().parent
helper=(work.parent/'recovery-01/p01-scripts/liara-native-backup-restore.py').read_bytes()
assert hashlib.sha256(helper).hexdigest()=='1f1454f9aea632609c002335e628c2f463f96f28cb131bc95c2ff6f2bda2a9f2'
tree=ast.parse(helper)
selected=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ['normalize_inventory','bounded_acl_plan','attest_acl_target']]
env={'re':re};exec(compile(ast.Module(body=selected,type_ignores=[]),'<pinned-helper-pure>','exec'),env)
module=work/'restore-acl19-plan.py'
planenv={};exec(compile(module.read_text(encoding='utf-8'),str(module),'exec'),planenv)
fixture=json.loads((work/'restore-acl19-fixture.json').read_text(encoding='utf-8'))
source=set(fixture['sourceOnly']);target=set(fixture['targetOnly'])
ps=fixture['privateSource'];pt=fixture['privateTarget']
def plan(s=source,t=target,a=ps,b=pt):return planenv['observed_plan'](env['bounded_acl_plan'],s,t,a,b)
class GuardTests(unittest.TestCase):
 def test_exact_observed_pairs(self):
  sql,names=plan();self.assertEqual(len(names),19);self.assertEqual(sql.count('BEGIN;'),1);self.assertEqual(sql.count('COMMIT;'),1)
  self.assertNotIn('ALTER TABLE',sql);self.assertNotIn('DROP ',sql);self.assertNotIn('DELETE ',sql)
 def test_unknown_core_object(self):
  with self.assertRaises(RuntimeError):plan(source|{'table|public.extra|different'},target|{'table|public.extra|other'})
 def test_changed_row_security(self):
  s={x.replace('consultation_actions|r;owner=postgres;rls=t','consultation_actions|r;owner=postgres;rls=f') for x in source}
  with self.assertRaises(RuntimeError):plan(s)
 def test_changed_grantor(self):
  t={x.replace('postgres=rwU/postgres','postgres=rwU/other_role') for x in target}
  with self.assertRaises(RuntimeError):plan(source,t)
 def test_partial_or_previously_applied_plan(self):
  with self.assertRaises(RuntimeError):plan(source,source)
 def test_private_function_definition_drift(self):
  b=copy.deepcopy(pt);b['functions'][0]['definitionMd5']='0'*32
  with self.assertRaises(RuntimeError):plan(b=b)
 def test_private_effective_privilege_drift(self):
  b=copy.deepcopy(pt);b['functions'][0]['effectiveRoleExecute']['anon']=not b['functions'][0]['effectiveRoleExecute']['anon']
  with self.assertRaises(RuntimeError):plan(b=b)
 def test_private_schema_owner_drift(self):
  b=copy.deepcopy(pt);b['schemas'][0]['owner']='other_role'
  with self.assertRaises(RuntimeError):plan(b=b)
 def test_private_default_acl_drift(self):
  b=copy.deepcopy(pt);b['defaultAcls'].append({'extra':'grant'})
  with self.assertRaises(RuntimeError):plan(b=b)
 def test_private_relation_drift(self):
  b=copy.deepcopy(pt);b['relations']+=1
  with self.assertRaises(RuntimeError):plan(b=b)
 def test_private_acl_extra_grantee(self):
  b=copy.deepcopy(pt);next(x for x in b['schemas'] if x['name']=='consultation_private')['acl']=['authenticated=U/postgres']
  with self.assertRaises(RuntimeError):plan(b=b)
 def test_live_source_append_only_two_observed_counters(self):
  a={'rowcount|public.ir_market_history|13636','rowcount|public.site_agent_runs|5388','policy|same|strict'}
  b={'rowcount|public.ir_market_history|13638','rowcount|public.site_agent_runs|5394','policy|same|strict'}
  self.assertEqual(len(planenv['live_source_catalog_check'](a,b)),2)
 def test_live_source_decrease_rejected(self):
  a={'rowcount|public.ir_market_history|10','rowcount|public.site_agent_runs|20'}
  b={'rowcount|public.ir_market_history|9','rowcount|public.site_agent_runs|20'}
  with self.assertRaises(RuntimeError):planenv['live_source_catalog_check'](a,b)
 def test_live_source_other_rowcount_rejected(self):
  a={'rowcount|public.ir_market_history|10','rowcount|public.site_agent_runs|20','rowcount|public.other|1'}
  b=(a-{'rowcount|public.other|1'})|{'rowcount|public.other|2'}
  with self.assertRaises(RuntimeError):planenv['live_source_catalog_check'](a,b)
 def test_live_source_acl_drift_rejected(self):
  a={'rowcount|public.ir_market_history|10','rowcount|public.site_agent_runs|20','table|public.example|acl=owner'}
  b=(a-{'table|public.example|acl=owner'})|{'table|public.example|acl=public'}
  with self.assertRaises(RuntimeError):planenv['live_source_catalog_check'](a,b)
 def test_live_source_identity_drift_rejected(self):
  a={'rowcount|public.ir_market_history|10','rowcount|public.site_agent_runs|20','identity-ids|auth.users|a'}
  b=(a-{'identity-ids|auth.users|a'})|{'identity-ids|auth.users|b'}
  with self.assertRaises(RuntimeError):planenv['live_source_catalog_check'](a,b)
 def test_live_source_missing_counter_rejected(self):
  a={'rowcount|public.ir_market_history|10','rowcount|public.site_agent_runs|20'}
  with self.assertRaises(RuntimeError):planenv['live_source_catalog_check'](a,{'rowcount|public.ir_market_history|10'})
 def test_attestation_rejects_primary_network_ports_and_rw(self):
  name='portfolio-recovery-proof-20261030t215307z';image='sha256:expected';root='/owned'
  state={'Name':'/'+name,'Image':image,'State':{'Running':True},'HostConfig':{'NetworkMode':'none','PortBindings':None},'Config':{'Labels':{'portfolio.recovery':'isolated-proof'}},'Mounts':[{'Destination':'/recovery','Source':root,'RW':False,'Type':'bind'}]}
  env['attest_acl_target'](state,'portfolio-stage-db-1',name,image,root)
  variants=[]
  for key,value in [('NetworkMode','bridge'),('PortBindings',{'5432/tcp':[]})]:
   b=copy.deepcopy(state);b['HostConfig'][key]=value;variants.append(b)
  b=copy.deepcopy(state);b['Mounts'][0]['RW']=True;variants.append(b)
  b=copy.deepcopy(state);b['Image']='other';variants.append(b)
  b=copy.deepcopy(state);b['Config']['Labels']={};variants.append(b)
  b=copy.deepcopy(state);b['Name']='/portfolio-stage-db-1';variants.append(b)
  for b in variants:
   with self.assertRaises(RuntimeError):env['attest_acl_target'](b,'portfolio-stage-db-1',name,image,root)
if __name__=='__main__':unittest.main(verbosity=2)
