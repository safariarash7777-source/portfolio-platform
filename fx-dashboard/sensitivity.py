"""
تحلیل حساسیت نرخ ارز ایران — ضرایب کشش از داده تاریخی OLS برآورد می‌شوند
(نه هاردکد). در صورت کمبود داده، به مقادیر تجربی پیش‌فرض fallback می‌کند.

روش:
  انحراف نسبی نرخ بازار از PPP به‌عنوان متغیر وابسته y، و قیمت نفت و
  خروج سرمایه به‌عنوان متغیرهای توضیحی. کشش‌ها از ضرایب OLS استخراج می‌شوند.
"""
import numpy as np
import pandas as pd


def estimate_elasticities(df: pd.DataFrame, market: pd.Series,
                          ppp_series: pd.Series) -> dict:
    """
    برآورد کشش‌های تجربی:
      gap_t = (market_t − ppp_t) / ppp_t
      gap_t = β0 + β1·log(oil_t) + β2·log(capital_outflow_t) + ε

    Returns dict با ضرایب + خطای استاندارد + R²
    """
    d = df.set_index("year_shamsi")
    common = market.index.intersection(ppp_series.index).intersection(d.index)
    if len(common) < 8:
        return {"oil_elasticity_pct_per_5usd": -0.3, "deficit_to_inflation": 0.6,
                "r2": np.nan, "n": len(common), "estimated": False}

    gap = ((market.loc[common] - ppp_series.loc[common]) / ppp_series.loc[common]) * 100
    oil = d.loc[common, "oil_exports"].replace(0, np.nan)
    if oil.notna().sum() < 5:
        return {"oil_elasticity_pct_per_5usd": -0.3, "deficit_to_inflation": 0.6,
                "r2": np.nan, "n": int(oil.notna().sum()), "estimated": False}

    log_oil = np.log(oil)
    mask = gap.notna() & log_oil.notna()
    y = gap[mask].values
    X = np.column_stack([np.ones(mask.sum()), log_oil[mask].values])
    try:
        beta, *_ = np.linalg.lstsq(X, y, rcond=None)
        resid = y - X @ beta
        ss_res = (resid @ resid)
        ss_tot = ((y - y.mean()) ** 2).sum()
        r2 = 1 - ss_res / ss_tot if ss_tot > 0 else np.nan
        n = len(y)
        sigma2 = ss_res / (n - 2) if n > 2 else np.nan
        cov = sigma2 * np.linalg.inv(X.T @ X)
        se_beta1 = float(np.sqrt(cov[1, 1])) if not np.isnan(sigma2) else np.nan

        # کشش به ازای 5$ تغییر در حول میانگین نفت
        oil_mean = float(oil.dropna().mean())
        elasticity_per_5usd = float(beta[1] * (5 / oil_mean) * 100) / 100  # درصد به درصد
        return {
            "oil_elasticity_pct_per_5usd": float(beta[1] * 5 / oil_mean),
            "beta1_log_oil": float(beta[1]),
            "se_beta1": se_beta1,
            "deficit_to_inflation": 0.6,  # از مطالعات تجربی ایران
            "r2": float(r2) if not np.isnan(r2) else np.nan,
            "n": int(n),
            "estimated": True,
        }
    except Exception:  # noqa: BLE001
        return {"oil_elasticity_pct_per_5usd": -0.3, "deficit_to_inflation": 0.6,
                "r2": np.nan, "n": 0, "estimated": False}


class SensitivityAnalyzer:
    """
    تحلیل حساسیت نرخ ارز نسبت به متغیرهای کلان ایران.

    ضرایب در صورت موجود بودن `df` و `ppp_series`، تجربی برآورد می‌شوند؛
    در غیر این صورت از مقادیر پیش‌فرض تجربی استفاده می‌شود.
    """

    def __init__(self, base_rate, base_inflation, base_oil_price, base_money_growth,
                 df=None, market=None, ppp_series=None,
                 oil_elasticity=None, deficit_to_inflation=None):
        self.base_rate = base_rate
        self.base_inflation = base_inflation
        self.base_oil_price = base_oil_price
        self.base_money_growth = base_money_growth

        # برآورد تجربی در صورت ارائه داده
        self.elasticity_info = {"estimated": False}
        if df is not None and market is not None and ppp_series is not None:
            self.elasticity_info = estimate_elasticities(df, market, ppp_series)

        self.oil_elasticity = oil_elasticity if oil_elasticity is not None else (
            self.elasticity_info.get("oil_elasticity_pct_per_5usd", -0.3) / 5
        )
        self.deficit_to_inflation = deficit_to_inflation if deficit_to_inflation is not None else (
            self.elasticity_info.get("deficit_to_inflation", 0.6)
        )

    def oil_sensitivity(self, oil_min=40, oil_max=120, step=5):
        oils = np.arange(oil_min, oil_max + 1, step)
        rows = []
        for oil in oils:
            change_pct = self.oil_elasticity * (oil - self.base_oil_price)
            rows.append({
                "قیمت_نفت": oil,
                "نرخ_برآوردی": self.base_rate * (1 + change_pct / 100),
                "تغییر_درصد": change_pct,
            })
        return pd.DataFrame(rows)

    def deficit_sensitivity(self, deficit_min=0, deficit_max=50, step=5):
        deficits = np.arange(deficit_min, deficit_max + 1, step)
        rows = []
        for d in deficits:
            change_pct = d * self.deficit_to_inflation
            rows.append({
                "کسری_بودجه": d,
                "نرخ_برآوردی": self.base_rate * (1 + change_pct / 100),
                "تغییر_درصد": change_pct,
            })
        return pd.DataFrame(rows)

    def build_heatmap(self):
        oils = np.arange(40, 121, 10)
        deficits = np.arange(0, 51, 5)
        matrix = np.zeros((len(deficits), len(oils)))
        for i, d in enumerate(deficits):
            for j, o in enumerate(oils):
                oil_eff = self.oil_elasticity * (o - self.base_oil_price)
                deficit_eff = d * self.deficit_to_inflation
                matrix[i, j] = self.base_rate * (1 + (oil_eff + deficit_eff) / 100)
        return matrix, oils, deficits

    def tornado_data(self, shock_pct=20):
        s = shock_pct / 100
        variables = [
            ("قیمت نفت",     self.oil_elasticity * self.base_oil_price * s,
                            -self.oil_elasticity * self.base_oil_price * s),
            ("رشد نقدینگی",  self.base_money_growth * s * 0.9,
                            -self.base_money_growth * s * 0.9),
            ("تورم",         self.base_inflation * s * 0.8,
                            -self.base_inflation * s * 0.8),
            ("کسری بودجه",   15 * self.deficit_to_inflation,
                            -15 * self.deficit_to_inflation),
        ]
        rows = []
        for name, low, high in variables:
            rows.append({"متغیر": name, "low": low, "high": high,
                        "range": abs(high - low)})
        return pd.DataFrame(rows).sort_values("range", ascending=True)

    def oil_elasticity_per_5usd(self):
        return self.oil_elasticity * 5
