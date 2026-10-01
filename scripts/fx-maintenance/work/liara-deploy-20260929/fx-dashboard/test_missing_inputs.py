import unittest
import numpy as np
import pandas as pd
import models

class MissingEconomicInputs(unittest.TestCase):
    def test_missing_inflation_stops_cumulative_ppp(self):
        frame=pd.DataFrame({'year_shamsi':[1399,1400,1401],'infl_cbi':[1.,2.,3.],'usa_infl':[1.,np.nan,1.]})
        actual=models.ppp_series(frame,1399,100.)
        self.assertTrue(pd.isna(actual.loc[1400]))
        self.assertTrue(pd.isna(actual.loc[1401]))

    def test_missing_money_input_does_not_repeat_last_value(self):
        frame=pd.DataFrame({'year_shamsi':[1399,1400,1401],'m2_growth':[1.,np.nan,2.],'usa_m2_growth':[1.,1.,1.],'gdp_growth':[1.,1.,1.],'usa_gdp_growth':[1.,1.,1.]})
        actual=models.monetary_series(frame,1399,100.)
        self.assertTrue(pd.isna(actual.loc[1400]))
        self.assertTrue(pd.isna(actual.loc[1401]))

if __name__=='__main__':unittest.main()
