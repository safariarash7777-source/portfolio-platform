"""بازتولید seed های JSON داشبورد ارز (lib/fx/data/*.json) از اکسل‌های کلان.

اجرا روی PC خودت (مستقل از هر سرویس خارجی):
    python scripts/fx-refresh-seeds.py \
        --ppp "مسیر/فایلپیشبینیppp.xlsx" \
        --inflation "مسیر/Iran_Inflation_Complete_Series.xlsx" \
        --ytm "مسیر/Macroeconomics-data.xlsx"

خروجی‌ها (در lib/fx/data/):
    macro_annual.json  — دادهٔ کلان سالانه (year_shamsi, infl_cbi, usa_infl, m2_growth, ...)
    cpi_monthly.json   — تورم ماهانه (ym, infl_pp, infl_monthly, infl_annual, cpi_index)
    ytm_monthly.json   — میانگین ماهانهٔ YTM (ym, ytm)

base_rates.json (نرخ‌های تاریخی دلار) دستی است و این اسکریپت به آن دست نمی‌زند.
بعد از اجرا: git commit + push → دیپلوی خودکار Vercel.

نیازمندی: pip install pandas numpy openpyxl
منطق دقیقاً همان data_sources.py داشبورد Streamlit است (هم‌ترازی با engine.test.ts).
"""
import argparse
import json
import os
import re

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "lib", "fx", "data")

PERSIAN_MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
                  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"]

# نگاشت ردیف‌های شیت Data اکسل PPP به نام فیلدها (همان data_sources.py)
_ROW_MAP = {
    3: "cpi_cbi", 4: "infl_cbi", 5: "cpi_sci", 6: "infl_sci",
    7: "m2_irr", 8: "m2_growth", 9: "gdp_growth", 10: "gdp_usd",
    11: "oil_exports", 12: "usa_cpi", 13: "usa_infl", 14: "usa_m2",
    15: "usa_m2_growth", 16: "usa_gdp_growth", 17: "usa_gdp",
}
_FIRST_DATA_COL = 5


def _to_float(v):
    s = str(v).strip()
    if s in ("..", "nan", "", "None"):
        return None
    s = re.sub(r"[^\d.\-]", "", s)
    try:
        return float(s)
    except ValueError:
        return None


def refresh_macro(ppp_xlsx: str) -> None:
    raw = pd.read_excel(ppp_xlsx, sheet_name="Data", header=None)
    n_year_cols = raw.iloc[2, _FIRST_DATA_COL:].notna().sum()
    rows = []
    for j in range(_FIRST_DATA_COL, _FIRST_DATA_COL + int(n_year_cols)):
        ys = _to_float(raw.iloc[2, j])
        if ys is None:
            continue
        ym = _to_float(raw.iloc[1, j])
        rec = {"year_shamsi": int(ys), "year_miladi": int(ym) if ym is not None else None}
        for r, name in _ROW_MAP.items():
            rec[name] = _to_float(raw.iloc[r, j])
        rows.append(rec)
    rows.sort(key=lambda r: r["year_shamsi"])
    with open(os.path.join(OUT, "macro_annual.json"), "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False)
    print(f"macro_annual: {len(rows)} rows, {rows[0]['year_shamsi']}..{rows[-1]['year_shamsi']}")


def refresh_cpi(inflation_xlsx: str) -> None:
    _m2n = {name: i + 1 for i, name in enumerate(PERSIAN_MONTHS)}
    inf = pd.read_excel(inflation_xlsx, sheet_name=0)

    def _to_ym(s):
        try:
            name, yr = str(s).rsplit(" ", 1)
            mn = _m2n.get(name.strip())
            return f"{int(yr)}/{mn:02d}" if mn else None
        except Exception:
            return None

    inf["ym"] = inf["دوره (سال/ماه)"].apply(_to_ym)
    inf = inf.dropna(subset=["ym"]).reset_index(drop=True)
    m_raw = pd.to_numeric(inf["تورم ماهانه (درصد)"], errors="coerce").to_numpy()
    pp = pd.to_numeric(inf["تورم نقطه به نقطه (درصد)"], errors="coerce").to_numpy()
    annual = pd.to_numeric(inf["تورم سالانه (درصد)"], errors="coerce").to_numpy()

    # بازسازی CPI با لنگر نقطه‌به‌نقطه (همان منطق داشبورد Streamlit)
    n = len(inf)
    cpi = np.full(n, np.nan)
    if n:
        cpi[0] = 100.0
        for i in range(1, min(12, n)):
            seed = m_raw[i] if not np.isnan(m_raw[i]) else 0.0
            cpi[i] = cpi[i - 1] * (1 + seed / 100)
        for i in range(12, n):
            anchor = pp[i] if not np.isnan(pp[i]) else 0.0
            cpi[i] = cpi[i - 12] * (1 + anchor / 100)
    m_consistent = np.full(n, np.nan)
    if n > 1:
        m_consistent[1:] = (cpi[1:] / cpi[:-1] - 1) * 100

    def _clean(x):
        return None if (x is None or (isinstance(x, float) and np.isnan(x))) else round(float(x), 4)

    cpi_rows = [
        {"ym": inf["ym"].iloc[i], "infl_pp": _clean(pp[i]), "infl_monthly": _clean(m_consistent[i]),
         "infl_annual": _clean(annual[i]), "cpi_index": _clean(cpi[i])}
        for i in range(n)
    ]
    with open(os.path.join(OUT, "cpi_monthly.json"), "w", encoding="utf-8") as f:
        json.dump(cpi_rows, f, ensure_ascii=False)
    print(f"cpi_monthly: {len(cpi_rows)} rows, {cpi_rows[0]['ym']}..{cpi_rows[-1]['ym']}")


def refresh_ytm(ytm_xlsx: str) -> None:
    y = pd.read_excel(ytm_xlsx, header=3).iloc[:, :3]
    y.columns = ["miladi", "shamsi", "val"]
    y = y.dropna(subset=["shamsi", "val"])
    y["ym"] = y["shamsi"].astype(str).str[:7].str.replace("-", "/", regex=False)
    y["val"] = pd.to_numeric(y["val"], errors="coerce")
    y = y.dropna(subset=["val"])
    ytm_m = (y.groupby("ym")["val"].mean() * 100).round(4)
    ytm_rows = [{"ym": k, "ytm": float(v)} for k, v in ytm_m.items()]
    ytm_rows.sort(key=lambda r: r["ym"])
    with open(os.path.join(OUT, "ytm_monthly.json"), "w", encoding="utf-8") as f:
        json.dump(ytm_rows, f, ensure_ascii=False)
    print(f"ytm_monthly: {len(ytm_rows)} rows, {ytm_rows[0]['ym']}..{ytm_rows[-1]['ym']}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="بازتولید seed های JSON داشبورد ارز")
    ap.add_argument("--ppp", help="مسیر اکسل فایلپیشبینیppp (شیت Data)")
    ap.add_argument("--inflation", help="مسیر اکسل سری کامل تورم ایران")
    ap.add_argument("--ytm", help="مسیر اکسل Macroeconomics-data (YTM اخزا)")
    args = ap.parse_args()
    if not any([args.ppp, args.inflation, args.ytm]):
        ap.error("حداقل یکی از --ppp / --inflation / --ytm را بده.")
    if args.ppp:
        refresh_macro(args.ppp)
    if args.inflation:
        refresh_cpi(args.inflation)
    if args.ytm:
        refresh_ytm(args.ytm)
    print("انجام شد — حالا commit و push کن تا Vercel دیپلوی کند.")
