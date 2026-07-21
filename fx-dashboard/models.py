"""
مدل‌های تعیین نرخ ارز در سه لایه (Tier):

  Tier 1 — پایه:
    * PPP (برابری قدرت خرید) — فرم تجمعی دقیق
    * Monetary Basic — (ΔM_ir − ΔM_us) − (ΔY_ir − ΔY_us)

  Tier 2 — میانی:
    * Monetary + Velocity — افزودن سرعت گردش پول (V) برای ایران پساتحریم
    * Frenkel–Bilson — مدل پولی با تفاضل نرخ بهره

  Tier 3 — پیشرفته:
    * BEER (Behavioral Equilibrium ER) — رگرسیون لگاریتمی روی بنیادها

هر مدل یک دیکشنری `MODEL_INFO` دارد که فرمول، فروض و محدودیت‌های آن را در
UI نمایش می‌دهد.

نکته متدولوژیک:
  برآورد رگرسیون‌ها روی فرکانس بومی هر سری انجام می‌شود. درون‌یابی برای
  تراز کردن داده فقط در لایه نمایش انجام می‌شود.
"""
import numpy as np
import pandas as pd

from data_sources import forward_month_labels, parse_shamsi_date


# ════════════════════════════════════════════════════════════════════════════
# اطلاعات متادیتای مدل‌ها — در تب «روش‌شناسی» نمایش داده می‌شود
# ════════════════════════════════════════════════════════════════════════════
MODEL_INFO = {
    "ppp": {
        "tier": 1,
        "name": "PPP — برابری قدرت خرید",
        "formula": r"E_t = E_0 \cdot \prod_{i=1}^{t} \frac{1+\pi_{ir,i}}{1+\pi_{us,i}}",
        "assumptions": [
            "قانون قیمت یکسان (Law of One Price) برای کالاهای قابل تجارت",
            "نبود هزینه حمل، مالیات تجاری و تحریم",
            "ثبات نسبی سبد مصرفی دو کشور",
        ],
        "limits_iran": [
            "وجود ارز ترجیحی، یارانه‌ها و قیمت‌گذاری دستوری شاخص قیمت رسمی را تحریف می‌کند.",
            "تحریم، تجارت آزاد را قطع کرده — قانون قیمت یکسان نقض می‌شود.",
            "PPP فقط لنگر بلندمدت است؛ در کوتاه‌مدت می‌تواند صدها درصد منحرف باشد.",
        ],
    },
    "monetary_basic": {
        "tier": 1,
        "name": "Monetary Basic — رویکرد پولی پایه",
        "formula": r"\Delta E = (\Delta M_{ir} - \Delta M_{us}) - (\Delta Y_{ir} - \Delta Y_{us})",
        "assumptions": [
            "ثبات سرعت گردش پول (V)",
            "تابع تقاضای پایدار پول",
            "خنثایی پول در بلندمدت",
        ],
        "limits_iran": [
            "سرعت گردش پول در ایران پس از ۱۳۹۷ بی‌ثبات شده (V↑ به‌خاطر فرار از ریال).",
            "تابع تقاضای پول در شرایط تورم بالا ناپایدار است.",
            "بخشی از نقدینگی به دلار/طلا/کالا منتقل می‌شود → اثر روی E بزرگ‌تر از پیش‌بینی است.",
        ],
    },
    "monetary_velocity": {
        "tier": 2,
        "name": "Monetary + Velocity — افزوده‌شده با سرعت پول",
        "formula": r"\Delta E = \Delta M - \Delta M^* - (\Delta Y - \Delta Y^*) + \Delta V",
        "assumptions": [
            "اتحاد مقداری پول: MV = PY",
            "ΔV قابل برآورد یا پارامتری شدن",
        ],
        "limits_iran": [
            "ΔV قابل مشاهده مستقیم نیست — باید از انتظارات تورمی یا داده پنل استخراج شود.",
            "حساس به تعریف پول (M1 یا M2).",
        ],
    },
    "frenkel_bilson": {
        "tier": 2,
        "name": "Frenkel–Bilson — مدل پولی با نرخ بهره",
        "formula": r"e_t = \alpha(m - m^*) - \varphi(y - y^*) + \lambda(i - i^*)",
        "assumptions": [
            "قیمت‌ها انعطاف‌پذیر (Flexible Price)",
            "تفاضل نرخ بهره منعکس‌کننده انتظارات تورمی است",
            "ضرایب α, φ, λ از OLS قابل برآورد",
        ],
        "limits_iran": [
            "نرخ بهره بازار بین‌بانکی در ایران اغلب سرکوب‌شده — سیگنال قوی نمی‌دهد.",
            "تفاضل i − i* بزرگ ولی پایدار است → ضریب λ کم‌اعتبار می‌شود.",
        ],
    },
    "ecm": {
        "tier": 3,
        "name": "ECM — مدل تصحیح خطا (هم‌انباشتگی)",
        "formula": r"\Delta e_t = c + \alpha\,(e_{t-1}-\beta' x_{t-1}) + \sum_i \gamma_i \Delta x_{i,t} + \varepsilon_t",
        "assumptions": [
            "نرخ ارز و بنیادها (نقدینگی، تولید، نفت) هم‌انباشته‌اند (cointegrated)",
            "خطای تعادلی I(0) و مانا است",
            "سرعت تعدیل α منفی است (بازگشت به تعادل بلندمدت)",
        ],
        "limits_iran": [
            "اگر آزمون Engle-Granger هم‌انباشتگی را رد کند، رابطهٔ بلندمدت بی‌اعتبار است.",
            "گسست‌های ساختاری ۱۳۹۰/۱۳۹۷ ضرایب را ناپایدار می‌کنند.",
            "تعداد کم مشاهدهٔ سالانه، توان آزمون هم‌انباشتگی را پایین می‌آورد.",
        ],
    },
    "beer": {
        "tier": 3,
        "name": "BEER — نرخ تعادلی رفتاری (Clark–MacDonald)",
        "formula": r"\log E_t = \beta_0 + \beta_1 \log\!\left(\frac{CPI_{ir}}{CPI_{us}}\right) + \beta_2 \log(oil) + \beta_3 NFA + \varepsilon",
        "assumptions": [
            "رابطه بلندمدت همگرایی میان نرخ ارز و بنیادها",
            "بنیادها I(1) و خطا I(0) هستند (cointegration)",
        ],
        "limits_iran": [
            "گسست ساختاری در ۱۳۹۰، ۱۳۹۷ — برآورد روی کل بازه نامعتبر است.",
            "NFA دقیق منتشر نمی‌شود؛ از پراکسی صادرات نفت یا خروج سرمایه استفاده می‌شود.",
            "ضرایب در زیربازه‌های مختلف فرق می‌کنند → باید TVP یا rolling برآورد شود.",
        ],
    },
}


# ════════════════════════════════════════════════════════════════════════════
# توابع کمکی
# ════════════════════════════════════════════════════════════════════════════
def annual_market_rate(history: pd.DataFrame) -> pd.Series:
    """از تاریخچه روزانه tgju، میانگین سالانه نرخ دلار (تومان) را می‌سازد."""
    if history is None or history.empty:
        return pd.Series(dtype=float)
    h = history.copy()
    h["ys"] = h["date_shamsi"].apply(
        lambda s: parse_shamsi_date(s)[0] if parse_shamsi_date(s) else np.nan
    )
    h = h.dropna(subset=["ys"])
    return h.groupby("ys")["close_toman"].mean().sort_index()


def annual_high_low(history: pd.DataFrame) -> pd.DataFrame:
    """از تاریخچه روزانه tgju، کف/سقف/میانگین سالانه نرخ دلار (تومان) را می‌سازد.

    خروجی: DataFrame با ایندکس سال شمسی و ستون‌های:
        low  = کمینهٔ low_toman آن سال
        high = بیشینهٔ high_toman آن سال
        mean = میانگین close_toman (سازگار با annual_market_rate)

    گریس‌فول: اگر history خالی باشد یا ستون‌های لازم نباشد (مثلاً tgju قطع
    باشد و low/high در دست نباشد)، DataFrame خالی با همان ستون‌ها برمی‌گردد.
    """
    cols = ["low", "high", "mean"]
    if history is None or history.empty:
        return pd.DataFrame(columns=cols)
    needed = {"date_shamsi", "low_toman", "high_toman", "close_toman"}
    if not needed.issubset(history.columns):
        return pd.DataFrame(columns=cols)
    h = history.copy()
    h["ys"] = h["date_shamsi"].apply(
        lambda s: parse_shamsi_date(s)[0] if parse_shamsi_date(s) else np.nan
    )
    h = h.dropna(subset=["ys"])
    if h.empty:
        return pd.DataFrame(columns=cols)
    g = h.groupby("ys")
    out = pd.DataFrame({
        "low": g["low_toman"].min(),
        "high": g["high_toman"].max(),
        "mean": g["close_toman"].mean(),
    }).sort_index()
    out.index.name = "ys"
    return out


# ════════════════════════════════════════════════════════════════════════════
# TIER 1 — مدل‌های پایه
# ════════════════════════════════════════════════════════════════════════════
def ppp_series(df, base_year, base_rate, infl_col="infl_cbi", usa_col="usa_infl"):
    """
    PPP تجمعی به فرم ضربی دقیق (نه تقریب نمایی):
        E_t = E_base × Π (1 + π_ir) / (1 + π_us)
    """
    d = df.set_index("year_shamsi")
    years = sorted(y for y in d.index if y >= base_year)
    out = {base_year: base_rate}
    rate = base_rate
    for y in years:
        if y == base_year:
            continue
        pi_ir = d.loc[y, infl_col] / 100.0
        pi_us = d.loc[y, usa_col] / 100.0
        if pd.isna(pi_ir):
            pi_ir = 0.0
        if pd.isna(pi_us):
            pi_us = 0.0
        rate = rate * (1 + pi_ir) / (1 + pi_us)
        out[y] = rate
    return pd.Series(out).sort_index()


def ppp_multi_base(df, base_years_with_rates: dict, infl_col="infl_cbi", usa_col="usa_infl"):
    """
    PPP با میانگین‌گیری از چند سال پایه — هر سال پایه یک مسیر مستقل می‌سازد،
    سپس میانگین (هندسی) سال‌به‌سال محاسبه می‌شود. این روش حساسیت به انتخاب
    سال پایه را کاهش می‌دهد (در داده اکسل کاربر ۹ سال پایه از پیش تعریف شده بود).

    Args:
        df: داده تاریخی سالانه
        base_years_with_rates: {year_shamsi: base_rate_toman, …}

    Returns:
        Tuple(mean_series, dict_of_individual_series)
    """
    individual = {}
    for by, br in base_years_with_rates.items():
        try:
            individual[by] = ppp_series(df, by, br, infl_col=infl_col, usa_col=usa_col)
        except Exception:  # noqa: BLE001
            continue
    if not individual:
        return pd.Series(dtype=float), {}
    all_idx = sorted(set().union(*[s.index for s in individual.values()]))
    rows = []
    for y in all_idx:
        vals = [s.loc[y] for s in individual.values() if y in s.index and not pd.isna(s.loc[y])]
        if vals:
            # میانگین هندسی برای سری‌های ضربی مناسب‌تر است
            rows.append(np.exp(np.mean(np.log(vals))))
        else:
            rows.append(np.nan)
    mean_series = pd.Series(rows, index=all_idx, name="ppp_mean").dropna()
    return mean_series, individual


def monetary_series(df, base_year, base_rate):
    """
    Monetary Basic تجمعی:
        ΔE% = (ΔM_iran − ΔM_usa) − (ΔY_iran − ΔY_usa)
    """
    d = df.set_index("year_shamsi")
    years = sorted(y for y in d.index if y >= base_year)
    out = {base_year: base_rate}
    rate = base_rate
    for y in years:
        if y == base_year:
            continue
        vals = [d.loc[y, c] for c in ("m2_growth", "usa_m2_growth", "gdp_growth", "usa_gdp_growth")]
        if any(pd.isna(v) for v in vals):
            out[y] = rate
            continue
        m_ir, m_us, g_ir, g_us = vals
        delta_e = ((m_ir - m_us) - (g_ir - g_us)) / 100.0
        rate = rate * (1 + delta_e)
        out[y] = rate
    return pd.Series(out).sort_index()


# ════════════════════════════════════════════════════════════════════════════
# TIER 2 — مدل‌های میانی
# ════════════════════════════════════════════════════════════════════════════
def monetary_velocity_series(df, base_year, base_rate, delta_v_pct: float = 0.0):
    """
    رویکرد پولی با افزودن سرعت گردش پول (ΔV سالانه ثابت داده‌شده توسط کاربر):
        ΔE = (ΔM − ΔM*) − (ΔY − ΔY*) + ΔV
    """
    d = df.set_index("year_shamsi")
    years = sorted(y for y in d.index if y >= base_year)
    out = {base_year: base_rate}
    rate = base_rate
    dv = delta_v_pct / 100.0
    for y in years:
        if y == base_year:
            continue
        vals = [d.loc[y, c] for c in ("m2_growth", "usa_m2_growth", "gdp_growth", "usa_gdp_growth")]
        if any(pd.isna(v) for v in vals):
            out[y] = rate
            continue
        m_ir, m_us, g_ir, g_us = vals
        delta_e = ((m_ir - m_us) - (g_ir - g_us)) / 100.0 + dv
        rate = rate * (1 + delta_e)
        out[y] = rate
    return pd.Series(out).sort_index()


def frenkel_bilson_series(df, base_year, base_rate,
                          i_ir_col: str = None, i_us_col: str = None,
                          lambda_coef: float = 0.5):
    """
    Frenkel-Bilson Flexible-Price با تفاضل نرخ بهره.
    اگر ستون نرخ بهره موجود نباشد، به Monetary Basic فرومی‌افتد.
        e = α(m − m*) − φ(y − y*) + λ(i − i*)
    اینجا α=1, φ=1 به‌صورت پیش‌فرض و λ توسط کاربر تنظیم می‌شود.
    """
    d = df.set_index("year_shamsi")
    years = sorted(y for y in d.index if y >= base_year)
    out = {base_year: base_rate}
    rate = base_rate
    has_rates = (i_ir_col in d.columns) and (i_us_col in d.columns)
    for y in years:
        if y == base_year:
            continue
        vals = [d.loc[y, c] for c in ("m2_growth", "usa_m2_growth", "gdp_growth", "usa_gdp_growth")]
        if any(pd.isna(v) for v in vals):
            out[y] = rate
            continue
        m_ir, m_us, g_ir, g_us = vals
        delta = ((m_ir - m_us) - (g_ir - g_us)) / 100.0
        if has_rates:
            i_ir = d.loc[y, i_ir_col]
            i_us = d.loc[y, i_us_col]
            if not (pd.isna(i_ir) or pd.isna(i_us)):
                delta += lambda_coef * (i_ir - i_us) / 100.0
        rate = rate * (1 + delta)
        out[y] = rate
    return pd.Series(out).sort_index()


# ════════════════════════════════════════════════════════════════════════════
# TIER 3 — BEER (در ماژول econometrics.py پیاده شده — اینجا wrapper)
# ════════════════════════════════════════════════════════════════════════════
def beer_series(df, market: pd.Series):
    """رگرسیون لگاریتمی نرخ بازار روی CPI نسبی و قیمت/درآمد نفت."""
    from econometrics import beer_equilibrium
    return beer_equilibrium(df, market)


# ════════════════════════════════════════════════════════════════════════════
# ECM — مدل تصحیح خطا روی بردار هم‌انباشتگی (نرخ ذاتی ساختاری)
# ════════════════════════════════════════════════════════════════════════════
def ecm_series(df, market: pd.Series, x_cols=("ln_m2_ir", "ln_gdp_ir", "ln_oil")):
    """
    نرخ تعادلی بلندمدت ECM = مقدار برازش‌شدهٔ رابطهٔ هم‌انباشتهٔ Engle-Granger
    میان log(E) و بنیادهای پولی/حقیقی/نفتی.

    Returns:
        Tuple(fitted_series, info_dict)
        info شامل: ok, is_cointegrated, adf_stat, eg_cv_5, alpha, alpha_t, r2, n
    سری برگشتی attrs هم‌انباشتگی را حمل می‌کند تا UI صادقانه هشدار دهد.
    """
    from data_sources import cointegration_inputs
    from econometrics import ecm_fit
    frame = cointegration_inputs(df, market)
    xs = [c for c in x_cols if c in frame.columns]
    if "ln_E" not in frame.columns or len(xs) < 1:
        return pd.Series(dtype=float), {"ok": False, "reason": "ورودی ناکافی"}
    res = ecm_fit(frame, "ln_E", xs)
    if not res.get("ok"):
        return pd.Series(dtype=float), res
    fitted = res["fitted"].rename("ecm")
    info = {
        "ok": True,
        "is_cointegrated": res.get("is_cointegrated"),
        "adf_stat": res.get("adf_stat"),
        "eg_cv_5": res.get("eg_cv_5"),
        "alpha": res.get("alpha"),
        "alpha_t": res.get("alpha_t"),
        "r2": res.get("r2"),
        "n": res.get("n"),
        "x_cols": xs,
    }
    fitted.attrs.update(info)
    return fitted, info


# ════════════════════════════════════════════════════════════════════════════
# Ensemble — ترکیب مدل‌ها با وزن معکوس خطای backtest
# ════════════════════════════════════════════════════════════════════════════
def ensemble_valuation(valuations: dict, errors: dict = None) -> pd.Series:
    """
    ترکیب چند سری ارزش‌گذاری. اگر errors (مثلاً RMSE هر مدل از backtest) داده شود،
    وزن هر مدل ∝ 1/خطا (مدل دقیق‌تر وزن بیشتر). در غیر این صورت میانگین هندسی ساده.

    Args:
        valuations: {نام_مدل: سری ارزش ذاتی}
        errors: {نام_مدل: خطای مثبت (RMSE/MAPE)} — اختیاری.

    Returns:
        سری ترکیبی (میانگین هندسی وزن‌دار، مناسب سری‌های ضربی نرخ ارز).
    """
    series = {k: v for k, v in valuations.items()
              if v is not None and not v.empty}
    if not series:
        return pd.Series(dtype=float)
    dfm = pd.DataFrame(series)

    if errors:
        w = {}
        for k in dfm.columns:
            e = errors.get(k, np.nan)
            w[k] = 1.0 / e if (e is not None and not pd.isna(e) and e > 0) else 0.0
        wsum = sum(w.values())
        if wsum <= 0:
            w = {k: 1.0 / len(dfm.columns) for k in dfm.columns}
        else:
            w = {k: v / wsum for k, v in w.items()}
    else:
        w = {k: 1.0 / len(dfm.columns) for k in dfm.columns}

    # میانگین هندسی وزن‌دار: exp(Σ w_i · ln x_i)
    ln = np.log(dfm.where(dfm > 0))
    weighted = sum(ln[k] * w[k] for k in dfm.columns)
    return np.exp(weighted).rename("ensemble")


# ════════════════════════════════════════════════════════════════════════════
# پیش‌بینی آینده‌نگر (Point Path) — fan chart در forecast.py
# ════════════════════════════════════════════════════════════════════════════
def forecast_forward(start_rate_toman, start_shamsi, n_months,
                     infl_iran, infl_usa, m2_iran, m2_usa, gdp_iran, gdp_usa,
                     delta_v_annual_pct=0.0):
    """
    پیش‌بینی ماهانه آینده‌نگر با هر دو مدل (PPP و پولی).
    مرکب ماهانه از نرخ‌های سالانه ساخته می‌شود.

    Returns: DataFrame(month_label, ppp_toman, monetary_toman)
    """
    ppp_m = ((1 + infl_iran / 100) / (1 + infl_usa / 100)) ** (1 / 12) - 1
    annual_mon = ((m2_iran - m2_usa) - (gdp_iran - gdp_usa) + delta_v_annual_pct) / 100.0
    mon_m = (1 + annual_mon) ** (1 / 12) - 1 if annual_mon > -1 else 0.0

    labels = forward_month_labels(start_shamsi, n_months)
    ppp_path, mon_path = [], []
    p, mm = start_rate_toman, start_rate_toman
    for _ in range(n_months):
        p *= (1 + ppp_m)
        mm *= (1 + mon_m)
        ppp_path.append(p)
        mon_path.append(mm)

    return pd.DataFrame({
        "month_label": labels,
        "ppp_toman": ppp_path,
        "monetary_toman": mon_path,
    })


def bubble_gap(market: pd.Series, model: pd.Series) -> pd.Series:
    """درصد انحراف نرخ بازار از ارزش ذاتی مدل."""
    a, b = market.align(model, join="inner")
    mask = b.notna() & (b != 0)
    return ((a[mask] - b[mask]) / b[mask] * 100).round(1)
