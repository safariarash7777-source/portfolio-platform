"""Offline model binding and YTM failure tests; no observations in output."""
import ast,datetime as dt,hashlib,json,os,shutil,subprocess,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch,Mock
import numpy as np,pandas as pd,requests
P=Path(__file__).resolve().parents[1];W=P/'work';D=W/'liara-deploy-20260929/fx-dashboard'
sys.path.insert(0,str(W));sys.path.insert(0,str(D))
import data_sources as ds,models as m,ifb_bonds as y,cbi_model_input as c,validate_cbi_mapping as v
FIX=Path(os.environ['FX_BINDING_FIXTURES']).resolve()
class Binding(unittest.TestCase):
 def frame(self):return ds.load_cpi_monthly(source='cbi_official',health_dir=FIX/'health')
 def anchors(self):
  rng=np.random.default_rng(302);return pd.Series(rng.uniform(10,20,5),index=range(1400,1405)),pd.Series(rng.uniform(1,3,5),index=range(1400,1405))
 def test_six_source_contracts_and_CPI_aggregation(self):
  entries=json.loads((FIX/'health/cbi-tsd-last-valid.json').read_text(encoding='utf-8'))['series'];rows={}
  self.assertEqual(len(entries),6)
  for e in entries:
   meta,data=v.read(e,health=FIX/'health');rows[meta['key']]=data
   self.assertIsNone(meta['publication_date']);self.assertFalse(meta['model_write_enabled'])
  monthly=dict((k,val) for k,val,_,_ in rows['CBI_CPI_monthly'])
  for key,value,_,_ in rows['CBI_CPI_annual']:
   self.assertTrue(np.isclose(np.mean([monthly[(key[0],mm)] for mm in range(1,13)]),value,atol=.15,rtol=0))
 def test_official_identity_and_direct_source_match(self):
  f=self.frame();self.assertEqual(len(f),60);self.assertEqual(f.attrs['base_year'],1400);self.assertFalse(f.attrs['legacy_model_write_enabled'])
  entries=json.loads((FIX/'health/cbi-tsd-last-valid.json').read_text(encoding='utf-8'))['series']
  e=next(e for e in entries if e['frequency']=='ماهانه');_,rows=v.read(e,health=FIX/'health')
  self.assertTrue(np.allclose(f['cpi'],[r[1] for r in rows]));self.assertTrue(f.index.is_unique)
 def test_official_corruption_no_fallback_and_cache_invalidation(self):
  with tempfile.TemporaryDirectory() as td:
   health=Path(td)/'health';shutil.copytree(FIX/'health',health);old=c.snapshot_version(health)
   entry=next(e for e in json.loads((health/'cbi-tsd-last-valid.json').read_text(encoding='utf-8'))['series'] if e['frequency']=='ماهانه')
   file=health/'cbi-tsd'/entry['id']/(entry['sha256']+'.xlsx');file.write_bytes(b'corrupt')
   self.assertNotEqual(old,c.snapshot_version(health));f=ds.load_cpi_monthly(source='cbi_official',health_dir=health)
   self.assertTrue(f.empty);self.assertFalse(f.attrs['validated_readonly_input']);self.assertEqual(f.attrs['source_kind'],'cbi_official')
 def test_sample_uses_existing_model_and_metadata(self):
  f=self.frame();a,us=self.anchors();out,method=m.monthly_fundamental(a,us,pd.Series(f.index),cpi_frame=f,annual_anchor_verified=True,sample_only=True)
  self.assertEqual(method,'cbi_official_sample');self.assertEqual(len(out),60);self.assertTrue(np.isfinite(out).all());self.assertTrue(out.attrs['sample_only']);self.assertEqual(out.attrs['source_sha256'],f.attrs['source_sha256'])
 def test_unapproved_annual_anchor_blocks(self):
  f=self.frame();a,us=self.anchors();out,method=m.monthly_fundamental(a,us,pd.Series(f.index),cpi_frame=f)
  self.assertTrue(out.empty);self.assertEqual(method,'blocked_annual_anchor_contract')
 def test_gap_cannot_be_interpolated(self):
  f=self.frame();f.iloc[20,0]=np.nan;a,us=self.anchors();out,method=m.monthly_fundamental(a,us,pd.Series(f.index),cpi_frame=f,annual_anchor_verified=True)
  self.assertTrue(out.empty);self.assertEqual(method,'blocked_incomplete_official_CPI')
 def test_legacy_model_numerical_parity(self):
  tree=P.parents[1];raw=subprocess.check_output(['git','-c','safe.directory='+str(tree),'-C',str(tree),'show','27b39902733c7e8c15fd02c9aa3d1b4c79342e28:scripts/fx-maintenance/work/liara-deploy-20260929/fx-dashboard/app.py']).decode('utf-8')
  fn=next(n for n in ast.parse(raw).body if isinstance(n,ast.FunctionDef) and n.name=='monthly_fundamental');fn.decorator_list=[]
  ns={'np':np,'pd':pd,'ds':ds};exec(compile(ast.fix_missing_locations(ast.Module(body=[fn],type_ignores=[])),'baseline','exec'),ns)
  f=self.frame();f.attrs={};a,us=self.anchors()
  with patch.object(ds,'load_cpi_monthly',return_value=f):
   old,oldmethod=ns['monthly_fundamental'](a,us,pd.Series(f.index));new,newmethod=m.monthly_fundamental(a,us,pd.Series(f.index))
  self.assertEqual(oldmethod,newmethod);self.assertTrue(old.equals(new))
 def test_blocked_UI_skips_dependent_PSY_without_stopping_other_tabs(self):
  tree=ast.parse((D/'app.py').read_text(encoding='utf-8'));guard=next(n for n in ast.walk(tree) if isinstance(n,ast.If) and isinstance(n.test,ast.Call) and isinstance(n.test.func,ast.Attribute) and n.test.func.attr=='startswith' and any(isinstance(a,ast.Constant) and a.value=='blocked_' for a in n.test.args))
  stub=Mock();exec(compile(ast.fix_missing_locations(ast.Module(body=[guard],type_ignores=[])),'ui_guard','exec'),{'fund_how':'blocked_annual_anchor_contract','st':stub})
  stub.warning.assert_called_once();stub.stop.assert_not_called()
class YTM(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.data=Path(self.temp.name);self.patch=patch.object(y,'DATA_DIR',self.data);self.patch.start();folder=self.data/'ifb-treasury';folder.mkdir()
  today=dt.datetime.now(dt.timezone(dt.timedelta(hours=3,minutes=30))).date();self.today=today
  body={'records':[{'trade_date':(today-dt.timedelta(days=8)).isoformat(),'maturity_date':(today+dt.timedelta(days=30)).isoformat(),'published_ytm_percent':float(np.random.default_rng(304).uniform(20,30))}],'derived_indicator':{'historical_benchmark_replaced':False}}
  raw=json.dumps(body).encode();sha=hashlib.sha256(raw).hexdigest();(folder/(sha+'.json')).write_bytes(raw)
  self.pointer=folder/'latest.json';self.pointer.write_text(json.dumps({'snapshot_file':sha+'.json','snapshot_sha256':sha,'last_trade_date':body['records'][0]['trade_date']}));self.before=self.pointer.read_bytes()
 def tearDown(self):self.patch.stop();self.temp.cleanup()
 def test_stale_archive_display_only(self):
  with self.assertRaises(AssertionError):y.load_current()
  meta,body=y.load_display();self.assertTrue(meta['stale']);self.assertFalse(meta['eligible_for_current']);self.assertEqual(meta['age_days'],8);self.assertEqual(self.before,self.pointer.read_bytes());self.assertTrue(body['records'])
 def test_corrupt_archive_rejected(self):
  meta=json.loads(self.before);(self.pointer.parent/meta['snapshot_file']).write_bytes(b'broken')
  with self.assertRaises(AssertionError):y.load_display()
 def test_retry_bounded_and_snapshot_retained(self):
  session=Mock();session.get.side_effect=requests.Timeout()
  with patch.object(y.requests,'Session',return_value=session),patch.object(y.time,'sleep'):
   result=y.collect()
  self.assertEqual(session.get.call_count,2);self.assertEqual(result['status'],'official_bond_source_check_failed');self.assertEqual(self.before,self.pointer.read_bytes())
 def test_stream_deadline_retains_snapshot(self):
  session=Mock();response=Mock();response.iter_content.return_value=iter([b'chunk']);session.get.return_value=response
  with patch.object(y.requests,'Session',return_value=session),patch.object(y.time,'monotonic',side_effect=[0,0,61,62]),patch.object(y.time,'sleep'):
   result=y.collect()
  self.assertEqual(result['status'],'official_bond_source_check_failed');self.assertEqual(self.before,self.pointer.read_bytes());response.close.assert_called()
 def test_size_cap_retains_snapshot(self):
  session=Mock();response=Mock();response.iter_content.return_value=iter([bytes(8*1024*1024+1)]);session.get.return_value=response
  with patch.object(y.requests,'Session',return_value=session):result=y.collect()
  self.assertEqual(result['status'],'official_bond_source_check_failed');self.assertEqual(session.get.call_count,1);self.assertEqual(self.before,self.pointer.read_bytes())
 def test_schema_failure_retains_snapshot(self):
  session=Mock();response=Mock();response.iter_content.return_value=iter([b'<html>changed</html>']);session.get.return_value=response
  with patch.object(y.requests,'Session',return_value=session):result=y.collect()
  self.assertEqual(result['status'],'official_bond_source_check_failed');self.assertEqual(self.before,self.pointer.read_bytes())
class HermesStatus(unittest.TestCase):
 def test_five_day_overdue_not_healthy(self):
  from maintenance_status import view
  now=dt.datetime.now(dt.timezone.utc);finished=now-dt.timedelta(days=6)
  report={'finished_at':finished.isoformat(),'updated_at':finished.isoformat(),'source_health':'checked','data_completeness':'incomplete','cadence_days':5}
  state=view(report,b'{}',now=now)
  self.assertEqual(state['execution'],'completed');self.assertEqual(state['source_health'],'stale_unverified');self.assertEqual(state['data_completeness'],'incomplete');self.assertTrue(state['overdue']);self.assertEqual(dt.datetime.fromisoformat(state['next_run_at']),finished+dt.timedelta(days=5))
 def test_publication_requires_same_run_and_bytes(self):
  from maintenance_status import view
  now=dt.datetime.now(dt.timezone.utc);report={'run_id':'sample','finished_at':now.isoformat(),'updated_at':now.isoformat()};raw=json.dumps(report).encode()
  receipt={'status':'verified','run_id':'sample','sha256':hashlib.sha256(raw).hexdigest()}
  self.assertTrue(view(report,raw,receipt,now)['publication_verified']);receipt['run_id']='older'
  self.assertFalse(view(report,raw,receipt,now)['publication_verified'])

if __name__=='__main__':unittest.main()
