"""Behavior tests with synthetic observations; never print financial values."""
import datetime as dt,json,math,random,sys,unittest
from pathlib import Path
P=Path(__file__).resolve().parents[1];sys.path.insert(0,str(P/'work'));sys.path.insert(0,str(P/'work/liara-deploy-20260929/fx-dashboard'))
import p02_fx_checks as c

class Contracts(unittest.TestCase):
    def setUp(self):self.rng=random.Random(302)
    def test_q3_is_not_annual_q4(self):
        value=self.rng.random();self.assertIsNone(c.annual_q4({(1404,3):value})[1404])
    def test_q4_conversion_is_invertible(self):
        value=self.rng.random();self.assertTrue(math.isclose(c.annual_q4({(1403,4):value})[1403]*10,value))
    def test_missing_growth_stays_null(self):
        self.assertIsNone(c.growth(None,self.rng.random(),1403,1402))
    def test_missing_year_cannot_be_skipped(self):
        self.assertIsNone(c.growth(self.rng.random(),self.rng.random(),1403,1401))
    def test_complete_cpi_mean_only(self):
        values={(1403,m):self.rng.random() for m in range(1,13)}
        self.assertIsNotNone(c.complete_month_mean(1403,values));values.pop((1403,7));self.assertIsNone(c.complete_month_mean(1403,values))
    def test_real_proxy_requires_same_month(self):
        self.assertIsNone(c.aligned_real_proxy(self.rng.random(),self.rng.random(),'1404/01','1404/02'))
    def test_decimal_ytm_not_already_percent(self):
        with self.assertRaises(ValueError):c.aligned_real_proxy(self.rng.random(),self.rng.random(),'1404/01','1404/01','decimal')
    def test_future_trade_cannot_be_current(self):
        self.assertEqual(c.quote_guard('2026-10-03','2026-12-01','2026-10-02T10:00:00+03:30'),'future_trade')
    def test_quote_stale_and_matured_are_distinct(self):
        self.assertEqual(c.quote_guard('2026-09-01','2026-12-01','2026-10-02T10:00:00+03:30'),'stale')
        self.assertEqual(c.quote_guard('2026-09-01','2026-10-01','2026-10-02T10:00:00+03:30'),'matured')
    def test_naive_time_rejected(self):
        with self.assertRaises(ValueError):c.aware('2026-10-02T10:00:00')
    def test_download_generation_never_approves_binding(self):
        mapping=json.loads((P.parents[1]/'docs/ops/fx-maintenance/evidence/fx-cbi-model-mapping.json').read_text(encoding='utf-8'))['series'][0]
        result=c.mapping_guard(mapping,'2026-10-02T10:00:00+03:30');self.assertEqual(result['publication_time_status'],'unknown');self.assertFalse(result['financial_model_approved'])
        altered=dict(mapping,report_generated_date_is_publication=True,model_write_enabled=True)
        self.assertEqual(c.mapping_guard(altered,'2026-10-02T10:00:00+03:30')['metadata_validation'],'FAIL')
    def test_current_annual_period_not_complete(self):
        mapping=json.loads((P.parents[1]/'docs/ops/fx-maintenance/evidence/fx-cbi-model-mapping.json').read_text(encoding='utf-8'))['series'][0]
        altered=dict(mapping,last_period='1405')
        self.assertIn('period_not_complete',c.mapping_guard(altered,'2026-10-02T10:00:00+03:30')['issues'])
    def test_conflicting_unit_and_base_are_rejected(self):
        mapping=json.loads((P.parents[1]/'docs/ops/fx-maintenance/evidence/fx-cbi-model-mapping.json').read_text(encoding='utf-8'))['series'][0]
        altered=dict(mapping,unit='unknown',base_year=None,source_sha256='not-a-checksum')
        issues=c.mapping_guard(altered,'2026-10-02T10:00:00+03:30')['issues']
        self.assertTrue({'unit_mismatch','base_year_mismatch','source_checksum_missing'}.issubset(issues))
    def test_future_publication_rejected(self):
        mapping=json.loads((P.parents[1]/'docs/ops/fx-maintenance/evidence/fx-cbi-model-mapping.json').read_text(encoding='utf-8'))['series'][0]
        altered=dict(mapping,publication_date='2026-10-03T12:00:00+03:30')
        self.assertIn('future_publication',c.mapping_guard(altered,'2026-10-02T10:00:00+03:30')['issues'])

if __name__=='__main__':unittest.main()
