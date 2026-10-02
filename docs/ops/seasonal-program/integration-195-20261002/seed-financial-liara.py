"""Canonical market schema + explicitly synthetic statements, owned sandbox only."""
import pathlib,json,hashlib,subprocess,time,os
r=pathlib.Path('/opt/portfolio-accept195');os.umask(0o077)
def sql(text):
 p=subprocess.run(['docker','exec','-i','portfolio-accept195-db','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],input=text if isinstance(text,bytes) else text.encode(),capture_output=True)
 if p.returncode:
  (r/'private/financial-setup-error.log').write_bytes(p.stderr);raise RuntimeError('Synthetic financial setup failed; private diagnostics retained')
 return p.stdout.decode().strip()
p=json.loads((r/'market-schema-plan.json').read_text());raw=(r/'source'/p['file']).read_bytes();assert hashlib.sha256(raw).hexdigest()==p['sha256']
receipt=r/'financial-fixtures.json'
if receipt.exists():
 print('SYNTHETIC_FINANCIAL_FIXTURES_EXIST');raise SystemExit(0)
if sql("SELECT to_regclass('public.codal_reports') IS NULL")=='t':sql(raw)
sql("GRANT SELECT ON public.codal_reports TO anon,authenticated;GRANT SELECT ON public.symbol_history TO anon,authenticated,service_role;NOTIFY pgrst,'reload schema';")
def statement(revenue,gross,operating,net):return {'revenue':revenue,'cogs':60,'gross_profit':gross,'operating_profit':operating,'net_profit':net,'eps_rial':2}
rows=[]
for symbol,current,previous in [('SYNTHETIC195_CURRENT',None,30),('SYNTHETIC195_PRIOR',40,None)]:
 for months,date,greg,revenue,gross,net in [(3,'1404-03-31','2025-06-21',25,5,5),(6,'1404-06-31','2025-09-22',50,None,10),(9,'1404-09-30','2025-12-21',75,20,15),(12,'1404-12-29','2026-03-20',100,current,20)]:
  data={'symbol':symbol,'company_name':'SYNTHETIC ACCEPT195 ONLY','report_kind':'ن-۱۰','period_end':date,'period_months':months,'audited':False,'restated_prior':False,'unit':'میلیون ریال','capital':10,'standalone':{**statement(revenue,gross,net+5,net),'prior':statement(90,previous,20,18)}}
  rawmeta={'parser_version':3,'audited':False,'period_months':months,'period_end_jalali':date,'date_publish':'۱۴۰۵/۰۱/۱۰','time_publish':'۱۲:۰۰:۰۰','synthetic':True}
  escape=lambda t:t.replace("'","''")
  source='https://example.test/synthetic195/'+symbol+'/'+str(months)+'#pv3'
  sql("INSERT INTO public.codal_reports(symbol,company_name,report_kind,period_end,title,source_url,published_at,data,raw) VALUES('%s','SYNTHETIC ACCEPT195 ONLY','ن-۱۰','%s','SYNTHETIC ONLY %s months','%s','2026-04-01', '%s'::jsonb,'%s'::jsonb);"%(symbol,greg,months,source,escape(json.dumps(data)),escape(json.dumps(rawmeta))))
  rows.append({'symbol':symbol,'months':months,'gross':gross,'revenue':revenue,'net':net})
result={'environment':'portfolio-accept195','applicationSHA':p['sha'],'schema':{**p,'status':'APPLIED_NATIVE_SANDBOX_ONLY'},'at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'data':'SYNTHETIC ONLY; example.test sources; no issuer facts or provider requests','rows':rows,'rls':sql("SELECT relrowsecurity FROM pg_class WHERE oid='public.codal_reports'::regclass"),'insertedRows':int(sql("SELECT count(*) FROM public.codal_reports WHERE symbol LIKE 'SYNTHETIC195_%'"))}
receipt.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'status':'SYNTHETIC_FINANCIAL_FIXTURES_READY','rows':result['insertedRows'],'rls':result['rls']}))
