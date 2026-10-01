import datetime as dt
from unittest.mock import patch
import unittest
import pandas as pd
import data_sources as ds

class CalendarSeparationTests(unittest.TestCase):
    def test_calendar_boundary_never_admits_incomplete_year(self):
        raw=pd.DataFrame({'year_shamsi':[1403,1404,1405,1406]})
        with patch.object(ds,'load_excel_data',return_value=raw):
            before=ds.load_historical_excel_data(today=dt.date(2026,3,20))
            after=ds.load_historical_excel_data(today=dt.date(2026,3,21))
        self.assertEqual(before['year_shamsi'].tolist(),[1403])
        self.assertEqual(after['year_shamsi'].tolist(),[1403,1404])
        self.assertEqual(after.attrs['excluded_assumption_years'],[1405,1406])
        self.assertEqual(len(raw),4)
    def test_assumptions_do_not_become_actual_when_clock_advances(self):
        raw=pd.DataFrame({'year_shamsi':[1403,1404,1405,1406]})
        with patch.object(ds,'load_excel_data',return_value=raw):
            history=ds.load_historical_excel_data(today=dt.date(2030,9,30))
        self.assertEqual(history['year_shamsi'].tolist(),[1403,1404])

if __name__=='__main__':unittest.main()
