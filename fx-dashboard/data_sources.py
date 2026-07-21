"""
منابع داده: فایل اکسل تاریخی + نرخ زنده دلار از tgju + فونت محلی Pelak
"""
import base64
import os
import re
from functools import lru_cache

import numpy as np
import pandas as pd
import requests

# ────────────────────────────────────────────────────────────────────────────
# مسیرها
# ────────────────────────────────────────────────────────────────────────────
_HERE = os.path.dirname(os.path.abspath(__file__))
_LOCAL_XLSX = os.path.join(_HERE, "فایل پیش بینی ppp.xlsx")
EXCEL_PATH = os.environ.get(
    "PPP_EXCEL",
    _LOCAL_XLSX if os.path.exists(_LOCAL_XLSX)
    else r"C:\Users\arsa\Downloads\فایل پیش بینی ppp.xlsx",
)
ASSETS = os.path.join(_HERE, "assets")
FONT_DIR = os.path.join(ASSETS, "fonts")
LOGO_NAVY = os.path.join(ASSETS, "logo-navy.png")
LOGO_WHITE = os.path.join(ASSETS, "logo-white.png")

# منابع نرخ بهره واقعی: تورم ماهانه (xlsx) + نرخ بدون ریسک/YTM روزانه (xlsx، Pouya Finance)
_LOCAL_INFL = os.path.join(_HERE, "Iran_Inflation_Complete_Series_1399_1405.xlsx")
INFLATION_PATH = os.environ.get(
    "INFLATION_XLSX",
    _LOCAL_INFL if os.path.exists(_LOCAL_INFL)
    else r"C:\Users\arsa\Downloads\Iran_Inflation_Complete_Series_1399_1405.xlsx",
)
_LOCAL_YTM = os.path.join(_HERE, "Macroeconomics-data_1405-03-22.xlsx")
YTM_PATH = os.environ.get(
    "RISKFREE_YTM_XLSX",
    _LOCAL_YTM if os.path.exists(_LOCAL_YTM)
    else r"C:\Users\arsa\Downloads\Macroeconomics-data_1405-03-22.xlsx",
)

# منبع تحلیل بورس: خروجیِ build_stock_analysis.py
# داشبورد همیشه از فایلِ «جاری» می‌خواند تا با هر آپدیتِ اسکریپت، خودکار به‌روز شود.
_BOURSE_CURRENT = os.path.join(_HERE, "تحلیل_کامل_بورس_جاری.xlsx")
_BOURSE_LEGACY = os.path.join(_HERE, "تحلیل_کامل_بورس_1405.xlsx")  # fallback برای ایمنی
BOURSE_PATH = os.environ.get(
    "BOURSE_XLSX",
    _BOURSE_CURRENT if os.path.exists(_BOURSE_CURRENT)
    else (_BOURSE_LEGACY if os.path.exists(_BOURSE_LEGACY)
          else r"C:\Users\arsa\Downloads\تحلیل_کامل_بورس_1405.xlsx"),
)

# ─── پالت رنگ هویت بصری برند آرش ───
BRAND = {
    "navy": "#1E3A8A", "navy_deep": "#0D1F4A", "navy_light": "#2D4DB0",
    "gold": "#B8860B", "gold_light": "#F5D07A", "gold_dark": "#8B6508",
    "cream": "#F2F0E8", "bg": "#F8F7F4",
    "text": "#1A1A1A", "mute": "#6B6B6B", "line": "#E5E3DC",
}
# ترتیب رنگ نمودارها (سرمه‌ای، طلایی، طلایی روشن، سرمه‌ای روشن)
PLOT_COLORS = [BRAND["navy"], BRAND["gold"], BRAND["gold_light"],
               BRAND["navy_light"], BRAND["navy_deep"], BRAND["gold_dark"]]
PLOT_FONT = "Pelak, Vazirmatn, Tahoma, sans-serif"

_PELAK_WEIGHTS = {
    "Pelak-Regular.woff2": 400, "Pelak-Medium.woff2": 500,
    "Pelak-SemiBold.woff2": 600, "Pelak-Bold.woff2": 700,
    "Pelak-Black.woff2": 900,
}

# نگاشت ردیف‌های اکسل به نام ستون‌ها
_ROW_MAP = {
    3: "cpi_cbi", 4: "infl_cbi", 5: "cpi_sci", 6: "infl_sci",
    7: "m2_irr", 8: "m2_growth", 9: "gdp_growth", 10: "gdp_usd",
    11: "oil_exports", 12: "usa_cpi", 13: "usa_infl", 14: "usa_m2",
    15: "usa_m2_growth", 16: "usa_gdp_growth", 17: "usa_gdp",
}
_FIRST_DATA_COL = 5

# نرخ بازار غیررسمی سالانه دلار (تومان) — منبع: بانک مرکزی، شیت monthly-yearly
# اعداد دقیق از داده تاریخی استخراج شده (ریال ÷ ۱۰)
HISTORICAL_BASE_RATES_TOMAN = {
    1338: 8, 1339: 8, 1340: 8, 1341: 8, 1342: 8, 1343: 8, 1344: 8, 1345: 8,
    1346: 8, 1347: 8, 1348: 8, 1349: 8, 1350: 8,
    1351: 7, 1352: 7, 1353: 7, 1354: 7, 1355: 7, 1356: 7,
    1357: 10,    # انقلاب
    1358: 14,
    1359: 20,    # شروع جنگ
    1360: 27,
    1361: 35,
    1362: 45,
    1363: 58,
    1364: 61,
    1365: 74,    # اوج جنگ
    1366: 99,
    1367: 97,
    1368: 121,
    1369: 141,
    1370: 142,   # سازندگی — یکسان‌سازی اول
    1371: 150,
    1372: 181,   # بحران ارزی اول
    1373: 264,
    1374: 404,
    1375: 445,
    1376: 478,
    1377: 647,
    1378: 863,
    1379: 813,
    1380: 792,   # یکسان‌سازی دوم
    1381: 799,
    1382: 832,
    1383: 875,
    1384: 904,   # شروع دولت احمدی‌نژاد
    1385: 923,
    1386: 936,
    1387: 967,
    1388: 998,
    1389: 1060,  # آستانه شوک
    1390: 1357,  # شروع تحریم
    1391: 2606,  # شوک ارزی اول
    1392: 3184,
    1393: 3280,
    1394: 3450,
    1395: 3644,  # برجام
    1396: 4045,
    1397: 10338, # خروج آمریکا از برجام
    1398: 12918,
    1399: 22881,
    1400: 25948,
    1401: 34927,
    1402: 51781,
    1403: 69081,
    1404: 155000,   # میانگین بازه پرنوسان اسفند ۱۴۰۴ (۱۴۵–۱۶۶ هزار) — منبع: بازار آزاد تهران
    1405: 174000,   # نقطه‌ای خرداد ۱۴۰۵ (هفته منتهی به ۱۸ خرداد)
}

PERSIAN_MONTHS = [
    "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
    "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
]

# ════════════════════════════════════════════════════════════════════════════
# متادیتای فرکانس — برای هر سری باید مشخص باشد روی چه فرکانسی برآورد می‌شود
# ════════════════════════════════════════════════════════════════════════════
SERIES_FREQUENCY = {
    # سری‌های آمریکا (FRED)
    "CPIAUCSL":      {"freq": "M", "source": "FRED", "lag_months": 1},
    "M2SL":          {"freq": "M", "source": "FRED", "lag_months": 1},
    "GDPC1":         {"freq": "Q", "source": "FRED", "lag_months": 2},
    "DFF":           {"freq": "D", "source": "FRED", "lag_months": 0},
    "DCOILBRENTEU":  {"freq": "D", "source": "FRED", "lag_months": 0},
    # سری‌های ایران (Google Sheet / اکسل)
    "CPI_Iran_CB":   {"freq": "M", "source": "CBI",  "lag_months": 1},
    "CPI_Iran_SCI":  {"freq": "M", "source": "SCI",  "lag_months": 1},
    "M2_Iran":       {"freq": "M", "source": "CBI",  "lag_months": 3},
    "GDP_Iran_Real": {"freq": "Q", "source": "CBI",  "lag_months": 3},
    "Interbank_Rate":{"freq": "M", "source": "CBI",  "lag_months": 0},
    "FX_Free":       {"freq": "D", "source": "tgju", "lag_months": 0},
    "FX_NIMA":       {"freq": "D", "source": "NIMA", "lag_months": 0},
    "Oil_Export_Volume":{"freq": "Q", "source": "OPEC","lag_months": 2},
    "Capital_Outflow":{"freq": "A","source": "IMF",  "lag_months": 12},
}


# ════════════════════════════════════════════════════════════════════════════
# تبدیل تاریخ شمسی ↔ میلادی + ترازبندی day-weighted
# ════════════════════════════════════════════════════════════════════════════
def _jalali_to_gregorian(jy: int, jm: int, jd: int):
    """تبدیل تاریخ شمسی به میلادی (الگوریتم محاسباتی استاندارد، بدون وابستگی خارجی)."""
    jy1 = jy + 1595
    days = (-355668 + (365 * jy1) + ((jy1 // 33) * 8) + (((jy1 % 33) + 3) // 4)
            + jd + ([0, 31, 62, 93, 124, 155, 186, 216, 246, 276, 306, 336][jm - 1]))
    gy = 400 * (days // 146097)
    days %= 146097
    if days > 36524:
        days -= 1
        gy += 100 * (days // 36524)
        days %= 36524
        if days >= 365:
            days += 1
    gy += 4 * (days // 1461)
    days %= 1461
    if days > 365:
        gy += (days - 1) // 365
        days = (days - 1) % 365
    gd = days + 1
    sal_a = [0, 31, 29 if (gy % 4 == 0 and gy % 100 != 0) or (gy % 400 == 0) else 28,
             31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    gm = 0
    while gm < 12 and gd > sal_a[gm + 1]:
        gd -= sal_a[gm + 1]
        gm += 1
    return gy, gm + 1, gd


def shamsi_month_to_gregorian_range(jy: int, jm: int):
    """بازه میلادی متناظر با ماه شمسی (jy, jm) — (start_date, end_date)."""
    import datetime as dt
    sy, sm, sd = _jalali_to_gregorian(jy, jm, 1)
    # روز اول ماه شمسی بعد
    if jm == 12:
        ny, nm = jy + 1, 1
    else:
        ny, nm = jy, jm + 1
    ey, em, ed = _jalali_to_gregorian(ny, nm, 1)
    start = dt.date(sy, sm, sd)
    end = dt.date(ey, em, ed) - dt.timedelta(days=1)
    return start, end


def align_calendars(df_us: pd.DataFrame, df_ir: pd.DataFrame,
                    us_date_col: str = "Date",
                    ir_shamsi_col: str = "Date_Shamsi") -> pd.DataFrame:
    """
    ترازبندی تقویم شمسی ↔ میلادی با میانگین وزن‌دار روزانه (day-weighted).

    هر ماه شمسی دو ماه میلادی را همپوشانی دارد. این تابع برای هر ماه شمسی،
    میانگین وزن‌دار سری ماهانه آمریکا را بر اساس تعداد روزهای همپوشانی محاسبه
    می‌کند — برخلاف نگاشت ساده انتهای ماه که می‌تواند تا ~۱۵ روز خطا ایجاد کند.

    Args:
        df_us: DataFrame ماهانه میلادی، شامل ستون Date و سری‌های آمریکا.
        df_ir: DataFrame ماهانه شمسی، شامل ستون Date_Shamsi (YYYY/MM/DD).
        us_date_col: نام ستون تاریخ میلادی در df_us.
        ir_shamsi_col: نام ستون تاریخ شمسی در df_ir.

    Returns:
        DataFrame ترازشده روی فریم شمسی، با ستون‌های میانگین وزن‌دار آمریکا
        و یادداشت `_alignment_log` در attrs.
    """
    import datetime as dt
    if df_ir.empty:
        return df_ir.copy()

    us = df_us.copy()
    if us_date_col in us.columns:
        us[us_date_col] = pd.to_datetime(us[us_date_col], errors="coerce")
        us = us.dropna(subset=[us_date_col]).set_index(us_date_col)

    us_num_cols = [c for c in us.columns if pd.api.types.is_numeric_dtype(us[c])]

    out = df_ir.copy()
    log_entries = []

    aligned = {c: [] for c in us_num_cols}
    for idx, row in df_ir.iterrows():
        parsed = parse_shamsi_date(str(row.get(ir_shamsi_col, "")))
        if not parsed:
            for c in us_num_cols:
                aligned[c].append(np.nan)
            continue
        jy, jm, _ = parsed
        gstart, gend = shamsi_month_to_gregorian_range(jy, jm)
        # شناسایی ماه‌های میلادی همپوشان
        m1_start = dt.date(gstart.year, gstart.month, 1)
        if gend.month == 12:
            m2_start = dt.date(gend.year + 1, 1, 1)
        else:
            m2_start = dt.date(gend.year, gend.month + 1, 1)
        m2_first = dt.date(gend.year, gend.month, 1)
        # روزهای همپوشانی در هر ماه میلادی
        days_in_m1 = (min(m2_first, gend + dt.timedelta(days=1)) - gstart).days
        days_in_m2 = max((gend + dt.timedelta(days=1) - m2_first).days, 0)
        total = days_in_m1 + days_in_m2
        if total <= 0:
            for c in us_num_cols:
                aligned[c].append(np.nan)
            continue
        w1 = days_in_m1 / total
        w2 = days_in_m2 / total

        for c in us_num_cols:
            try:
                v1 = us.loc[us.index.to_period("M") == pd.Period(m1_start, "M"), c]
                v2 = us.loc[us.index.to_period("M") == pd.Period(m2_first, "M"), c]
                v1f = float(v1.iloc[0]) if len(v1) > 0 else np.nan
                v2f = float(v2.iloc[0]) if len(v2) > 0 else np.nan
                if pd.isna(v1f) and pd.isna(v2f):
                    aligned[c].append(np.nan)
                elif pd.isna(v2f):
                    aligned[c].append(v1f)
                elif pd.isna(v1f):
                    aligned[c].append(v2f)
                else:
                    aligned[c].append(w1 * v1f + w2 * v2f)
            except Exception:  # noqa: BLE001
                aligned[c].append(np.nan)
        log_entries.append(f"{jy}/{jm:02d}: w1={w1:.2f} w2={w2:.2f}")

    for c in us_num_cols:
        out[f"{c}_aligned"] = aligned[c]
    out.attrs["_alignment_log"] = log_entries
    return out


def _to_float(v):
    s = str(v).strip()
    if s in ("..", "nan", "", "None"):
        return np.nan
    s = re.sub(r"[^\d.\-]", "", s)
    try:
        return float(s)
    except ValueError:
        return np.nan


def load_excel_data(path: str = None) -> pd.DataFrame:
    """
    داده تاریخی سالانه را از فایل اکسل می‌خواند و یک DataFrame تمیز برمی‌گرداند.
    ستون‌ها: year_shamsi, year_miladi و سری‌های اقتصادی.
    """
    path = path or EXCEL_PATH
    raw = pd.read_excel(path, sheet_name="Data", header=None)

    n_year_cols = raw.iloc[2, _FIRST_DATA_COL:].notna().sum()
    rows = {"year_shamsi": [], "year_miladi": []}
    for name in _ROW_MAP.values():
        rows[name] = []

    for j in range(_FIRST_DATA_COL, _FIRST_DATA_COL + n_year_cols):
        ys = _to_float(raw.iloc[2, j])
        if pd.isna(ys):
            continue
        ym = _to_float(raw.iloc[1, j])
        rows["year_shamsi"].append(int(ys))
        rows["year_miladi"].append(int(ym) if not pd.isna(ym) else None)
        for r, name in _ROW_MAP.items():
            rows[name].append(_to_float(raw.iloc[r, j]))

    df = pd.DataFrame(rows).sort_values("year_shamsi").reset_index(drop=True)
    return df


def load_real_interest_monthly(inflation_path: str = None,
                               ytm_path: str = None) -> pd.DataFrame:
    """
    داده‌ی «نرخ بهره واقعی» را در فرکانس ماهانهٔ شمسی می‌سازد.

    منابع:
      • تورم: فایل xlsx ماهانه (ستون «دوره (سال/ماه)» مثل «فروردین 1399»)؛
        ستون‌های «نقطه به نقطه» و «سالانه» سری‌های رسمی‌اند.
      • YTM (نرخ بدون ریسک): فایل xlsx روزانهٔ Pouya Finance — مقدار اعشاری (×۱۰۰)،
        تاریخ شمسی yyyy-mm-dd → میانگین ماهانه (groupby سال/ماه).

    کالیبراسیون تورم (مرجع = نقطه‌به‌نقطه):
        چون سری تورم ماهانهٔ خام با هدلاین نقطه‌به‌نقطه ناسازگار بود (انباشتش تا
        ±۱۵ واحد درصد منحرف می‌شد)، یک شاخص CPI بازسازی می‌شود: ۱۲ ماه نخست از
        تورم ماهانهٔ خام seed و سپس برای ماه‌های بعد از خودِ نقطه‌به‌نقطه لنگر
        می‌گیرد: CPI_t = CPI_{t-12} × (1 + pp_t/100). تورم ماهانهٔ سازگار از همین
        CPI مشتق می‌شود. خط «سالانه‌شدهٔ تک‌ماه» (که جهش‌های پوچ می‌ساخت) حذف و
        جایش «نرخ تورم سالانه = میانگین متحرک ۱۲ ماهه» (هدلاین رسمی) می‌نشیند.

    خروجی: DataFrame با ایندکس 'ym' (رشتهٔ 'yyyy/mm' شمسی) و ستون‌های:
        ytm          = میانگین ماهانهٔ نرخ بدون ریسک/YTM (٪)
        infl_pp      = تورم نقطه‌به‌نقطه (٪) — مرجع
        infl_monthly = تورم ماهانهٔ سازگار-با-مرجع (٪)
        infl_annual  = نرخ تورم سالانه، میانگین متحرک ۱۲ ماهه (٪)
        real_rate    = ytm - infl_pp (فقط جایی که هر دو موجودند؛ بقیه NaN)

    گریس‌فول: اگر فایلی نبود یا خواندن/تجزیه شکست خورد، DataFrame خالی برمی‌گرداند.
    """
    cols = ["ytm", "infl_pp", "infl_monthly", "infl_annual", "real_rate"]
    inflation_path = inflation_path or INFLATION_PATH
    ytm_path = ytm_path or YTM_PATH
    try:
        if not (os.path.exists(inflation_path) and os.path.exists(ytm_path)):
            return pd.DataFrame(columns=cols)

        _m2n = {name: i + 1 for i, name in enumerate(PERSIAN_MONTHS)}

        # ── تورم: نقطه‌به‌نقطه (مرجع) + سالانه (میانگین متحرک ۱۲ ماهه) ──
        inf = pd.read_excel(inflation_path, sheet_name=0)

        def _to_ym(s):
            name, yr = str(s).rsplit(" ", 1)
            mn = _m2n.get(name.strip())
            return f"{int(yr)}/{mn:02d}" if mn else None

        inf["ym"] = inf["دوره (سال/ماه)"].apply(_to_ym)
        inf = inf.dropna(subset=["ym"]).reset_index(drop=True)
        m_raw = pd.to_numeric(inf["تورم ماهانه (درصد)"], errors="coerce").to_numpy()
        pp = pd.to_numeric(inf["تورم نقطه به نقطه (درصد)"], errors="coerce").to_numpy()
        annual = pd.to_numeric(inf["تورم سالانه (درصد)"], errors="coerce").to_numpy()

        # CPI بازسازی‌شده با لنگرِ نقطه‌به‌نقطه → تورم ماهانهٔ سازگار
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

        infl = pd.DataFrame({
            "ym": inf["ym"].values,
            "infl_pp": pp,
            "infl_monthly": m_consistent,
            "infl_annual": annual,
        }).set_index("ym")

        # ── YTM/نرخ بدون ریسک (xlsx روزانه) → میانگین ماهانه ──
        y = pd.read_excel(ytm_path, header=3).iloc[:, :3]
        y.columns = ["miladi", "shamsi", "val"]
        y = y.dropna(subset=["shamsi", "val"])
        y["ym"] = y["shamsi"].astype(str).str[:7].str.replace("-", "/", regex=False)
        y["val"] = pd.to_numeric(y["val"], errors="coerce")
        y = y.dropna(subset=["val"])
        ytm_m = (y.groupby("ym")["val"].mean() * 100).to_frame("ytm")  # اعشاری → ٪

        # ── ادغام ماهانه (پایه = ماه‌های تورم؛ YTM کل بازه را پوشش می‌دهد) ──
        out = infl.join(ytm_m, how="left")
        out["real_rate"] = out["ytm"] - out["infl_pp"]
        out = out.sort_index()  # 'yyyy/mm' با عرض ثابت → مرتب‌سازی الفبایی = زمانی
        out.index.name = "ym"
        return out[cols]
    except Exception:  # noqa: BLE001
        return pd.DataFrame(columns=cols)


def load_cpi_monthly(inflation_path: str = None) -> pd.DataFrame:
    """
    شاخصِ قیمتِ مصرف‌کنندهٔ **ماهانهٔ** ایران را از فایل تورم می‌سازد.

    چرا جدا از load_real_interest_monthly: آن تابع اگر فایلِ YTM نباشد کلاً
    DataFrame خالی می‌دهد، و فایلِ YTM بیرونِ پروژه است. سری قیمت نباید به آن
    گره بخورد، چون بنیادیِ ماهانهٔ PPP روی همین سری ساخته می‌شود.

    بازسازی (همان قاعدهٔ load_real_interest_monthly): سری تورمِ ماهانهٔ خامِ فایل
    با هدلاینِ نقطه‌به‌نقطه ناسازگار است (انباشتش تا ±۱۵ واحد درصد منحرف می‌شود)،
    پس ۱۲ ماه نخست از تورم ماهانهٔ خام seed می‌شود و از ماه ۱۳ به بعد شاخص از
    خودِ نقطه‌به‌نقطه لنگر می‌گیرد:  CPI_t = CPI_{t-12} × (1 + pp_t/100).

    خروجی: DataFrame با ایندکسِ DatetimeIndex (روزِ نخستِ ماهِ شمسی به میلادی) و
    ستون‌های cpi (شاخص، ماهِ نخست = ۱۰۰)، jy و jm (سال/ماهِ شمسی).
    در صورت نبودِ فایل یا خطای تجزیه، DataFrame خالی (گریس‌فول).
    """
    import datetime as _dt

    cols = ["cpi", "jy", "jm"]
    inflation_path = inflation_path or INFLATION_PATH
    try:
        if not os.path.exists(inflation_path):
            return pd.DataFrame(columns=cols)

        _m2n = {name: i + 1 for i, name in enumerate(PERSIAN_MONTHS)}
        inf = pd.read_excel(inflation_path, sheet_name=0)

        rows = []
        for raw in inf["دوره (سال/ماه)"]:
            try:
                name, yr = str(raw).rsplit(" ", 1)
                mn = _m2n.get(name.strip())
                rows.append((int(yr), mn) if mn else (None, None))
            except Exception:  # noqa: BLE001
                rows.append((None, None))
        inf["jy"] = [r[0] for r in rows]
        inf["jm"] = [r[1] for r in rows]
        inf = inf.dropna(subset=["jy", "jm"]).reset_index(drop=True)
        if inf.empty:
            return pd.DataFrame(columns=cols)

        m_raw = pd.to_numeric(inf["تورم ماهانه (درصد)"], errors="coerce").to_numpy()
        pp = pd.to_numeric(inf["تورم نقطه به نقطه (درصد)"], errors="coerce").to_numpy()

        n = len(inf)
        cpi = np.full(n, np.nan)
        cpi[0] = 100.0
        for i in range(1, min(12, n)):
            seed = m_raw[i] if not np.isnan(m_raw[i]) else 0.0
            cpi[i] = cpi[i - 1] * (1 + seed / 100)
        for i in range(12, n):
            anchor = pp[i] if not np.isnan(pp[i]) else 0.0
            cpi[i] = cpi[i - 12] * (1 + anchor / 100)

        idx = []
        for jy, jm in zip(inf["jy"], inf["jm"]):
            g0, _g1 = shamsi_month_to_gregorian_range(int(jy), int(jm))
            idx.append(pd.Timestamp(_dt.date(g0.year, g0.month, g0.day)))

        out = pd.DataFrame({"cpi": cpi,
                            "jy": inf["jy"].astype(int).values,
                            "jm": inf["jm"].astype(int).values}, index=pd.DatetimeIndex(idx))
        return out.sort_index().dropna(subset=["cpi"])
    except Exception:  # noqa: BLE001
        return pd.DataFrame(columns=cols)


def load_bourse_data(path: str = None) -> dict | None:
    """
    داده‌ی تحلیل بورس را از فایل اکسلِ آماده می‌خوانَد (بدون هیچ محاسبهٔ بنیادی جدید).

    خروجی: dict با کلیدهای 'industries' (صنایع)، 'stocks' (سهام)، 'sectors' (سکتورها)
    که هرکدام DataFrame‌اند؛ یا None اگر فایل نبود یا خواندن شکست خورد (گریس‌فول).

    توجه: درصدها در فایل عددِ خام درصدند (۳۹ = ۳۹٪) و بدون هیچ تبدیلی برگردانده می‌شوند.
    """
    path = path or BOURSE_PATH
    try:
        if not os.path.exists(path):
            return None
        xl = pd.ExcelFile(path)
        return {
            "industries": pd.read_excel(xl, "صنایع"),
            "stocks": pd.read_excel(xl, "سهام"),
            "sectors": pd.read_excel(xl, "سکتورها"),
        }
    except Exception:  # noqa: BLE001
        return None


def cointegration_inputs(df: pd.DataFrame, market: pd.Series | None = None) -> pd.DataFrame:
    """
    قاب ورودیِ یکدستِ لگاریتمی برای مدل‌های هم‌انباشتگی (ECM و BEER).

    این تابع منبعِ واحدِ حقیقت برای بنیادهای لگاریتمی است تا ECM و BEER هرکدام
    جداگانه آن‌ها را بازنسازند (که سرچشمهٔ ناهماهنگی و رگرسیون کاذب بود).

    ستون‌های خروجی (هرکدام که داده‌اش موجود باشد):
        ln_m2_ir, ln_m2_us, ln_gdp_ir, ln_gdp_us, ln_oil, ln_cpi_rel, ln_E
    ایندکس: year_shamsi. فقط مقادیر مثبت لگاریتم گرفته می‌شوند.

    Args:
        df: دادهٔ سالانه (خروجی load_excel_data).
        market: سری نرخ بازار (شاخص = year_shamsi). اگر داده شود، ستون ln_E افزوده می‌شود.
    """
    d = df.set_index("year_shamsi").copy()

    def _safe_log(col):
        if col not in d.columns:
            return None
        s = pd.to_numeric(d[col], errors="coerce")
        s = s.where(s > 0)
        return np.log(s)

    out = pd.DataFrame(index=d.index)
    mapping = {
        "ln_m2_ir": "m2_irr", "ln_m2_us": "usa_m2",
        "ln_gdp_ir": "gdp_usd", "ln_gdp_us": "usa_gdp",
        "ln_oil": "oil_exports",
    }
    for new, src in mapping.items():
        s = _safe_log(src)
        if s is not None:
            out[new] = s

    # CPI نسبی (شاخص بانک مرکزی نسبت به آمریکا)
    if "cpi_cbi" in d.columns and "usa_cpi" in d.columns:
        cpi_ir = pd.to_numeric(d["cpi_cbi"], errors="coerce").where(lambda x: x > 0)
        cpi_us = pd.to_numeric(d["usa_cpi"], errors="coerce").where(lambda x: x > 0)
        out["ln_cpi_rel"] = np.log(cpi_ir / cpi_us)

    if market is not None and not market.empty:
        m = pd.to_numeric(market, errors="coerce")
        m = m[m.index.isin(out.index)]
        out["ln_E"] = np.log(m.where(m > 0))

    return out


# ────────────────────────────────────────────────────────────────────────────
# نرخ زنده دلار از tgju
# ────────────────────────────────────────────────────────────────────────────
TGJU_URL = "https://api.tgju.org/v1/market/indicator/summary-table-data/price_dollar_rl"

# ────────────────────────────────────────────────────────────────────────────
# Google Sheet برای داده‌های ماهانه ایران (CPI, M2, GDP, FX_Free, FX_NIMA…)
# ────────────────────────────────────────────────────────────────────────────
# پس از ساخت Sheet، لینک CSV عمومی (File → Share → Publish to web → CSV) را بچسبانید.
GOOGLE_SHEET_URL = ""  # مثال: "https://docs.google.com/spreadsheets/d/.../pub?output=csv"

# ستون‌های مورد انتظار (تعریف برای کاربر):
GOOGLE_SHEET_SCHEMA = {
    "Date":            "تاریخ میلادی YYYY-MM-DD (انتهای ماه)",
    "Date_Shamsi":     "تاریخ شمسی برای نمایش",
    "CPI_Iran_CB":     "شاخص بهای بانک مرکزی (ماهانه)",
    "CPI_Iran_SCI":    "شاخص بهای مرکز آمار (اختیاری)",
    "M2_Iran":         "نقدینگی کل (همت)",
    "GDP_Iran_Real":   "تولید حقیقی (شاخص فصلی/سالانه)",
    "Interbank_Rate":  "نرخ سود بازار بین‌بانکی (٪)",
    "FX_Free":         "نرخ دلار بازار آزاد (تومان)",
    "FX_NIMA":         "نرخ دلار نیما (اختیاری، تومان)",
    "Oil_Export_Volume": "حجم صادرات نفت (اختیاری)",
    "Capital_Outflow": "خروج سرمایه سالانه (اختیاری)",
}


def fetch_iran_monthly_sheet(url: str = None) -> pd.DataFrame:
    """
    داده ماهانه ایران را از Google Sheet عمومی (CSV) می‌خواند.
    در صورت خالی بودن URL یا خطا، DataFrame خالی برمی‌گرداند.
    """
    url = url or GOOGLE_SHEET_URL
    if not url:
        return pd.DataFrame()
    try:
        df = pd.read_csv(url)
        if "Date" in df.columns:
            df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
            df = df.dropna(subset=["Date"]).sort_values("Date").reset_index(drop=True)
        return df
    except Exception as e:  # noqa: BLE001
        print(f"[fetch_iran_monthly_sheet] خطا: {e}")
        return pd.DataFrame()


# ────────────────────────────────────────────────────────────────────────────
# FRED + yfinance (داده‌های آمریکا و قیمت نفت) — اختیاری
# ────────────────────────────────────────────────────────────────────────────
FRED_SERIES = {
    "CPIAUCSL":      "US CPI ماهانه",
    "M2SL":          "US M2 ماهانه",
    "GDPC1":         "US Real GDP فصلی",
    "DFF":           "Fed Funds Rate روزانه",
    "DCOILBRENTEU":  "Brent Oil Spot روزانه",
}


def fetch_fred(series_id: str) -> pd.Series:
    """
    دریافت سری FRED. در صورت نبود pandas_datareader یا خطای شبکه، Series خالی.
    """
    try:
        from pandas_datareader import data as pdr
        s = pdr.DataReader(series_id, "fred")
        return s.iloc[:, 0].dropna()
    except Exception as e:  # noqa: BLE001
        print(f"[fetch_fred {series_id}] غیرفعال: {e}")
        return pd.Series(dtype=float)


def fetch_brent_live() -> float:
    """آخرین قیمت Brent از yfinance (اختیاری)."""
    try:
        import yfinance as yf
        t = yf.Ticker("BZ=F").history(period="5d")
        if not t.empty:
            return float(t["Close"].iloc[-1])
    except Exception as e:  # noqa: BLE001
        print(f"[fetch_brent_live] غیرفعال: {e}")
    return np.nan


def _strip_html(s: str) -> str:
    return re.sub(r"<[^>]+>", "", str(s)).strip()


def fetch_live_dollar() -> dict:
    """
    نرخ روزانه دلار آزاد را از tgju می‌گیرد.
    خروجی: dict با کلیدهای
      ok, latest_rial, latest_toman, change_pct, date_shamsi, date_miladi, history(DataFrame)
    history: ستون‌های date_shamsi, date_miladi, close_rial, close_toman, low_toman, high_toman
    """
    out = {"ok": False, "error": None}
    try:
        resp = requests.get(
            TGJU_URL,
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=5,
        )
        resp.raise_for_status()
        data = resp.json().get("data", [])
        if not data:
            out["error"] = "پاسخ خالی از tgju"
            return out

        recs = []
        for row in data:
            # [open, low, high, close, change, change%, miladi, shamsi]
            close = _to_float(row[3])
            low = _to_float(row[1])
            high = _to_float(row[2])
            recs.append({
                "date_miladi": str(row[6]),
                "date_shamsi": str(row[7]),
                "close_rial": close,
                "close_toman": close / 10 if not pd.isna(close) else np.nan,
                "low_toman": low / 10 if not pd.isna(low) else np.nan,
                "high_toman": high / 10 if not pd.isna(high) else np.nan,
                "change_pct": _strip_html(row[5]),
            })
        hist = pd.DataFrame(recs)
        # تبدیل تاریخ میلادی برای مرتب‌سازی
        hist["dt"] = pd.to_datetime(hist["date_miladi"], format="%Y/%m/%d", errors="coerce")
        hist = hist.dropna(subset=["dt"]).sort_values("dt").reset_index(drop=True)

        latest = hist.iloc[-1]
        out.update({
            "ok": True,
            "latest_rial": float(latest["close_rial"]),
            "latest_toman": float(latest["close_toman"]),
            "change_pct": latest["change_pct"],
            "date_shamsi": latest["date_shamsi"],
            "date_miladi": latest["date_miladi"],
            "history": hist,
        })
    except Exception as e:  # noqa: BLE001
        out["error"] = str(e)
    return out


# ════════════════════════════════════════════════════════════════════════════
# حباب لحظه‌ای طلا، سکه و صندوق‌های کالایی (طلا/نقره)
# ────────────────────────────────────────────────────────────────────────────
# حباب = (قیمت بازار ÷ ارزش ذاتی − ۱) × ۱۰۰
#   • طلای آبشده : ارزش ذاتی = پاریتهٔ جهانی (انس × دلار آزاد) → حباب بازار داخلی طلا
#   • سکه‌ها     : ارزش ذاتی = وزن طلای خالص × قیمت گرم طلای داخلی → حباب ضربِ سکه
#   • صندوق‌ها   : ارزش ذاتی = NAV ابطال → حباب/تخفیف معاملاتی واحد صندوق
TGJU_INDICATOR = "https://api.tgju.org/v1/market/indicator/summary-table-data/{sym}"

OUNCE_GRAMS = 31.1035        # گرم در هر اونس تروا
GOLD18_PURITY = 0.750       # عیار طلای ۱۸ (۷۵۰ از ۱۰۰۰)

# مشخصات هر سکه: وزن کل (گرم) و عیار → طلای خالص = وزن × عیار/۱۰۰۰
COIN_SPECS = {
    "سکه امامی": {"sym": "sekee", "weight": 8.133,  "ayar": 900},
    "نیم سکه":   {"sym": "nim",   "weight": 4.0665, "ayar": 900},
}

# صندوق‌های کالایی روی TSETMC (نمونه) — کلید = نام نمایشی، مقدار = کد نماد (insCode)
TSETMC_FUNDS = {
    "عیار (صندوق طلا)":   {"ins": "34144395039913458", "asset": "طلا"},
    "سیمین (صندوق نقره)": {"ins": "33761569293467411", "asset": "نقره"},
}


def _tgju_latest(symbol: str, retries: int = 2) -> dict:
    """آخرین رکورد یک نماد tgju. خروجی: {close_rial, close_toman, change_pct, date_shamsi}."""
    last_err = None
    for _ in range(max(1, retries)):
        try:
            resp = requests.get(TGJU_INDICATOR.format(sym=symbol),
                                headers={"User-Agent": "Mozilla/5.0"}, timeout=12)
            resp.raise_for_status()
            data = resp.json().get("data", [])
            if not data:
                return {}
            row = data[0]   # جدیدترین رکورد ابتدای فهرست است
            close = _to_float(row[3])
            return {
                "close_rial": close,
                "close_toman": close / 10 if not pd.isna(close) else np.nan,
                "change_pct": _strip_html(row[5]),
                "date_shamsi": str(row[7]),
                "date_miladi": str(row[6]),
            }
        except Exception as e:  # noqa: BLE001
            last_err = e
    print(f"[_tgju_latest {symbol}] error: {last_err}")
    return {}


def _tsetmc_fund(ins: str) -> dict:
    """
    قیمت معامله و NAV ابطال یک صندوق ETF را از TSETMC می‌گیرد.
    TSETMC ایران-محلی است؛ پراکسی خارجی غیرفعال می‌شود تا اتصال مستقیم برقرار شود.
    خروجی: {price, close, yesterday, nav, nav_sub} بر حسب ریال.
    """
    H = {"User-Agent": "Mozilla/5.0", "Referer": "https://www.tsetmc.com/"}
    NP = {"http": None, "https": None}     # دور زدن پراکسی برای دسترسی مستقیم داخلی
    out = {}
    try:
        r = requests.get(
            f"https://cdn.tsetmc.com/api/ClosingPrice/GetClosingPriceInfo/{ins}",
            headers=H, timeout=7, proxies=NP)
        r.raise_for_status()
        cpi = r.json().get("closingPriceInfo", {})
        out["price"] = _to_float(cpi.get("pDrCotVal"))      # آخرین قیمت معامله
        out["close"] = _to_float(cpi.get("pClosing"))       # قیمت پایانی
        out["yesterday"] = _to_float(cpi.get("priceYesterday"))
        re_ = requests.get(
            f"https://cdn.tsetmc.com/api/Fund/GetETFByInsCode/{ins}",
            headers=H, timeout=7, proxies=NP)
        re_.raise_for_status()
        etf = re_.json().get("etf", {})
        out["nav"] = _to_float(etf.get("pRedTran"))         # NAV ابطال
        out["nav_sub"] = _to_float(etf.get("pSubTran"))     # NAV صدور
    except Exception as e:  # noqa: BLE001
        print(f"[_tsetmc_fund {ins}] error: {e}")
    return out


# ── منبع لحظه‌ای etfbaz (api.dev.etfbaz.com) برای طلا/سکه/ارز ──
ETFBAZ_BASE = "https://api.dev.etfbaz.com"
_ETFBAZ_HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Origin": "https://app.etfbaz.com",
    "Referer": "https://app.etfbaz.com/",
}
# نگاشت نماد etfbaz → (نام نمایشی، گروه) برای ردیف‌های طلا/سکه
ETFBAZ_GOLD_ROWS = [
    ("مظنه آبشده نقدی", "طلای آبشده (مثقال)", "آبشده"),
    ("سکه امامی", "سکه امامی", "سکه"),
    ("نیم سکه", "نیم سکه", "سکه"),
]


def _fmt_chg(v) -> str:
    """عدد درصد تغییر (مثلاً -1.2) → رشتهٔ '-1.2%'؛ خالی اگر نبود."""
    f = _to_float(v)
    return f"{f:g}%" if pd.notna(f) else ""


def _etfbaz_market() -> dict:
    """symbol → رکورد از /gold و /currency اِتف‌باز (قیمت لحظه‌ای + value + bubble + changePercent)."""
    out = {}
    for ep in ("/gold", "/currency"):
        try:
            r = requests.get(ETFBAZ_BASE + ep, headers=_ETFBAZ_HEADERS, timeout=10)
            r.raise_for_status()
            for it in r.json():
                if it.get("symbol"):
                    out[it["symbol"]] = it
        except Exception as e:  # noqa: BLE001
            print(f"[_etfbaz_market {ep}] error: {e}")
    return out


def fetch_bubbles_snapshot() -> dict:
    """
    حباب لحظه‌ای طلای آبشده، سکه‌ها و صندوق‌های طلا/نقره را محاسبه می‌کند.

    منبع اصلی قیمت/حباب طلا و سکه: etfbaz (api.dev.etfbaz.com) — لحظه‌ای و
    به‌روز. در صورت در دسترس نبودن، به tgju (روزانه) برمی‌گردد. صندوق‌ها همیشه
    از TSETMC (قیمت معامله + NAV ابطال).

    خروجی dict با کلیدها:
      ok, error, ts_shamsi, source,
      inputs: {dollar_toman, ons_usd, geram18_toman, parity_toman, change_*}
      rows: فهرستی از dict با کلیدهای
            name, group, market_toman, intrinsic_toman, bubble_pct, change_pct, note
    """
    out = {"ok": False, "error": None, "ts_shamsi": None, "source": None,
           "inputs": {}, "rows": []}
    rows = []
    try:
        mkt = _etfbaz_market()
        if mkt and "انس طلا" in mkt:
            # ══ مسیر اصلی: داده لحظه‌ای etfbaz ══
            out["source"] = "etfbaz (زنده)"

            def _px(sym, k="close"):
                return _to_float(((mkt.get(sym, {}) or {}).get("price") or {}).get(k))

            dollar_rial = _px("USD")
            ons_usd = _px("انس طلا")
            g18_rial = _px("طلا گرم 18 عیار")
            g24_rial = _px("طلا گرم 24 عیار")
            parity_pure = (ons_usd / OUNCE_GRAMS * dollar_rial) \
                if (pd.notna(ons_usd) and pd.notna(dollar_rial)) else np.nan

            ts = ((mkt.get("انس طلا", {}) or {}).get("price") or {}).get("timestamp", "")
            out["ts_shamsi"] = (ts[11:19] if len(ts) >= 19 else ts) + " (لحظه‌ای)"
            out["inputs"] = {
                "dollar_toman": dollar_rial / 10 if pd.notna(dollar_rial) else np.nan,
                "dollar_change": _fmt_chg(((mkt.get("USD", {}) or {}).get("price") or {}).get("changePercent")),
                "ons_usd": ons_usd,
                "ons_change": _fmt_chg(((mkt.get("انس طلا", {}) or {}).get("price") or {}).get("changePercent")),
                "geram18_toman": g18_rial / 10 if pd.notna(g18_rial) else np.nan,
                "geram24_toman": g24_rial / 10 if pd.notna(g24_rial) else np.nan,
                "parity_toman": parity_pure / 10 if pd.notna(parity_pure) else np.nan,
            }
            for sym, name, group in ETFBAZ_GOLD_ROWS:
                it = mkt.get(sym)
                if not it:
                    continue
                p = it.get("price") or {}
                close = _to_float(p.get("close"))
                val = _to_float(it.get("value"))
                bub = _to_float(it.get("bubble"))
                rows.append({
                    "name": name, "group": group,
                    "market_toman": close / 10 if pd.notna(close) else np.nan,
                    "intrinsic_toman": val / 10 if (pd.notna(val) and val > 0) else np.nan,
                    "bubble_pct": bub if pd.notna(bub) else np.nan,
                    "change_pct": _fmt_chg(p.get("changePercent")),
                    "note": "قیمت و حباب لحظه‌ای (etfbaz)",
                })
        else:
            # ══ مسیر جایگزین: tgju (روزانه) ══
            out["source"] = "tgju (روزانه)"
            dollar = _tgju_latest("price_dollar_rl")
            ons = _tgju_latest("ons")
            g18 = _tgju_latest("geram18")
            g24 = _tgju_latest("geram24")
            mesghal = _tgju_latest("mesghal")
            if dollar and g24:
                dollar_rial = dollar["close_rial"]
                g24_rial = g24["close_rial"]
                ons_usd = ons["close_rial"] if ons else np.nan
                parity_pure = (ons_usd / OUNCE_GRAMS * dollar_rial) if ons else np.nan
                out["ts_shamsi"] = dollar.get("date_shamsi")
                out["inputs"] = {
                    "dollar_toman": dollar["close_toman"],
                    "dollar_change": dollar.get("change_pct", ""),
                    "ons_usd": ons_usd,
                    "ons_change": ons.get("change_pct", "") if ons else "",
                    "geram18_toman": g18["close_toman"] if g18 else np.nan,
                    "geram24_toman": g24["close_toman"],
                    "parity_toman": parity_pure / 10 if ons else np.nan,
                }
                if mesghal and ons:
                    pure_per_mesghal = mesghal["close_rial"] / g24_rial
                    intrinsic_mesghal = parity_pure * pure_per_mesghal
                    rows.append({
                        "name": "طلای آبشده (مثقال)", "group": "آبشده",
                        "market_toman": mesghal["close_toman"],
                        "intrinsic_toman": intrinsic_mesghal / 10,
                        "bubble_pct": (mesghal["close_rial"] / intrinsic_mesghal - 1) * 100,
                        "change_pct": mesghal.get("change_pct", ""),
                        "note": "نسبت به انس جهانی × دلار آزاد",
                    })
                for name, spec in COIN_SPECS.items():
                    d = _tgju_latest(spec["sym"])
                    if not d:
                        continue
                    pure_grams = spec["weight"] * spec["ayar"] / 1000.0
                    intrinsic_rial = pure_grams * g24_rial
                    rows.append({
                        "name": name, "group": "سکه",
                        "market_toman": d["close_toman"],
                        "intrinsic_toman": intrinsic_rial / 10,
                        "bubble_pct": (d["close_rial"] / intrinsic_rial - 1) * 100,
                        "change_pct": d.get("change_pct", ""),
                        "note": f"طلای خالص ≈ {pure_grams:.3f} گرم",
                    })

        # ── صندوق‌های طلا/نقره از TSETMC (مشترک هر دو مسیر) ──
        # هر صندوق در try مستقل است تا خطای یکی، ردیف‌های موفق طلا/سکه را از بین نبرد.
        for name, spec in TSETMC_FUNDS.items():
            try:
                f = _tsetmc_fund(spec["ins"])
                nav = f.get("nav")
                mkt = f.get("price") or f.get("close")     # اگر معامله‌ای نبود، پایانی
                if not nav or not mkt or pd.isna(nav) or pd.isna(mkt) or nav <= 0:
                    rows.append({
                        "name": name, "group": f"صندوق {spec['asset']}",
                        "market_toman": (mkt / 10) if mkt else np.nan,
                        "intrinsic_toman": (nav / 10) if nav else np.nan,
                        "bubble_pct": np.nan, "change_pct": "",
                        "note": "داده TSETMC در دسترس نیست",
                    })
                    continue
                rows.append({
                    "name": name,
                    "group": f"صندوق {spec['asset']}",
                    "market_toman": mkt / 10,
                    "intrinsic_toman": nav / 10,
                    "bubble_pct": (mkt / nav - 1) * 100,
                    "change_pct": "",
                    "note": "حباب نسبت به NAV ابطال",
                })
            except Exception as e:  # noqa: BLE001
                print(f"[fund {name}] error: {e}")
                rows.append({
                    "name": name, "group": f"صندوق {spec['asset']}",
                    "market_toman": np.nan, "intrinsic_toman": np.nan,
                    "bubble_pct": np.nan, "change_pct": "",
                    "note": "داده TSETMC در دسترس نیست",
                })

        out["rows"] = rows
        out["ok"] = len(rows) > 0
    except Exception as e:  # noqa: BLE001
        out["error"] = str(e)
    return out


def parse_shamsi_date(s: str):
    """'1405/03/05' → (1405, 3, 5)"""
    m = re.match(r"(\d{3,4})[/-](\d{1,2})[/-](\d{1,2})", str(s))
    if not m:
        return None
    return int(m.group(1)), int(m.group(2)), int(m.group(3))


def forward_month_labels(start_shamsi: str, n_months: int):
    """
    از تاریخ شمسی فعلی، برچسب ماه‌های آتی را می‌سازد.
    خروجی: لیست رشته مثل ['خرداد ۱۴۰۵', 'تیر ۱۴۰۵', ...]
    """
    parsed = parse_shamsi_date(start_shamsi)
    if not parsed:
        return [f"+{i}" for i in range(1, n_months + 1)]
    year, month, _ = parsed
    labels = []
    for _ in range(n_months):
        month += 1
        if month > 12:
            month = 1
            year += 1
        labels.append(f"{PERSIAN_MONTHS[month - 1]} {year}")
    return labels


@lru_cache(maxsize=2)
def _b64_file(path: str) -> str:
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode()


def logo_data_uri(white: bool = False) -> str:
    """data URI لوگوی برند (سفید برای پس‌زمینه سرمه‌ای، سرمه‌ای برای روشن)."""
    path = LOGO_WHITE if white else LOGO_NAVY
    if not os.path.exists(path):
        return ""
    return f"data:image/png;base64,{_b64_file(path)}"


# ────────────────────────────────────────────────────────────────────────────
# فونت Pelak + تم هویت بصری برند آرش
# ────────────────────────────────────────────────────────────────────────────
@lru_cache(maxsize=1)
def brand_css() -> str:
    """CSS کامل: فونت Pelak (خانواده کامل) + رنگ‌بندی برند روی کل داشبورد."""
    faces = []
    for fname, weight in _PELAK_WEIGHTS.items():
        p = os.path.join(FONT_DIR, fname)
        if os.path.exists(p):
            b64 = _b64_file(p)
            faces.append(
                "@font-face{font-family:'Pelak';"
                f"font-weight:{weight};font-style:normal;font-display:swap;"
                f"src:url(data:font/woff2;base64,{b64}) format('woff2');}}"
            )
    if faces:
        font_import = "".join(faces)
        family = "'Pelak', 'Vazirmatn', Tahoma, sans-serif"
    else:
        font_import = ("@import url('https://cdn.jsdelivr.net/gh/rastikerdar/"
                       "vazirmatn@v33.003/Vazirmatn-font-face.css');")
        family = "'Vazirmatn', Tahoma, sans-serif"

    b = BRAND
    return f"""
    <style>
    {font_import}
    :root {{
        --navy:{b['navy']}; --navy-deep:{b['navy_deep']}; --gold:{b['gold']};
        --gold-light:{b['gold_light']}; --cream:{b['cream']}; --line:{b['line']};
    }}
    html, body, [class*="css"], .stMarkdown, .stMetric, .stButton, button,
    h1, h2, h3, h4, h5, p, label, span, div, .stSelectbox, .stSlider, .stRadio {{
        font-family: {family} !important;
    }}
    .stApp {{ direction: rtl; background: {b['bg']}; }}
    .stMarkdown, .stMetric, h1, h2, h3, h4 {{ text-align: right; }}
    h1, h2, h3 {{ font-weight: 900 !important; color: {b['navy']}; }}
    .stSlider > div, .stSelectbox > div, .stRadio > div {{ direction: ltr; }}

    /* نوار کناری سرمه‌ای */
    section[data-testid="stSidebar"] {{ background: {b['navy_deep']}; }}
    section[data-testid="stSidebar"] label,
    section[data-testid="stSidebar"] p,
    section[data-testid="stSidebar"] .stMarkdown,
    section[data-testid="stSidebar"] [data-testid="stWidgetLabel"],
    section[data-testid="stSidebar"] [data-testid="stMarkdownContainer"] {{ color: #fff !important; }}
    section[data-testid="stSidebar"] h1,
    section[data-testid="stSidebar"] h3 {{ color: {b['gold_light']} !important; }}

    /* selectbox و number_input داخل سایدبار: متن داخل کادر باید تیره باشد */
    section[data-testid="stSidebar"] [data-baseweb="select"] *,
    section[data-testid="stSidebar"] [data-baseweb="input"] *,
    section[data-testid="stSidebar"] input,
    section[data-testid="stSidebar"] [role="combobox"],
    section[data-testid="stSidebar"] [role="listbox"] *,
    section[data-testid="stSidebar"] [data-baseweb="popover"] * {{
        color: {b['text']} !important;
    }}
    section[data-testid="stSidebar"] [data-baseweb="select"] > div {{
        background: #fff !important; border: 1px solid {b['gold_light']} !important;
    }}
    section[data-testid="stSidebar"] input {{
        background: #fff !important; border: 1px solid {b['gold_light']} !important;
    }}
    /* expander داخل سایدبار */
    section[data-testid="stSidebar"] [data-testid="stExpander"] summary {{
        color: {b['gold_light']} !important;
    }}

    /* کارت‌های متریک با حاشیه طلایی */
    [data-testid="stMetric"] {{
        background: #fff; border: 1px solid {b['line']};
        border-top: 3px solid {b['gold']}; border-radius: 10px;
        padding: 16px 18px; box-shadow: 0 4px 14px rgba(30,58,138,.06);
    }}
    [data-testid="stMetricValue"] {{ color: {b['navy']}; font-weight: 900; }}
    [data-testid="stMetricLabel"] {{ color: {b['mute']}; }}

    /* تب‌ها */
    .stTabs [data-baseweb="tab-list"] {{ direction: rtl; gap: 4px; border-bottom: 1px solid {b['line']}; }}
    .stTabs [data-baseweb="tab"] {{ font-weight: 600; color: {b['mute']}; }}
    .stTabs [aria-selected="true"] {{ color: {b['navy']} !important; border-bottom-color: {b['gold']} !important; }}

    /* هدر برند */
    .brand-hero {{
        background: linear-gradient(135deg, {b['navy_deep']} 0%, {b['navy']} 100%);
        border-radius: 14px; padding: 22px 32px; margin-bottom: 18px;
        display: flex; align-items: center; gap: 22px; position: relative;
        overflow: hidden; border-right: 5px solid {b['gold']};
        box-shadow: 0 12px 38px rgba(13,31,74,.22);
    }}
    .brand-hero::before {{
        content:''; position:absolute; top:-60%; left:-8%; width:45%; height:200%;
        background: radial-gradient(circle, rgba(245,208,122,.18), transparent 65%);
    }}
    .brand-hero img {{ height: 78px; width:auto; position:relative; z-index:1; }}
    .brand-hero .bh-div {{ width:2px; align-self:stretch; margin:6px 0;
        background:linear-gradient(180deg,transparent,{b['gold_light']} 30%,{b['gold_light']} 70%,transparent); z-index:1; }}
    .brand-hero .bh-tx {{ position:relative; z-index:1; }}
    .brand-hero h1 {{ color:#fff !important; font-size:30px; font-weight:900; margin:0; line-height:1.1; }}
    .brand-hero h1 .g {{ color:{b['gold_light']}; }}
    .brand-hero .bh-sub {{ color:{b['gold_light']}; font-size:13px; letter-spacing:.12em; margin-top:8px; font-weight:500; }}
    </style>
    """


# سازگاری با کد قبلی
def font_css() -> str:
    return brand_css()
