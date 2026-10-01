import hashlib
import json
from pathlib import Path
import tempfile
import unittest
import pandas as pd
import fred_snapshot

class VerifiedVintageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.folder = self.root / 'official-documents/CPIAUCSL'
        self.folder.mkdir(parents=True)
        self.raw = b'observation_date,CPIAUCSL\n2020-01-01,100\n2020-02-01,.\n2020-03-01,102\n'
        self.checksum = hashlib.sha256(self.raw).hexdigest()
        self.document = self.folder / (self.checksum + '.csv')
        self.document.write_bytes(self.raw)
        (self.folder / 'latest.json').write_text(json.dumps({
            'status': 'validated_snapshot', 'sha256': self.checksum,
            'checked_at': pd.Timestamp.now(tz='UTC').isoformat(),
            'last_period': '2020-03-01', 'url': 'https://fred.stlouisfed.org/series/CPIAUCSL'}))
    def tearDown(self):
        self.temp.cleanup()
    def test_gap_is_retained_and_not_used_as_previous_month(self):
        series = fred_snapshot.load('CPIAUCSL', self.root)
        self.assertEqual(len(series), 3)
        self.assertTrue(pd.isna(series.iloc[1]))
        self.assertTrue(pd.isna(series.pct_change(fill_method=None).iloc[2]))
    def test_modified_document_is_rejected(self):
        self.document.write_bytes(self.raw + b'2020-04-01,999\n')
        self.assertTrue(fred_snapshot.load('CPIAUCSL', self.root).empty)

if __name__ == '__main__':
    unittest.main()
