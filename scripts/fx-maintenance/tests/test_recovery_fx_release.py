import copy,importlib.util,json,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
script=Path(__file__).resolve().parents[1]/'operations/recovery_fx_status_release.py'
spec=importlib.util.spec_from_file_location('fx_release',script);r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
class Release(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);self.calls=[];self.fail_create=False;self.fail_start=False
  self.before={'Id':'original','Image':'base','Config':{'Image':'base','Env':['TZ=Asia/Tehran','FX_REQUIRE_AUTH=1'],'Cmd':['streamlit','run','app.py'],'Labels':{}},'HostConfig':{'Binds':['/opt/fx-dashboard/data-health:/data-health'],'RestartPolicy':{'Name':'unless-stopped'}},'Mounts':[{'Source':'/opt/fx-dashboard/data-health','Destination':'/data-health','RW':True}],'NetworkSettings':{'Networks':{'fx-dashboard-net':{'Aliases':['fx-dashboard']}}},'State':{'Running':True,'Health':{'Status':'healthy'}}}
  self.containers={'fx-dashboard':copy.deepcopy(self.before)};self.manifest=self.root/'manifest.json';self.manifest.write_text(json.dumps({'base_image_id':'base','candidate_image_id':'candidate'}));self.receipt=self.root/'receipt.json';self.receipt.write_text(json.dumps({'approved_by':'P00','mission':'RECOVERY-01','base_image_id':'base','candidate_image_id':'candidate'}));(self.root/'data').mkdir();(self.root/'data/agent-status.json').write_text('{"run_id":"prior"}')
 def tearDown(self):self.temp.cleanup()
 def api(self,method,path,body=None):
  self.calls.append((method,path,copy.deepcopy(body)))
  if path.startswith('/images/'):return {'Id':'candidate'}
  if path.startswith('/containers/create'):
   if self.fail_create:raise RuntimeError('simulated create failure')
   after=copy.deepcopy(self.before);after.update(Id='replacement',Image=body['Image'],Config={k:v for k,v in body.items() if k not in ['HostConfig','NetworkingConfig']},HostConfig=body['HostConfig']);after['State']['Running']=False;self.containers['fx-dashboard']=after;return {'Id':'replacement'}
  name=path.split('/')[2];operation=path.split('/')[3].split('?')[0]
  if name not in self.containers:raise RuntimeError('missing container')
  if operation=='json':return copy.deepcopy(self.containers[name])
  if operation=='rename':self.containers[path.split('name=')[1]]=self.containers.pop(name)
  elif operation=='stop':self.containers[name]['State']['Running']=False
  elif operation=='start':
   if self.fail_start and self.containers[name]['Image']=='candidate':raise RuntimeError('simulated start failure')
   self.containers[name]['State']['Running']=True
 def runmode(self,mode):
  argv=['release',mode,'--manifest',str(self.manifest)]
  if mode=='install':argv+=['--receipt',str(self.receipt)]
  with patch.object(r,'RELEASE_DIR',self.root/'release'),patch.object(r,'DATA_DIR',self.root/'data'),patch.object(r,'api',side_effect=self.api),patch.object(sys,'argv',argv),patch('builtins.print'):
   r.main()
 def test_prepare_backs_up_without_container_effect(self):
  self.runmode('prepare');self.assertTrue((self.root/'release/container-before.private.json').exists());self.assertTrue(all(m=='GET' for m,_,_ in self.calls));self.assertEqual((self.root/'release/metadata-before/agent-status.json').read_bytes(),(self.root/'data/agent-status.json').read_bytes())
 def test_install_preserves_env_network_mount_and_old_container(self):
  self.runmode('prepare');self.runmode('install');self.assertEqual(self.containers['fx-dashboard']['Config']['Env'],self.before['Config']['Env']);self.assertEqual(self.containers['fx-dashboard']['HostConfig'],self.before['HostConfig']);self.assertIn('fx-dashboard-recovery01-status-backup',self.containers)
  created=next(body for method,path,body in self.calls if path.startswith('/containers/create'));self.assertEqual(created['NetworkingConfig']['EndpointsConfig']['fx-dashboard-net']['Aliases'],['fx-dashboard'])
 def test_bad_receipt_blocks_before_mutation(self):
  self.runmode('prepare');self.calls=[];self.receipt.write_text('{}')
  with self.assertRaises(AssertionError):self.runmode('install')
  self.assertFalse(self.calls)
 def test_start_failure_restores_original_runtime(self):
  self.runmode('prepare');self.fail_start=True
  with self.assertRaises(RuntimeError):self.runmode('install')
  self.assertEqual(self.containers['fx-dashboard']['Image'],'base');self.assertTrue(self.containers['fx-dashboard']['State']['Running']);self.assertIn('fx-dashboard-recovery01-status-failed',self.containers)
 def test_create_failure_restores_name_before_original_stopped(self):
  self.runmode('prepare');self.fail_create=True
  with self.assertRaises(RuntimeError):self.runmode('install')
  self.assertEqual(self.containers['fx-dashboard']['Id'],'original');self.assertTrue(self.containers['fx-dashboard']['State']['Running'])
if __name__=='__main__':unittest.main()
