"""
داشبورد تحلیل و پیش‌بینی نرخ ارز ایران
مدل‌ها: PPP (Cassel) + رویکرد پولی (Frenkel-Mussa) | نرخ زنده: tgju | پیش‌بینی ماهانه
اجرا: streamlit run app.py
"""
import json
import sys

import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

# روی ویندوز stdout پیش‌فرض cp1252 است؛ چاپ پیام‌های فارسی هنگام خطا کرش می‌کند.
# خروجی را UTF-8 می‌کنیم تا لاگ‌های منابع داده هیچ‌وقت برنامه را نیندازند.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except Exception:  # noqa: BLE001
        pass

import assistant
import auth_gate
import backtest as bt
import data_sources as ds
import econometrics as ec
import forecast as fct
import gemini
import models as m
import psy
import publication as pub
from sensitivity import SensitivityAnalyzer

st.set_page_config(page_title="داشبورد نرخ ارز ایران | آرش صفری", layout="wide", page_icon="📊")

# دروازهٔ دسترسی — فقط وقتی FX_REQUIRE_AUTH=1 باشد (یعنی روی هاست، نه لوکال).
# باید پیش از هر واکشیِ داده اجرا شود تا بازدیدکنندهٔ غیرمجاز هیچ کاری راه نیندازد.
auth_gate.require_access()

st.markdown(ds.brand_css(), unsafe_allow_html=True)

C = ds.BRAND


def brand_fig(fig, height=450, legend_bottom=True, toman_yaxis=True):
    """قالب یکنواخت برند روی نمودار Plotly + فرمت‌بندی تومان روی محور Y."""
    fig.update_layout(
        height=height, template="plotly_white",
        font=dict(family=ds.PLOT_FONT, color=C["text"], size=15),
        colorway=ds.PLOT_COLORS,
        paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="#fff",
        margin=dict(t=40, b=20, l=20, r=20),
        hoverlabel=dict(font_size=14, font_family=ds.PLOT_FONT),
    )
    if legend_bottom:
        fig.update_layout(legend=dict(orientation="h", y=-0.22, x=1, xanchor="right",
                                      font=dict(size=14)))
    fig.update_xaxes(gridcolor=C["line"], zerolinecolor=C["line"],
                     tickfont=dict(size=13), title_font=dict(size=14))
    fig.update_yaxes(gridcolor=C["line"], zerolinecolor=C["line"],
                     tickfont=dict(size=13), title_font=dict(size=14))
    if toman_yaxis:
        fig.update_yaxes(tickformat=",.0f", ticksuffix=" ﺗﻮﻣﺎن", separatethousands=True)
    return fig


# ────────────────────────────────────────────────────────────────────────────
# داده‌ها (کش‌شده)
# ────────────────────────────────────────────────────────────────────────────
@st.cache_data(show_spinner="بارگذاری داده تاریخی…")
def get_hist():
    return ds.load_excel_data()


@st.cache_data(ttl=3600, show_spinner="دریافت نرخ زنده از tgju…")
def get_live():
    return ds.fetch_live_dollar()


@st.cache_data(ttl=300, show_spinner="محاسبهٔ حباب لحظه‌ای طلا، سکه و صندوق‌ها…")
def get_bubbles():
    return ds.fetch_bubbles_snapshot()


@st.cache_data(show_spinner="بارگذاری داده‌ی بورس…")
def get_bourse():
    return ds.load_bourse_data()


@st.cache_data(show_spinner="شبیه‌سازی مقادیر بحرانی GSADF (Monte-Carlo)…")
def get_gsadf_cv(n, r0=0.25, B=299):
    return ec.simulate_gsadf_cv(int(n), r0=r0, B=B)


@st.cache_data(show_spinner="اجرای PSY و شبیه‌سازی مقادیر بحرانی (Monte-Carlo)…")
def get_psy(series: pd.Series):
    """
    آزمونِ PSY با CV شبیه‌سازی‌شده. علاوه بر کشِ استریملیت، psy.py خودش نتیجهٔ
    شبیه‌سازی را در `.psy_cache/` روی دیسک نگه می‌دارد.

    cv_step=1 و n_sim=999 عمدی‌اند و با شبیه‌سازی کالیبره شده‌اند (n=120، ۳۰۰
    مسیرِ تازهٔ قدم‌زدنِ تصادفی):

        cv_step=3, n_sim=199 → CV۹۵=۱٫۸۰ ⇒ نرخِ ردِ واقعی ~۱۱٪
        cv_step=1, n_sim=999 → CV۹۵=۱٫۹۴ ⇒ نرخِ ردِ واقعی ~۶٪  ✅
        (چندکِ ۹۵٪ تجربیِ ۳۰۰ مسیرِ مستقل = ۱٫۹۵)

    یعنی گامِ درشت‌تر سوپریمم را روی شبکهٔ تُنُک می‌گیرد و CV را پایین برآورد
    می‌کند؛ اندازهٔ آزمون دو برابر متورم می‌شود. هزینه با مسیرِ بردارشدهٔ
    psy._bsadf_k0 مسئله نیست (~۸۵× سریع‌تر).
    """
    return psy.psy_test(series, n_sim=999, seed=20250721, cv_step=1)


@st.cache_data(ttl=86400, show_spinner="دریافت داده ماهانه ایران از Google Sheet…")
def get_iran_monthly(url: str):
    return ds.fetch_iran_monthly_sheet(url) if url else pd.DataFrame()


@st.cache_data(show_spinner=False)
def monthly_fundamental(ppp_annual: pd.Series, usa_infl: pd.Series,
                        month_index: pd.Series) -> tuple:
    """
    ارزشِ بنیادیِ PPP را روی شبکهٔ **ماهانهٔ** نرخ بازار می‌سازد.

    توجه: `month_index` باید **pd.Series** از تاریخ‌ها باشد نه DatetimeIndex —
    st.cache_data نمی‌تواند DatetimeIndex را هش کند (UnhashableParamError).

    دو مسیر، به‌ترتیبِ اولویت:

    ۱) «cpi» — از **CPI ماهانهٔ واقعیِ ایران** (ds.load_cpi_monthly) و تورمِ
       ماهانهٔ آمریکا (پخشِ هندسیِ تورمِ سالانه: (1+π_us)^(1/12)). شاخصِ نسبیِ
       ماهانه ساخته می‌شود و سپس **به PPP سالانه بنچ‌مارک می‌شود**: برای هر سالِ
       شمسی ضریبِ تصحیح c_y = PPP_y ÷ میانگینِ ماهانهٔ شاخص محاسبه و فقط همین
       ضریبِ کند-حرکت لگاریتم-خطی درون‌یابی می‌گردد.

       چرا بنچ‌مارک لازم است: تورمِ فایلِ ماهانه با infl_cbi سالانهٔ داشبورد
       ناسازگار است — انباشتِ ۱۳۹۹/۰۱ تا ۱۴۰۵/۰۳ در ماهانه ×۱۲٫۳ و در سالانه
       ×۹٫۴ است (~۳۰٪ فاصله). بدونِ بنچ‌مارک، سطحِ بنیادیِ ماهانه تا ۴۲٪ از
       سری سالانهٔ خودِ داشبورد فاصله می‌گیرد و دو تبِ داشبورد دو حرفِ متضاد
       می‌زنند. با بنچ‌مارک، **سطح** از سری سالانه و **شکلِ درون‌سال** از CPI
       واقعی می‌آید — همان قاعدهٔ استانداردِ temporal disaggregation.

    ۲) «interp» — پس‌افتِ گریس‌فول وقتی CPI ماهانه نیست: درون‌یابیِ
       لگاریتم-خطیِ خودِ PPP سالانه. **این مسیر اطلاعاتِ درون‌سال نمی‌سازد**؛
       آمارهٔ BSADF هموارتر از حقیقت می‌شود و باید در مقاله ذکر شود.

    Returns:
        (سری بنیادی هم‌ایندکس با month_index، برچسبِ روش: "cpi" | "interp" | "")
    """
    if ppp_annual is None or len(ppp_annual) < 2 or month_index is None or len(month_index) == 0:
        return pd.Series(dtype=float), ""

    month_index = pd.DatetimeIndex(pd.Series(month_index).values)
    ppp_a = pd.Series(ppp_annual).dropna()
    ppp_a = ppp_a[ppp_a > 0]
    if len(ppp_a) < 2:
        return pd.Series(dtype=float), ""

    def _to_grid(s: pd.Series) -> pd.Series:
        """درون‌یابیِ لگاریتم-خطیِ زمانی روی شبکهٔ ماهانهٔ بازار."""
        s = s[s > 0].sort_index()
        if len(s) < 2:
            return pd.Series(dtype=float)
        grid = s.index.union(month_index)
        v = np.exp(np.log(s).reindex(grid).interpolate(method="time", limit_area="inside"))
        return v.reindex(month_index).dropna()

    # ── مسیر ۱: CPI ماهانهٔ واقعی، بنچ‌مارک‌شده به PPP سالانه ──
    cpi = ds.load_cpi_monthly()
    if not cpi.empty and len(cpi) >= 24:
        us = pd.Series(usa_infl).dropna() if usa_infl is not None else pd.Series(dtype=float)

        # تورمِ ماهانهٔ آمریکا از تورمِ سالانهٔ همان سالِ شمسی (پخشِ هندسی).
        # نبودِ سال ⇒ صفر: خطایش حداکثر ~۳٪ در سال است، در برابر تورمِ ~۵۰٪ ایران ناچیز.
        def _us_m(jy):
            v = us.get(int(jy), np.nan)
            return (1 + float(v) / 100) ** (1 / 12) if pd.notna(v) else 1.0

        us_fac = np.array([_us_m(jy) for jy in cpi["jy"]])
        rel = (cpi["cpi"].to_numpy() / us_fac.cumprod())
        rel = pd.Series(rel / rel[0], index=cpi.index)

        # ضریبِ تصحیحِ سالانه c_y = PPP_y ÷ میانگینِ سالانهٔ شاخصِ نسبی.
        # دو نکتهٔ ریز که خطای بنچ‌مارک را از ~۵٪ به ~۱٪ می‌رساند:
        #   • فقط سال‌های **کامل** (≥۶ ماه داده) لنگر می‌شوند؛ سالِ ناقصِ انتهایی
        #     میانگینش نمایندهٔ سال نیست و ضریبِ سالِ قبل را هم منحرف می‌کند.
        #   • لنگر روی **میانهٔ سال** (ماه ۷) می‌نشیند نه ماه ۱، چون c بین لنگرها
        #     لگاریتم-خطی درون‌یابی می‌شود و میانگینِ سال حوالیِ میانهٔ سال رخ می‌دهد.
        grp = pd.DataFrame({"rel": rel.to_numpy(), "jy": cpi["jy"].to_numpy()}).groupby("jy")["rel"]
        c = {}
        for jy, r in grp.mean().items():
            if jy in ppp_a.index and r > 0 and grp.count().loc[jy] >= 6:
                g0, _ = ds.shamsi_month_to_gregorian_range(int(jy), 7)
                c[pd.Timestamp(g0)] = float(ppp_a.loc[jy]) / float(r)
        if len(c) >= 2:
            c_s = pd.Series(c).sort_index()
            grid = rel.index.union(c_s.index)
            c_m = np.exp(np.log(c_s).reindex(grid).interpolate(method="time")
                         .ffill().bfill()).reindex(rel.index)
            fund = _to_grid(rel * c_m)
            if len(fund) >= 24:
                return fund, "cpi"

    # ── مسیر ۲: درون‌یابیِ لگاریتم-خطیِ PPP سالانه ──
    anchors = {}
    for jy, v in ppp_a.items():
        try:
            g0, _ = ds.shamsi_month_to_gregorian_range(int(jy), 1)
            anchors[pd.Timestamp(g0)] = float(v)
        except Exception:  # noqa: BLE001
            continue
    if len(anchors) < 2:
        return pd.Series(dtype=float), ""
    fund = _to_grid(pd.Series(anchors))
    return (fund, "interp") if not fund.empty else (pd.Series(dtype=float), "")


@st.cache_data(ttl=86400, show_spinner="دریافت داده آمریکا از FRED…")
def get_fred_bundle():
    """بسته داده FRED — CPI, M2, GDP, Fed Funds, Brent. در صورت خطا dict خالی."""
    out = {}
    for sid in ("CPIAUCSL", "M2SL", "DFF", "DCOILBRENTEU"):
        s = ds.fetch_fred(sid)
        if not s.empty:
            out[sid] = s
    return out


df = get_hist()
live = get_live()

# ────────────────────────────────────────────────────────────────────────────
# سناریوها
# ────────────────────────────────────────────────────────────────────────────
SCENARIOS = {
    "وضع موجود":  {"infl": 40, "infl_usa": 2.9, "m2": 30, "m2_usa": 5, "gdp": 3, "gdp_usa": 2.5, "oil": 75, "deficit": 20},
    "خوش‌بینانه": {"infl": 25, "infl_usa": 2.5, "m2": 22, "m2_usa": 5, "gdp": 6, "gdp_usa": 2.5, "oil": 95, "deficit": 8},
    "بدبینانه":   {"infl": 55, "infl_usa": 3.5, "m2": 45, "m2_usa": 5, "gdp": -2, "gdp_usa": 2.0, "oil": 50, "deficit": 35},
}

# ────────────────────────────────────────────────────────────────────────────
# لایهٔ کنترل اِیجنتیک — دستیار می‌تواند ورودی‌ها/تب/داده را تغییر دهد
# ────────────────────────────────────────────────────────────────────────────
# نگاشت فیلد منطقی → کلید ویجت در session_state، نوع، و بازهٔ مجاز
_AI_KEYMAP = {
    "scenario": "inp_scenario", "infl_iran": "inp_infl", "m2_iran": "inp_m2",
    "gdp_iran": "inp_gdp", "oil_price": "inp_oil", "deficit_pct": "inp_deficit",
    "horizon": "inp_horizon", "manual_rate": "manual_rate_input",
}
_AI_TYPES = {"infl_iran": float, "m2_iran": float, "gdp_iran": float,
             "oil_price": int, "deficit_pct": int, "horizon": int, "manual_rate": float}
_AI_RANGES = {"infl_iran": (5.0, 80.0), "m2_iran": (5.0, 60.0), "gdp_iran": (-10.0, 12.0),
              "oil_price": (30, 130), "deficit_pct": (0, 50), "horizon": (3, 36),
              "manual_rate": (1.0, 1e7)}
# نگاشت فیلد سناریویی → کلید SCENARIOS (برای ریست هنگام تغییر سناریو)
_SCEN_FIELDS = {"infl_iran": "infl", "m2_iran": "m2", "gdp_iran": "gdp",
                "oil_price": "oil", "deficit_pct": "deficit"}


def _coerce(field, value):
    """مقدار را به بازهٔ مجاز محدود و به نوع درست (int/float) تبدیل می‌کند."""
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    lo, hi = _AI_RANGES.get(field, (None, None))
    if lo is not None:
        v = max(lo, min(hi, v))
    return _AI_TYPES.get(field, float)(v)


def _apply_ai_actions(actions: dict) -> bool:
    """اقدام‌های دستیار را در state می‌گذارد؛ True اگر نیاز به rerun باشد."""
    if not actions:
        return False
    acted = False
    if actions.get("inputs"):
        st.session_state["_ai_pending"] = actions["inputs"]
        acted = True
    if actions.get("refresh"):
        get_bubbles.clear()
        acted = True
    if actions.get("goto"):
        st.session_state["_ai_goto"] = actions["goto"]
        acted = True
    return acted


# (A) قبل از رادیوی سناریو: اگر دستیار سناریو خواسته، آن را ست کن (نگهبان، اسلایدرها را ریست می‌کند)
_pend0 = st.session_state.get("_ai_pending") or {}
if "scenario" in _pend0 and _pend0["scenario"] in SCENARIOS:
    st.session_state["inp_scenario"] = _pend0["scenario"]

# ────────────────────────────────────────────────────────────────────────────
# نوار کناری
# ────────────────────────────────────────────────────────────────────────────
st.sidebar.title("⚙️ تنظیمات")

# ── جعبهٔ فرمان دستیار: روی همهٔ تب‌ها در دسترس است و کل داشبورد را کنترل می‌کند ──
with st.sidebar.container(border=True):
    st.markdown("**🤖 فرمان به دستیار**")
    if not gemini.is_configured():
        st.caption("کلید Gemini در `.streamlit/secrets.toml` تنظیم نشده.")
    else:
        _cmd = st.text_input("فرمان:", key="ai_cmd_box", label_visibility="collapsed",
                             placeholder="مثلاً: سناریو بدبینانه و برو تب حباب")
        bcmd, btest = st.columns([2, 1])
        with bcmd:
            _run = st.button("اجرا ▶", key="ai_cmd_run", use_container_width=True)
        with btest:
            if st.button("🔌 تست", key="ai_health", use_container_width=True,
                         help="تست اتصال به Gemini (نیاز به فیلترشکن)"):
                st.session_state["_ai_health"] = gemini.health()
        if _run and _cmd.strip():
            with st.spinner("دستیار در حال اقدام…"):
                _r = assistant.chat([{"role": "user", "text": _cmd}])
            st.session_state["_ai_reply"] = (
                _r.get("text") if _r.get("ok") else f"⚠️ خطا: {_r.get('error')}")
            if _apply_ai_actions(_r.get("actions") or {}):
                st.rerun()
        _h = st.session_state.get("_ai_health")
        if _h:
            (st.success if _h["ok"] else st.error)(_h["msg"])
        if st.session_state.get("_ai_reply"):
            st.caption(st.session_state["_ai_reply"])

scenario = st.sidebar.radio("سناریو:", list(SCENARIOS.keys()), key="inp_scenario")
d = SCENARIOS[scenario]

# (C) نگهبان: با تغییر سناریو، اسلایدرها به پیش‌فرض همان سناریو ریست می‌شوند
if st.session_state.get("_last_scenario") != scenario:
    for _f, _sk in _SCEN_FIELDS.items():
        st.session_state[_AI_KEYMAP[_f]] = _coerce(_f, SCENARIOS[scenario][_sk])
    st.session_state["_last_scenario"] = scenario

# (D) اعمال override صریح اسلایدر/افق/لنگر از دستیار (پس از نگهبان، پیش از ساخت ویجت‌ها)
_pend = st.session_state.pop("_ai_pending", None)
if _pend:
    for _f in ["infl_iran", "m2_iran", "gdp_iran", "oil_price", "deficit_pct", "horizon", "manual_rate"]:
        if _f in _pend:
            _cv = _coerce(_f, _pend[_f])
            if _cv is not None:
                st.session_state[_AI_KEYMAP[_f]] = _cv

st.sidebar.markdown("### 🎚️ لایه مدل (Tier)")
tier_choice = st.sidebar.selectbox(
    "لایه تحلیلی:",
    ["Tier 1 — پایه (PPP + Monetary)",
     "Tier 2 — میانی (+ Velocity + نرخ بهره)",
     "Tier 3 — پیشرفته (+ BEER + PSY)"],
    index=1,
    help="هر لایه قابلیت‌های بیشتری اضافه می‌کند. شرح در تب «روش‌شناسی».",
)
tier = int(tier_choice.split()[1])

st.sidebar.markdown("### 🇮🇷 متغیرهای ایران")
# مقدار این اسلایدرها از session_state می‌آید (نگهبان سناریو یا اقدام دستیار آن را ست می‌کند)
infl_iran = st.sidebar.slider("تورم سالانه (٪)", 5.0, 80.0, step=0.5, key="inp_infl")
m2_iran = st.sidebar.slider("رشد نقدینگی (٪)", 5.0, 60.0, step=0.5, key="inp_m2")
gdp_iran = st.sidebar.slider("رشد GDP (٪)", -10.0, 12.0, step=0.5, key="inp_gdp")
oil_price = st.sidebar.slider("قیمت نفت ($)", 30, 130, step=5, key="inp_oil")
deficit_pct = st.sidebar.slider("کسری بودجه (٪ نقدینگی)", 0, 50, step=5, key="inp_deficit")

# Tier 2: سرعت گردش پول
if tier >= 2:
    delta_v = st.sidebar.slider("ΔV — تغییر سرعت پول (٪/سال)", -10.0, 20.0, 0.0, 0.5,
                                 help="پساتحریم در ایران V↑ ⇒ فرار از ریال. مثبت = شتاب پولی")
else:
    delta_v = 0.0

st.sidebar.markdown("### 🇺🇸 متغیرهای آمریکا")
infl_usa = st.sidebar.slider("تورم آمریکا (٪)", 0.0, 10.0, float(d["infl_usa"]), 0.1)
m2_usa = st.sidebar.slider("رشد نقدینگی USA (٪)", -10.0, 20.0, float(d["m2_usa"]), 0.5)
gdp_usa = st.sidebar.slider("رشد GDP USA (٪)", -3.0, 6.0, float(d["gdp_usa"]), 0.1)

st.sidebar.markdown("---")
infl_source = st.sidebar.selectbox("منبع تورم تاریخی:", ["بانک مرکزی", "مرکز آمار"])
infl_col = "infl_cbi" if infl_source == "بانک مرکزی" else "infl_sci"

fx_market = st.sidebar.selectbox("نوع نرخ ارز:",
                                  ["بازار آزاد (free market)", "نیما (NIMA)"],
                                  help="تحلیل حباب باید روی بازار آزاد انجام شود. نیما برای مقایسه پرمیوم ریسک.")
fx_is_nima = fx_market.startswith("نیما")

# سال پایه: ترکیب نرخ زنده tgju (۱۳۹۰+) با نرخ‌های تاریخی هاردکد (قبل از ۱۳۹۰)
market_annual = m.annual_market_rate(live["history"]) if live["ok"] else pd.Series(dtype=float)
# اضافه کردن نرخ‌های تاریخی به سری بازار
hist_rates = pd.Series(ds.HISTORICAL_BASE_RATES_TOMAN)
combined_rates = pd.concat([hist_rates, market_annual]).groupby(level=0).last().sort_index()
# سال‌های مشترک با داده اکسل
available_years = sorted(set(df["year_shamsi"]) & set(combined_rates.index))
if not available_years:
    available_years = [1390]
# پیش‌فرض: قدیمی‌ترین سال در دسترس
base_mode = st.sidebar.radio("حالت سال پایه:", ["تک‌سال", "میانگین چند سال"],
                              index=1,  # پیش‌فرض: چندپایه (کاهش حساسیت به انتخاب لنگر)
                              horizontal=True,
                              help="میانگین هندسی چند سال پایه، حساسیت به انتخاب لنگر را کاهش می‌دهد. "
                                   "حالت پیش‌فرض همین است چون عدد حباب به‌شدت به سال پایه حساس است.")
if base_mode == "تک‌سال":
    base_year = st.sidebar.selectbox("سال پایه (مدل‌ها):", available_years, index=0,
                                      help="سال مرجع برای محاسبه ارزش ذاتی. توضیح کامل در پایین صفحه.")
    base_years_multi = None
else:
    # پیش‌فرض: ۹ سال پایه پیشنهادی (مطابق اکسل کاربر)
    default_set = [y for y in [1380, 1383, 1385, 1388, 1390, 1392, 1395, 1397, 1400]
                   if y in available_years]
    base_years_multi = st.sidebar.multiselect(
        "چند سال پایه:", available_years,
        default=default_set or available_years[:3],
    )
    if not base_years_multi:
        st.sidebar.warning("حداقل یک سال پایه انتخاب کنید — به‌طور موقت از قدیمی‌ترین سال در دسترس استفاده می‌شود.")
        base_years_multi = [available_years[0]]
    base_year = base_years_multi[0]

with st.sidebar.expander("💡 سال پایه چیست؟"):
    st.markdown("""
**سال پایه** نقطه شروع محاسبه مدل‌های PPP و پولی است.
مدل از آن سال شروع می‌کند و سال‌به‌سال، تورم و رشد نقدینگی را روی نرخ آن سال
انباشت می‌کند تا «ارزش ذاتی» امروز را به دست آورد.

**انتخاب سال پایه چه اثری دارد؟**
- اگر سالی را انتخاب کنید که بازار در آن **متعادل** بوده (یعنی نرخ بازار با ذاتیات
  اقتصادی همخوان بوده)، نتیجه مدل قابل اعتمادتر است.
- اگر سال پایه خود در **حباب** بوده، تمام نتایج آینده هم با همان حباب جابه‌جا
  می‌شوند (لنگر اشتباه).

**سال‌های پایه پیشنهادی برای ایران:**
- **۱۳۸۰**: یکسان‌سازی نرخ ارز — یکی از معدود نقاط تعادل نسبی
- **۱۳۸۸–۸۹**: پیش از شوک ۱۳۹۰ — نسبتاً پایدار
- **۱۳۹۰**: شروع تحریم — نقطه گسست ساختاری
- **۱۳۹۵**: برجام — تعادل کوتاه‌مدت
""")

st.sidebar.markdown("### 🔮 پیش‌بینی آینده")
st.session_state.setdefault("inp_horizon", 12)
horizon = st.sidebar.slider("افق پیش‌بینی (ماه)", 3, 36, step=1, key="inp_horizon")

st.sidebar.markdown("---")
st.sidebar.markdown("### 🌐 منابع داده پیشرفته")
sheet_url_input = st.sidebar.text_input(
    "Google Sheet URL (CSV عمومی):",
    value=ds.GOOGLE_SHEET_URL,
    help="پس از Publish to Web → CSV، لینک را اینجا بچسبانید. ستون‌های لازم در README.",
    placeholder="https://docs.google.com/spreadsheets/d/.../pub?output=csv",
)
use_fred = st.sidebar.checkbox("دریافت داده آمریکا از FRED (CPI, M2, DFF, Brent)",
                                value=False, help="نیازمند pandas_datareader.")

iran_monthly = get_iran_monthly(sheet_url_input)
fred_bundle = get_fred_bundle() if use_fred else {}

with st.sidebar.expander("📡 وضعیت اتصال منابع", expanded=False):
    st.markdown(f"• tgju: {'🟢 متصل' if live['ok'] else '🔴 خطا'}")
    st.markdown(f"• Google Sheet ایران: {'🟢 متصل ('+str(len(iran_monthly))+' ردیف)' if not iran_monthly.empty else '⚪ غیرفعال'}")
    if use_fred:
        st.markdown(f"• FRED: {'🟢 '+str(len(fred_bundle))+' سری' if fred_bundle else '🔴 خطا'}")
    else:
        st.markdown("• FRED: ⚪ غیرفعال")

st.sidebar.markdown("---")
# نرخ زنده یا ورود دستی
if live["ok"]:
    default_rate = live["latest_toman"]
    st.sidebar.success(f"🟢 زنده از tgju: {default_rate:,.0f} تومان  ·  {live['date_shamsi']}")
else:
    # fallback: آخرین مقدار دستی کاربر (از session) یا عدد امن
    default_rate = float(st.session_state.get("manual_rate_input", 170000.0))
    st.sidebar.warning(f"🟡 دستی / آخرین مقدار — اتصال زنده ناموفق: {live.get('error')}")
if fx_is_nima:
    # نرخ نیما معمولاً ~۲۰-۳۰٪ پایین‌تر از بازار آزاد (پرمیوم ریسک)
    default_rate = float(default_rate) * 0.78
# مقدار اولیه از session_state (تا اقدام دستیار روی این فیلد هم بدون اخطار اعمال شود)
st.session_state.setdefault("manual_rate_input", float(default_rate))
manual_rate = st.sidebar.number_input(
    f"نرخ امروز — {fx_market.split('(')[0].strip()} (تومان):",
    step=1000.0, key="manual_rate_input",
)

# ────────────────────────────────────────────────────────────────────────────
# حالت سناریو — override مفروضات سال جاری (۱۴۰۵)
# آمار نقدینگی ~۳ ماه تأخیر دارد. کاربر با فعال‌کردن این حالت، همان مفروضات
# اسلایدرهای ایران (تورم، رشد نقدینگی) را روی ردیف ۱۴۰۵ df هم اعمال می‌کند
# تا حباب امروز و پیش‌بینی forward از یک منبع واحد تغذیه شوند.
# تنها ردیف ۱۴۰۵ روی یک کپی از df تغییر می‌کند؛ سال‌های پیشین دست‌نخورده.
# ────────────────────────────────────────────────────────────────────────────
st.sidebar.markdown("---")
scenario_on = st.sidebar.checkbox(
    "🎛️ همگام‌سازی مفروضات ایران با ۱۴۰۵",
    value=False,
    help="آمار قطعی ۱۴۰۵ هنوز کامل نیست (تأخیر ۳ ماهه). با فعال‌شدن، مقادیر "
         "اسلایدرهای «تورم سالانه» و «رشد نقدینگی» بالا، روی ردیف ۱۴۰۵ داده‌ی "
         "تاریخی هم نوشته می‌شوند تا حباب امروز و مسیر آینده هماهنگ باشند.",
)

if scenario_on and 1405 in df["year_shamsi"].values:
    df = df.copy()
    _mask_1405 = df["year_shamsi"] == 1405
    df.loc[_mask_1405, "m2_growth"] = float(m2_iran)
    df.loc[_mask_1405, infl_col]    = float(infl_iran)

# ────────────────────────────────────────────────────────────────────────────
# محاسبات
# ────────────────────────────────────────────────────────────────────────────
base_rate = float(combined_rates.get(base_year, manual_rate))
ppp = m.ppp_series(df, base_year, base_rate, infl_col=infl_col)
mon = m.monetary_series(df, base_year, base_rate)

# حالت میانگین چند سال پایه
ppp_multi = None
if base_years_multi and len(base_years_multi) >= 2:
    by_rates = {y: float(combined_rates.get(y, manual_rate)) for y in base_years_multi}
    ppp_multi, _ind = m.ppp_multi_base(df, by_rates, infl_col=infl_col)
    if not ppp_multi.empty:
        ppp = ppp_multi  # جایگزینی PPP اصلی با میانگین چندپایه

# ── دو حباب جداگانه: بلندمدت (پیش از شوک ۱۳۹۷) و کوتاه‌مدت (پساتحریم) ──
base_long  = [y for y in [1390, 1392, 1395] if y in available_years]   # قبل از شوک ۱۳۹۷
base_short = [y for y in [1397, 1400, 1402] if y in available_years]   # پس از شوک
ppp_long = ppp_short = None
if base_long:
    _rates_long = {y: float(combined_rates.get(y, manual_rate)) for y in base_long}
    ppp_long, _ = m.ppp_multi_base(df, _rates_long, infl_col=infl_col)
if base_short:
    _rates_short = {y: float(combined_rates.get(y, manual_rate)) for y in base_short}
    ppp_short, _ = m.ppp_multi_base(df, _rates_short, infl_col=infl_col)

# ── ECM (نرخ تعادلی بلندمدت هم‌انباشتگی) + Ensemble ──
ecm_val, ecm_info = m.ecm_series(df, combined_rates)
beer_val = None
try:
    beer_val = m.beer_series(df, combined_rates)
except Exception:  # noqa: BLE001
    beer_val = None

# ترکیب با وزن معکوس خطا (در نبود backtest، وزن مساوی)
_ens_parts = {"PPP": ppp, "پولی": mon}
if ecm_val is not None and not ecm_val.empty:
    _ens_parts["ECM"] = ecm_val
if beer_val is not None and not beer_val.empty:
    _ens_parts["BEER"] = beer_val
ensemble_val = m.ensemble_valuation(_ens_parts)

# آخرین مقادیر (سال جاری مدل)
last_year = int(max(ppp.index))
ppp_now = float(ppp.iloc[-1])
mon_now = float(mon.iloc[-1])
ecm_now = float(ecm_val.dropna().iloc[-1]) if (ecm_val is not None and not ecm_val.dropna().empty) else np.nan
ens_now = float(ensemble_val.dropna().iloc[-1]) if (ensemble_val is not None and not ensemble_val.dropna().empty) else np.nan

gap_ppp = (manual_rate - ppp_now) / ppp_now * 100
gap_mon = (manual_rate - mon_now) / mon_now * 100

# پیش‌بینی آینده‌نگر
start_shamsi = live["date_shamsi"] if live["ok"] else "1405/03/01"
fc = m.forecast_forward(manual_rate, start_shamsi, horizon,
                        infl_iran, infl_usa, m2_iran, m2_usa, gdp_iran, gdp_usa,
                        delta_v_annual_pct=delta_v)

# ────────────────────────────────────────────────────────────────────────────
# هدر و KPI
# ────────────────────────────────────────────────────────────────────────────
_logo = ds.logo_data_uri(white=True)
_logo_html = f'<img src="{_logo}" alt="آرش"><div class="bh-div"></div>' if _logo else ""
st.markdown(
    f"""
    <div class="brand-hero">
        {_logo_html}
        <div class="bh-tx">
            <h1>داشبورد تحلیل نرخ ارز ایران <span class="g">| آرش صفری</span></h1>
            <div class="bh-sub">PPP · پولی · ECM هم‌انباشتگی · BEER · ترکیبی · نرخ زنده · پیش‌بینی ماهانه</div>
        </div>
    </div>
    """,
    unsafe_allow_html=True,
)
st.markdown(
    f"**سناریو:** `{scenario}`  |  **سال پایه:** `{base_year}`  |  "
    f"**منبع تورم:** `{infl_source}`  |  **مدل‌ها:** PPP + رویکرد پولی"
)

c1, c2, c3, c4 = st.columns(4)
c1.metric("نرخ بازار آزاد (امروز)", f"{manual_rate:,.0f} ﺗﻮﻣﺎن",
          f"{live.get('change_pct','')}" if live["ok"] else "ورود دستی", delta_color="off")
c2.metric(f"ارزش ذاتی PPP ({last_year})", f"{ppp_now:,.0f} ﺗﻮﻣﺎن", f"شکاف {gap_ppp:+.0f}٪", delta_color="inverse")
c3.metric(f"ارزش ذاتی پولی ({last_year})", f"{mon_now:,.0f} ﺗﻮﻣﺎن", f"شکاف {gap_mon:+.0f}٪", delta_color="inverse")
c4.metric(f"پیش‌بینی {fc['month_label'].iloc[-1]}",
          f"{fc['ppp_toman'].iloc[-1]:,.0f} ﺗﻮﻣﺎن",
          f"PPP | پولی {fc['monetary_toman'].iloc[-1]:,.0f}")

st.caption("همه نرخ‌ها به **تومان** هستند. ارزش ذاتی پایین‌تر از بازار = حباب مثبت (پدیده رایج اقتصاد تحریمی ایران).")

if scenario_on:
    st.warning(f"🎛️ **حالت سناریو فعال** — مفروضات اسلایدرها ({infl_iran:.0f}٪ تورم، "
               f"{m2_iran:.0f}٪ رشد نقدینگی) به ردیف ۱۴۰۵ تزریق شده‌اند. حباب امروز "
               f"و مسیر آینده هر دو از این مفروضات می‌خوانند، نه داده‌ی قطعی.")

# ── دو حباب با لنگرهای متفاوت (شفافیت حساسیت سال پایه) ──
if ppp_long is not None and not ppp_long.empty and ppp_short is not None and not ppp_short.empty:
    _l = float(ppp_long.iloc[-1]); _s = float(ppp_short.iloc[-1])
    _gap_l = (manual_rate - _l) / _l * 100
    _gap_s = (manual_rate - _s) / _s * 100
    b1, b2 = st.columns(2)
    b1.metric("حباب بلندمدت (لنگر پیش از تحریم — ۱۳۹۰/۹۲/۹۵)",
              f"{_gap_l:+.0f}٪", f"PPP {_l:,.0f} ﺗﻮﻣﺎن", delta_color="off")
    b2.metric("حباب کوتاه‌مدت (لنگر پساتحریم — ۱۳۹۷/۱۴۰۰/۱۴۰۲)",
              f"{_gap_s:+.0f}٪", f"PPP {_s:,.0f} ﺗﻮﻣﺎن", delta_color="off")
    st.caption("تفاوت این دو ≈ **پرمیوم ریسک ساختاری تحریم** که مدل تورمی PPP آن را پوشش نمی‌دهد. "
               "حباب بلندمدت کل انحراف از مسیر پیش‌از-تحریم را نشان می‌دهد؛ حباب کوتاه‌مدت فقط انحراف از سطح پساتحریم را.")

# ── مسیر بنیادی سه‌سناریویی تا اسفند ─────────────────────────────────────────
st.markdown("---")
st.subheader("🛣️ مسیر بنیادی پولی تا پایان سال — سه سناریو")
_h_col1, _h_col2 = st.columns([1, 4])
with _h_col1:
    horizon_g = st.number_input("افق (ماه):", min_value=3, max_value=24, value=9, step=1,
                                 help="پیش‌فرض ۹ ماه = از خرداد تا اسفند ۱۴۰۵.")
_GREEN, _AMBER, _RED = "#2E8B57", "#B8860B", "#B22222"
_GS_DEFAULTS = [
    ("گشایش",     40, 45, _GREEN),
    ("بلاتکلیفی", 45, 58, _AMBER),
    ("تشدید",     52, 80, _RED),
]
st.caption("مفروضات هر سناریو را می‌توانی همین‌جا تغییر بدهی — نمودار و جدول زنده به‌روز می‌شوند.")
_gcols = st.columns(3)
GSCENARIOS = {}
for _i, (_n, _m2_d, _i_d, _clr) in enumerate(_GS_DEFAULTS):
    with _gcols[_i]:
        st.markdown(f"<div style='border-right:3px solid {_clr};padding-right:8px;"
                    f"font-weight:600'>{_n}</div>", unsafe_allow_html=True)
        _m2_v = st.number_input("رشد نقدینگی ٪", min_value=0, max_value=120,
                                  value=_m2_d, step=1, key=f"gs_m2_{_i}")
        _i_v  = st.number_input("تورم ٪", min_value=0, max_value=150,
                                  value=_i_d, step=1, key=f"gs_infl_{_i}")
    GSCENARIOS[_n] = {"m2": _m2_v, "infl": _i_v, "color": _clr}
_paths = {}
for _name, _sp in GSCENARIOS.items():
    _fc = m.forecast_forward(
        manual_rate, start_shamsi, int(horizon_g),
        _sp["infl"], infl_usa, _sp["m2"], m2_usa, gdp_iran, gdp_usa,
        delta_v_annual_pct=delta_v,
    )
    _paths[_name] = _fc

_fig_g = go.Figure()
_fig_g.add_hline(y=manual_rate, line_dash="dot", line_color=C["navy"],
                 annotation_text=f"نرخ بازار امروز {manual_rate:,.0f}", annotation_position="top left")
for _name, _fc in _paths.items():
    _fig_g.add_trace(go.Scatter(
        x=_fc["month_label"], y=_fc["monetary_toman"], mode="lines+markers",
        name=f"سناریو {_name}",
        line=dict(color=GSCENARIOS[_name]["color"], width=3),
        hovertemplate="%{x}<br><b>%{y:,.0f} ﺗﻮﻣﺎن</b><extra>"+_name+"</extra>",
    ))
_fig_g.update_layout(
    height=380, margin=dict(l=10, r=10, t=30, b=10),
    yaxis_title="نرخ بنیادی پولی (تومان)", xaxis_title="ماه",
    legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
    font=dict(family=ds.PLOT_FONT),
)
st.plotly_chart(_fig_g, width="stretch")

_rows = []
for _name, _fc in _paths.items():
    _end = float(_fc["monetary_toman"].iloc[-1])
    _gap = (manual_rate - _end) / _end * 100
    _rows.append({
        "سناریو": _name,
        "فرض تورم (٪)": GSCENARIOS[_name]["infl"],
        "فرض رشد نقدینگی (٪)": GSCENARIOS[_name]["m2"],
        f"نرخ بنیادی {_fc['month_label'].iloc[-1]} (تومان)": f"{_end:,.0f}",
        "فاصله از نرخ امروز (٪)": f"{_gap:+.1f}",
    })
st.dataframe(pd.DataFrame(_rows), hide_index=True, width="stretch")

st.caption("⚠️ این مسیرهای **بنیادی اقتصادی‌اند** (کفِ فشار پولی)، نه پیش‌بینی نرخ بازار. "
           "شوک ژئوپلیتیک می‌تواند نرخ بازار را موقتاً هر جا ببرد. مقایسه‌ی نرخ بازار با این مسیرها "
           "حدِ فاصلهٔ ساختاری را نشان می‌دهد.")

# ────────────────────────────────────────────────────────────────────────────
# تب‌ها
# ────────────────────────────────────────────────────────────────────────────
t1, t2, t3, t4, t5, t6, t7, t8, t9, t10, t11, t12 = st.tabs([
    "📈 مقایسه تاریخی",
    "🔮 نرخ زنده و پیش‌بینی",
    "💧 شکاف حباب",
    "🌪️ تحلیل حساسیت",
    "📐 اقتصادسنجی (BEER · PSY/GSADF · Monte Carlo)",
    "🧪 اعتبارسنجی گذشته‌نگر",
    "📚 روش‌شناسی",
    "🧠 تفسیر هوشمند",
    "🏦 نرخ بهره واقعی",
    "📊 بورس",
    "💎 حباب طلا و سکه",
    "🤖 دستیار هوشمند",
])

# ── تب ۱: مقایسه تاریخی ──────────────────────────────────────────────────────
with t1:
    st.subheader("نرخ بازار آزاد در برابر ارزش ذاتی مدل‌ها (بر حسب سال شمسی)")
    cc1, cc2 = st.columns([1, 4])
    with cc1:
        scale_mode = st.radio("مقیاس محور:", ["خطی", "لگاریتمی"], index=0, key="scale_t1")
    fig = go.Figure()
    if not market_annual.empty:
        fig.add_trace(go.Scatter(x=market_annual.index, y=market_annual.values,
                                 name="نرخ بازار آزاد (tgju)", mode="lines+markers",
                                 line=dict(color=C["navy"], width=3.5),
                                 marker=dict(size=10),
                                 hovertemplate="سال %{x}<br><b>%{y:,.0f} ﺗﻮﻣﺎن</b><extra>بازار</extra>"))
    fig.add_trace(go.Scatter(x=ppp.index, y=ppp.values, name="مدل PPP",
                             mode="lines+markers", line=dict(color=C["gold"], width=3, dash="dash"),
                             marker=dict(size=9),
                             hovertemplate="سال %{x}<br><b>%{y:,.0f} ﺗﻮﻣﺎن</b><extra>PPP</extra>"))
    fig.add_trace(go.Scatter(x=mon.index, y=mon.values, name="مدل پولی",
                             mode="lines+markers", line=dict(color=C["navy_light"], width=2.5, dash="dot"),
                             marker=dict(size=8),
                             hovertemplate="سال %{x}<br><b>%{y:,.0f} ﺗﻮﻣﺎن</b><extra>پولی</extra>"))
    if ecm_val is not None and not ecm_val.dropna().empty:
        _e = ecm_val.dropna()
        fig.add_trace(go.Scatter(x=_e.index, y=_e.values, name="مدل ECM (هم‌انباشتگی)",
                                 mode="lines", line=dict(color=C["gold_dark"], width=2.5),
                                 hovertemplate="سال %{x}<br><b>%{y:,.0f} ﺗﻮﻣﺎن</b><extra>ECM</extra>"))
    if ensemble_val is not None and not ensemble_val.dropna().empty:
        _en = ensemble_val.dropna()
        fig.add_trace(go.Scatter(x=_en.index, y=_en.values, name="ترکیبی (Ensemble)",
                                 mode="lines", line=dict(color=C["navy_deep"], width=3, dash="longdash"),
                                 hovertemplate="سال %{x}<br><b>%{y:,.0f} ﺗﻮﻣﺎن</b><extra>ترکیبی</extra>"))
    brand_fig(fig, height=540)
    fig.update_layout(hovermode="x unified",
                      yaxis_type="log" if scale_mode == "لگاریتمی" else "linear",
                      xaxis_title="سال شمسی",
                      yaxis_title="تومان / دلار" + (" (لگاریتمی)" if scale_mode == "لگاریتمی" else ""))
    st.plotly_chart(fig, width="stretch")
    st.info("در مقیاس خطی، رشد چشمگیر سال‌های اخیر بهتر دیده می‌شود. در مقیاس لگاریتمی، نرخ‌های قدیمی و جدید همزمان قابل مقایسه‌اند.")

    # نمایش نرخ پایه فعلی
    st.markdown(f"📌 **سال پایه فعلی: `{base_year}` با نرخ لنگر `{base_rate:,.0f}` تومان** — "
                f"تمام مسیر PPP و پولی از این نقطه شروع و انباشت می‌شود.")

    with st.expander("📚 سال پایه چیست و چرا مهم است؟ (راهنمای کامل)"):
        st.markdown("""
### مفهوم سال پایه (Base Year)
سال پایه، **نقطه لنگر زمانی** برای محاسبه ارزش ذاتی نرخ ارز است. مدل از نرخ بازار
در آن سال شروع می‌کند و با اعمال **تورم تجمعی** (در مدل PPP) یا **رشد نقدینگی
تجمعی** (در مدل پولی)، نرخ‌های سال‌های بعدی را به دست می‌آورد.

### فرمول ریاضی
**مدل PPP:**
$$E_t = E_{base} \\times \\prod_{i=base+1}^{t} \\frac{1 + \\pi_{ir,i}}{1 + \\pi_{us,i}}$$

**مدل پولی:**
$$E_t = E_{base} \\times \\prod_{i=base+1}^{t} \\left(1 + \\Delta M_{ir} - \\Delta M_{us} - \\Delta Y_{ir} + \\Delta Y_{us}\\right)$$

### اثر تغییر سال پایه
| سال پایه | اثر بر مدل |
|---|---|
| **سال متعادل** (مثلاً ۱۳۸۰ پس از یکسان‌سازی) | لنگر قابل اعتماد، شکاف حباب معنادار |
| **سال پر حباب** (مثلاً ۱۳۹۷ اوج شوک) | لنگر آلوده، شکاف کوچک‌تر از واقعیت |
| **سال خیلی قدیم** (۱۳۶۰) | تجمع طولانی تورم → خطای تجمعی |
| **سال خیلی نزدیک** (۱۴۰۲) | حساس به نوسان نقطه‌ای |

### قاعده عملی برای ایران
- **توصیه:** ۱۳۸۰ یا ۱۳۸۸ به‌عنوان لنگر طلایی (تعادل نسبی پیش از شوک‌های بزرگ)
- برای مقایسه با دوره برجام: ۱۳۹۵
- برای تحلیل دوره تحریم: ۱۳۹۰
- **نکته:** هر بار سال پایه را عوض کنید، مسیر مدل بازترسیم می‌شود و می‌توانید
  ببینید کدام سال‌ها بازار از ذاتیات فاصله گرفته است.
""")

# ── تب ۲: نرخ زنده و پیش‌بینی ────────────────────────────────────────────────
with t2:
    st.subheader("نمودار متصل: ۱۲ ماه گذشته (واقعی) + ۱۲ ماه آینده (پیش‌بینی)")
    st.caption("🎛️ **همه اسلایدرهای نوار کناری زنده هستند** — با تغییر تورم، نقدینگی، GDP یا افق، نمودار همین لحظه بازترسیم می‌شود.")

    # ── ساخت سری ماهانه ۱۲ ماه گذشته از داده زنده ──
    past_months_df = pd.DataFrame()
    if live["ok"]:
        h = live["history"].copy()
        h["dt"] = pd.to_datetime(h["dt"], errors="coerce")
        h = h.dropna(subset=["dt"]).sort_values("dt")
        # میانگین ماهانه میلادی
        h["ym"] = h["dt"].dt.to_period("M")
        monthly = h.groupby("ym").agg(
            close_toman=("close_toman", "mean"),
            date_shamsi=("date_shamsi", "last"),
        ).reset_index()
        # ۱۲ ماه آخر
        monthly = monthly.tail(12).reset_index(drop=True)
        # ساخت برچسب شمسی ماه/سال
        def _shamsi_label(s):
            p = ds.parse_shamsi_date(s)
            if not p:
                return s
            y, mo, _ = p
            return f"{ds.PERSIAN_MONTHS[mo - 1]} {y}"
        monthly["label"] = monthly["date_shamsi"].apply(_shamsi_label)
        past_months_df = monthly

    st.markdown(f"#### 🔮 پیش‌بینی {horizon} ماه آینده — لنگر: **{manual_rate:,.0f} ﺗﻮﻣﺎن**")

    # خلاصه پارامترهای فعال
    pc1, pc2, pc3, pc4 = st.columns(4)
    pc1.metric("تورم ایران", f"{infl_iran:.1f}٪")
    pc2.metric("رشد نقدینگی", f"{m2_iran:.1f}٪")
    pc3.metric("رشد GDP", f"{gdp_iran:.1f}٪")
    pc4.metric("قیمت نفت", f"{oil_price} $")

    fig3 = go.Figure()

    # ── ۱) خط واقعی ۱۲ ماه گذشته (تاریخی) ──
    if not past_months_df.empty:
        fig3.add_trace(go.Scatter(
            x=past_months_df["label"], y=past_months_df["close_toman"],
            name="واقعی (۱۲ ماه گذشته)", mode="lines+markers+text",
            line=dict(color=C["navy_deep"], width=4),
            marker=dict(size=11, color=C["navy_deep"], line=dict(color="#fff", width=2)),
            text=[f"{v:,.0f}" for v in past_months_df["close_toman"]],
            textposition="top center",
            textfont=dict(size=11, color=C["navy_deep"]),
            hovertemplate="%{x}<br><b>واقعی: %{y:,.0f} ﺗﻮﻣﺎن</b><extra></extra>",
        ))
        # خط عمودی جدا کردن گذشته و آینده — از add_shape به‌جای add_vline (سازگار با محور categorical)
        _today_label = past_months_df["label"].iloc[-1]
        fig3.add_shape(
            type="line", xref="x", yref="paper",
            x0=_today_label, x1=_today_label, y0=0, y1=1,
            line=dict(dash="dash", color=C["gold_dark"], width=2),
        )
        fig3.add_annotation(
            x=_today_label, y=1.02, xref="x", yref="paper",
            text="امروز", showarrow=False,
            font=dict(color=C["gold_dark"], size=13),
        )

    # خط لنگر (نرخ امروز) — add_shape به‌جای add_hline برای پایداری روی محور categorical
    fig3.add_shape(
        type="line", xref="paper", yref="y",
        x0=0, x1=1, y0=manual_rate, y1=manual_rate,
        line=dict(dash="dot", color=C["mute"], width=1.2),
    )
    fig3.add_annotation(
        xref="paper", yref="y", x=0.99, y=manual_rate,
        text=f"لنگر: {manual_rate:,.0f}", showarrow=False,
        font=dict(color=C["mute"], size=11),
        xanchor="right", yanchor="top",
    )

    fig3.add_trace(go.Scatter(
        x=fc["month_label"], y=fc["ppp_toman"],
        name="مسیر PPP (مبتنی بر تفاوت تورم)", mode="lines+markers+text",
        line=dict(color=C["navy"], width=3.5),
        marker=dict(size=11, color=C["navy"], line=dict(color="#fff", width=2)),
        text=[f"{v:,.0f}" for v in fc["ppp_toman"]],
        textposition="top center",
        textfont=dict(size=11, color=C["navy"]),
        hovertemplate="%{x}<br><b>PPP: %{y:,.0f} ﺗﻮﻣﺎن</b><extra></extra>",
    ))
    fig3.add_trace(go.Scatter(
        x=fc["month_label"], y=fc["monetary_toman"],
        name="مسیر پولی (مبتنی بر رشد نقدینگی)", mode="lines+markers+text",
        line=dict(color=C["gold"], width=3.5, dash="dot"),
        marker=dict(size=11, color=C["gold"], line=dict(color="#fff", width=2)),
        text=[f"{v:,.0f}" for v in fc["monetary_toman"]],
        textposition="bottom center",
        textfont=dict(size=11, color=C["gold_dark"]),
        hovertemplate="%{x}<br><b>پولی: %{y:,.0f} ﺗﻮﻣﺎن</b><extra></extra>",
    ))
    brand_fig(fig3, height=560)
    fig3.update_layout(hovermode="x unified",
                       yaxis_title="تومان / دلار", xaxis_title="ماه شمسی",
                       xaxis_tickangle=-30)
    st.plotly_chart(fig3, width="stretch")

    # دلتای تغییر در پایان افق
    end_ppp = fc["ppp_toman"].iloc[-1]
    end_mon = fc["monetary_toman"].iloc[-1]
    dc1, dc2 = st.columns(2)
    dc1.metric(f"PPP در پایان {horizon} ماه",
               f"{end_ppp:,.0f} ﺗﻮﻣﺎن",
               f"{(end_ppp-manual_rate)/manual_rate*100:+.1f}٪ نسبت به امروز")
    dc2.metric(f"پولی در پایان {horizon} ماه",
               f"{end_mon:,.0f} ﺗﻮﻣﺎن",
               f"{(end_mon-manual_rate)/manual_rate*100:+.1f}٪ نسبت به امروز")

    with st.expander("📋 جدول کامل پیش‌بینی ماه به ماه"):
        st.dataframe(
            fc.assign(ppp_toman=fc["ppp_toman"].round(0).map("{:,.0f}".format),
                      monetary_toman=fc["monetary_toman"].round(0).map("{:,.0f}".format))
              .rename(columns={"month_label": "ماه",
                               "ppp_toman": "PPP (تومان)",
                               "monetary_toman": "پولی (تومان)"}),
            width="stretch", hide_index=True,
        )
    st.warning("⚠️ پیش‌بینی فرض می‌کند نرخ‌های تورم/نقدینگی اسلایدرها در ماه‌های آینده ثابت بمانند. "
               "شوک سیاسی، تحریم یا توافق می‌تواند مسیر را کاملاً تغییر دهد.")

# ── تب ۳: شکاف حباب ──────────────────────────────────────────────────────────
with t3:
    st.subheader("شکاف حباب: انحراف نرخ بازار از ارزش ذاتی (٪)")
    if base_mode == "تک‌سال":
        st.warning(
            "⚠️ **این عدد به سال پایه بسیار حساس است.** اندازهٔ حباب با تغییر سال پایه "
            "می‌تواند چند برابر شود؛ اگر سال پایهٔ انتخابی خود در حباب بوده باشد، شکاف "
            "محاسبه‌شده کوچک‌تر از واقعیت جلوه می‌کند. برای کاهش این سوگیری، حالت "
            "**«میانگین چند سال»** را در نوار کناری انتخاب کنید (میانگین هندسی چند لنگر).")
    else:
        st.info("✅ حالت **میانگین چند سال پایه** فعال است؛ حساسیت عدد حباب به انتخاب "
                "یک سال پایهٔ واحد کاهش یافته است.")
    if not market_annual.empty:
        g_ppp = m.bubble_gap(market_annual, ppp)
        g_mon = m.bubble_gap(market_annual, mon)
        fig4 = go.Figure()
        fig4.add_trace(go.Bar(x=g_ppp.index, y=g_ppp.values, name="شکاف از PPP",
                              marker_color=C["navy"],
                              text=[f"{v:+.0f}٪" for v in g_ppp.values], textposition="outside"))
        fig4.add_trace(go.Bar(x=g_mon.index, y=g_mon.values, name="شکاف از پولی",
                              marker_color=C["gold"],
                              text=[f"{v:+.0f}٪" for v in g_mon.values], textposition="outside"))
        fig4.add_hline(y=0, line_color=C["mute"], line_width=1)
        brand_fig(fig4, height=470, toman_yaxis=False)
        fig4.update_layout(barmode="group", xaxis_title="سال شمسی", yaxis_title="شکاف (٪)",
                           yaxis_ticksuffix="٪")
        st.plotly_chart(fig4, width="stretch")
        st.caption("مقدار مثبت = بازار بالاتر از ارزش ذاتی (حباب). در ایران این شکاف معمولاً پایدار و ساختاری است.")
    else:
        st.error("داده نرخ بازار در دسترس نیست.")

    # ── دامنه‌ی کف/سقف سالانه‌ی بازار + نرخ بنیادی ───────────────────────────
    st.divider()
    st.markdown("##### دامنه‌ی نوسان سالانه‌ی بازار در برابر نرخ بنیادی")
    hl = m.annual_high_low(live["history"]) if live.get("ok") else pd.DataFrame()
    hl = hl[hl.index >= 1397] if (hl is not None and not hl.empty) else hl
    if hl is not None and not hl.empty:
        years = list(hl.index)
        lows = hl["low"].to_numpy()
        highs = hl["high"].to_numpy()
        fig_hl = go.Figure()
        fig_hl.add_trace(go.Bar(
            x=years, y=(highs - lows), base=lows, name="دامنه بازار (کف→سقف)",
            marker_color=C["navy"], marker_line_width=0, opacity=0.55, width=0.55,
            customdata=np.stack([lows, highs], axis=-1),
            hovertemplate=("سال %{x}<br>کف %{customdata[0]:,.0f}"
                           "<br>سقف %{customdata[1]:,.0f} ﺗﻮﻣﺎن<extra></extra>"),
        ))
        ppp_common = ppp[ppp.index.isin(years)]
        if not ppp_common.empty:
            fig_hl.add_trace(go.Scatter(
                x=ppp_common.index, y=ppp_common.values, name="نرخ بنیادی (PPP)",
                mode="lines+markers", line=dict(color=C["gold"], width=3),
                marker=dict(size=8),
                hovertemplate="سال %{x}<br><b>%{y:,.0f} ﺗﻮﻣﺎن</b><extra>PPP</extra>",
            ))
        brand_fig(fig_hl, height=460)
        fig_hl.update_layout(barmode="overlay", xaxis_title="سال شمسی",
                             yaxis_title="تومان / دلار")
        st.plotly_chart(fig_hl, width="stretch")
        st.caption("نوار = دامنه‌ی نوسان واقعی بازار در هر سال (کف تا سقف از داده‌ی روزانه‌ی tgju)؛ "
                   "خط = نرخ بنیادی (PPP) با سال پایه‌ی انتخابی شما.")
    else:
        st.info("داده‌ی کف/سقف سالانه در دسترس نیست (اتصال tgju برقرار نشد).")

# ── تب ۴: تحلیل حساسیت ───────────────────────────────────────────────────────
with t4:
    st.subheader("تحلیل حساسیت نرخ ارز")
    analyzer = SensitivityAnalyzer(
        base_rate=manual_rate, base_inflation=infl_iran,
        base_oil_price=oil_price, base_money_growth=m2_iran,
        df=df, market=combined_rates, ppp_series=ppp,
    )
    if analyzer.elasticity_info.get("estimated"):
        ei = analyzer.elasticity_info
        st.success(f"✅ **کشش نفتی از داده تاریخی برآورد شد** — "
                   f"β₁(log oil) = {ei['beta1_log_oil']:.3f}, R² = {ei['r2']:.2f}, n = {ei['n']} سال "
                   f"⇒ هر $5 ≈ {ei['oil_elasticity_pct_per_5usd']*100:+.2f}٪ تغییر نرخ")
    else:
        st.info("ℹ️ داده کافی برای برآورد تجربی کشش نفت نیست — از ضرایب پیش‌فرض تجربی استفاده می‌شود.")
    h1, h2 = st.columns(2)
    with h1:
        st.markdown("##### هیت‌مپ: نفت × کسری بودجه")
        matrix, oils, deficits = analyzer.build_heatmap()
        brand_scale = [[0, C["cream"]], [0.5, C["gold_light"]], [1, C["navy_deep"]]]
        fig5 = go.Figure(go.Heatmap(
            z=matrix, x=oils, y=deficits, colorscale=brand_scale,
            colorbar=dict(title="ﺗﻮﻣﺎن", tickformat=",.0f"),
            text=[[f"{v:,.0f}" for v in row] for row in matrix],
            texttemplate="%{text}", textfont=dict(size=10),
            hovertemplate="نفت %{x}$<br>کسری %{y}٪<br><b>نرخ %{z:,.0f} ﺗﻮﻣﺎن</b><extra></extra>"))
        brand_fig(fig5, height=440, legend_bottom=False, toman_yaxis=False)
        fig5.update_layout(xaxis_title="قیمت نفت ($)", yaxis_title="کسری (٪ نقدینگی)")
        st.plotly_chart(fig5, width="stretch")
    with h2:
        st.markdown("##### تورنادو: اثر شوک‌ها")
        tor = analyzer.tornado_data()
        fig6 = go.Figure()
        fig6.add_trace(go.Bar(y=tor["متغیر"], x=tor["low"], orientation="h",
                              name="کاهش", marker_color=C["navy"],
                              text=[f"{v:+.1f}٪" for v in tor["low"]], textposition="auto"))
        fig6.add_trace(go.Bar(y=tor["متغیر"], x=tor["high"], orientation="h",
                              name="افزایش", marker_color=C["gold"],
                              text=[f"{v:+.1f}٪" for v in tor["high"]], textposition="auto"))
        brand_fig(fig6, height=440, toman_yaxis=False)
        fig6.update_layout(barmode="relative", xaxis_title="اثر بر نرخ (٪)")
        st.plotly_chart(fig6, width="stretch")
    el5 = analyzer.oil_elasticity_per_5usd()
    st.info(f"📌 هر ۵ دلار تغییر در قیمت نفت ≈ **{el5:+.2f}٪** تغییر در نرخ دلار (ضریب کشش قابل ویرایش در `sensitivity.py`).")

# ── تب ۵: اقتصادسنجی ─────────────────────────────────────────────────────────
with t5:
    st.subheader("📐 تحلیل اقتصادسنجی نرخ ارز")

    # ── BEER (cointegration ساده) ──
    st.markdown("##### ۱) BEER — نرخ تعادلی همگرایی")
    if not market_annual.empty:
        beer = ec.beer_equilibrium(df, market_annual)
        if beer is not None:
            fig_beer = go.Figure()
            common = market_annual.index.intersection(beer.index)
            fig_beer.add_trace(go.Scatter(x=common, y=market_annual.loc[common],
                                          name="نرخ بازار", line=dict(color=C["navy"], width=3.5),
                                          mode="lines+markers", marker=dict(size=10),
                                          hovertemplate="سال %{x}<br><b>%{y:,.0f} ﺗﻮﻣﺎن</b><extra>بازار</extra>"))
            fig_beer.add_trace(go.Scatter(x=beer.index, y=beer.values,
                                          name="BEER (تعادلی)", line=dict(color=C["gold"], width=3, dash="dash"),
                                          mode="lines+markers", marker=dict(size=9),
                                          hovertemplate="سال %{x}<br><b>%{y:,.0f} ﺗﻮﻣﺎن</b><extra>BEER</extra>"))
            brand_fig(fig_beer, height=420)
            fig_beer.update_layout(yaxis_title="تومان / دلار", xaxis_title="سال شمسی",
                                   hovermode="x unified")
            st.plotly_chart(fig_beer, width="stretch")
            beer_gap = (market_annual.iloc[-1] - beer.iloc[-1]) / beer.iloc[-1] * 100
            st.caption(f"شکاف فعلی نسبت به BEER: **{beer_gap:+.1f}٪** — رگرسیون لگاریتمی روی CPI نسبی و درآمد نفتی.")
            # صداقت هم‌انباشتگی: BEER فقط در صورت مانایی پسماند معتبر است
            _coint = beer.attrs.get("is_cointegrated")
            if _coint is False:
                st.error(
                    f"⚠️ **رابطهٔ بلندمدت تأیید نشد (هم‌انباشتگی رد شد).** آمارهٔ ADF پسماند "
                    f"={beer.attrs.get('adf_stat', float('nan')):.2f} از مقدار بحرانی "
                    f"Engle-Granger ({beer.attrs.get('eg_cv_5', float('nan')):.2f}) منفی‌تر نیست. "
                    f"یعنی R²=**{beer.attrs.get('r2', float('nan')):.2f}** احتمالاً **رگرسیون کاذب** است و "
                    "نباید مبنای تصمیم باشد. این صادقانه‌ترین قرائت داده است.")
            elif _coint is True:
                st.success(f"✅ هم‌انباشتگی تأیید شد (ADF={beer.attrs.get('adf_stat'):.2f} < "
                           f"CV={beer.attrs.get('eg_cv_5'):.2f}) — رابطهٔ تعادلی بلندمدت معتبر است.")
        else:
            st.warning("داده کافی برای برآورد BEER وجود ندارد.")
    else:
        st.warning("داده نرخ بازار سالانه در دسترس نیست.")

    # ── باتریِ هم‌انباشتگی: EG · ARDL Bounds · Gregory–Hansen ──
    st.markdown("##### ۱.۱) آزمون‌های هم‌انباشتگی — خطی در برابر شکستِ ساختاری")
    if not combined_rates.empty:
        _cf = ds.cointegration_inputs(df, combined_rates)
        _xs = [c for c in ("ln_cpi_rel", "ln_oil") if c in _cf.columns]
        _cf_clean = _cf[["ln_E"] + _xs].replace([np.inf, -np.inf], np.nan).dropna() if "ln_E" in _cf.columns else pd.DataFrame()
        if len(_cf_clean) >= 12 and _xs:
            _eg = ec.engle_granger(_cf_clean, "ln_E", _xs)
            _ardl = ec.ardl_bounds_test(_cf, "ln_E", _xs)
            _gh = ec.gregory_hansen(_cf, "ln_E", _xs)
            _rows = []
            if _eg.get("ok"):
                _rows.append({"آزمون": "Engle–Granger (ADF)", "آماره": f"{_eg['adf_stat']:.2f}",
                              "بحرانی ۵٪": f"{_eg['eg_cv_5']:.2f}",
                              "هم‌انباشته؟": "✅ بله" if _eg["is_cointegrated"] else "❌ خیر"})
            if _ardl.get("ok"):
                _dec = {"cointegrated": "✅ بله", "none": "❌ خیر", "inconclusive": "⚠️ بی‌نتیجه"}[_ardl["decision"]]
                _rows.append({"آزمون": "ARDL Bounds (F)", "آماره": f"{_ardl['f_stat']:.2f}",
                              "بحرانی ۵٪": f"{_ardl['lower_5']:.2f}/{_ardl['upper_5']:.2f}", "هم‌انباشته؟": _dec})
            if _gh.get("ok"):
                _rows.append({"آزمون": f"Gregory–Hansen (شکست {_gh['break_index']})",
                              "آماره": f"{_gh['gh_stat']:.2f}", "بحرانی ۵٪": f"{_gh['cv_5']:.2f}",
                              "هم‌انباشته؟": "✅ بله" if _gh["is_cointegrated"] else "❌ خیر"})
            if _rows:
                st.dataframe(pd.DataFrame(_rows), width="stretch", hide_index=True)
            # روایتِ صادقانه
            _lin_no = (_eg.get("ok") and not _eg["is_cointegrated"]) or (_ardl.get("ok") and _ardl["decision"] != "cointegrated")
            if _lin_no and _gh.get("ok") and _gh["is_cointegrated"]:
                st.success(
                    f"🔑 **یافتهٔ کلیدی:** هم‌انباشتگیِ *خطی* رد می‌شود (EG و ARDL)، اما با اجازهٔ یک "
                    f"**شکستِ ساختاری** (Gregory–Hansen، شکست در **{_gh['break_index']}**) هم‌انباشتگی "
                    f"تأیید می‌شود (GH={_gh['gh_stat']:.2f} < CV₅={_gh['cv_5']:.2f}). یعنی رابطهٔ تعادلیِ "
                    "بلندمدت وجود دارد ولی با رژیمِ تحریم **جابه‌جا** می‌شود — این ستون فقراتِ روایتِ مقاله است.")
            elif _gh.get("ok") and not _gh["is_cointegrated"]:
                st.warning("هیچ‌کدام از آزمون‌ها (حتی با شکستِ ساختاری) هم‌انباشتگی را تأیید نکردند — "
                           "رابطهٔ بلندمدتِ پایدار میان نرخ و بنیادها در این نمونه شکننده است.")
            if _gh.get("ok") and _gh.get("break_frac", 1) <= 0.17:
                st.caption("⚠️ نقطهٔ شکست روی مرزِ تریم افتاده؛ ممکن است اثرِ سال‌های ابتداییِ نمونه (انقلاب/جنگ) "
                           "باشد. به‌عنوان آزمونِ مقاومت، محدودکردن به دورهٔ پساتحریم توصیه می‌شود.")
            _tex_c = pub.cointegration_latex(_eg if _eg.get("ok") else None,
                                             _ardl if _ardl.get("ok") else None,
                                             _gh if _gh.get("ok") else None)
            st.download_button("⬇ دانلود جدول هم‌انباشتگی (LaTeX · booktabs)", data=_tex_c,
                               file_name="cointegration_tests.tex", mime="text/plain", key="dl_coint")
        else:
            st.info("داده کافی برای آزمون‌های هم‌انباشتگی نیست.")

    # ── ECM واقعی (تصحیح خطا) + ترکیب ──
    st.markdown("##### ۱.۲) ECM — مدل تصحیح خطا و سرعت تعدیل")
    if ecm_info.get("ok"):
        e1, e2, e3, e4 = st.columns(4)
        e1.metric("سرعت تعدیل α", f"{ecm_info['alpha']:+.3f}",
                  "معنادار" if abs(ecm_info.get("alpha_t", 0)) > 1.96 else "ضعیف")
        e2.metric("t آمارهٔ α", f"{ecm_info.get('alpha_t', float('nan')):.2f}")
        e3.metric("R² بلندمدت", f"{ecm_info.get('r2', float('nan')):.2f}")
        e4.metric("نرخ ذاتی ECM", f"{ecm_now:,.0f} ﺗﻮﻣﺎن" if not np.isnan(ecm_now) else "—")
        if ecm_info.get("is_cointegrated") is False:
            st.warning(
                "⚠️ آزمون هم‌انباشتگی Engle-Granger رد شد؛ هرچند α منفی است (نشانهٔ "
                "بازگشت جزئی به تعادل)، رابطهٔ بلندمدت از نظر آماری قطعی نیست. "
                "با تعداد کم مشاهدهٔ سالانه و گسست‌های ۱۳۹۰/۱۳۹۷ این طبیعی است.")
        else:
            st.success("✅ هم‌انباشتگی تأیید شد — ECM رابطهٔ تعادلی معتبری دارد.")
        if ecm_info.get("alpha", 0) < 0:
            st.caption(f"α={ecm_info['alpha']:.2f} یعنی هر سال حدود "
                       f"**{abs(ecm_info['alpha'])*100:.0f}٪** از انحراف تعادلی سال قبل تصحیح می‌شود.")
    else:
        st.info(f"ECM برآورد نشد: {ecm_info.get('reason', 'داده ناکافی')}")

    # ── نرخ ترکیبی (Ensemble) ──
    st.markdown("##### ۱.۳) نرخ ترکیبی (Ensemble)")
    if ensemble_val is not None and not ensemble_val.dropna().empty:
        ens_gap = (manual_rate - ens_now) / ens_now * 100
        g1, g2 = st.columns(2)
        g1.metric(f"ارزش ذاتی ترکیبی ({last_year})", f"{ens_now:,.0f} ﺗﻮﻣﺎن", f"شکاف {ens_gap:+.0f}٪",
                  delta_color="inverse")
        g2.metric("مدل‌های ترکیب‌شده", "، ".join(_ens_parts.keys()))
        st.caption("میانگین هندسی مدل‌ها (PPP، پولی، ECM، BEER). با وزن معکوس خطای backtest، "
                   "خروجی out-of-sample معمولاً از هر مدل منفرد پایدارتر است.")
    else:
        st.info("نرخ ترکیبی قابل محاسبه نیست.")

    # ── OLS Frenkel-Bilson ──
    st.markdown("##### ۱.۵) Frenkel-Bilson — برآورد OLS ضرایب α, φ, λ")
    if not market_annual.empty:
        fb = ec.estimate_frenkel_bilson(df, combined_rates)
        if fb.get("ok"):
            rows = []
            for name, c in fb["coefs"].items():
                sig = "★★★" if abs(c["t"]) > 2.58 else ("★★" if abs(c["t"]) > 1.96 else ("★" if abs(c["t"]) > 1.64 else ""))
                rows.append({"ضریب": name, "β": f"{c['beta']:.3f}",
                             "SE": f"{c['se']:.3f}", "t": f"{c['t']:.2f}",
                             "معناداری": sig})
            st.dataframe(pd.DataFrame(rows), width="stretch", hide_index=True)
            kk1, kk2, kk3 = st.columns(3)
            kk1.metric("R²", f"{fb['r2']:.3f}")
            kk2.metric("نمونه (سال)", f"{fb['n']}")
            kk3.metric("نرخ بهره؟", "بله" if fb["has_interest"] else "خیر")
            st.caption(f"📝 {fb['note']} — معناداری: ★ ۱۰٪، ★★ ۵٪، ★★★ ۱٪")
            # تفسیر صادقانه: کدام ضرایب واقعاً معنادارند؟
            sig_names = [n for n, c in fb["coefs"].items() if abs(c["t"]) > 1.64]
            insig_names = [n for n, c in fb["coefs"].items() if abs(c["t"]) <= 1.0]
            if fb["r2"] >= 0.4 and insig_names:
                st.warning(
                    "🔎 **تفسیر صادقانه:** هرچند R² بالا به‌نظر می‌رسد، اما ضرایب "
                    f"{'، '.join(insig_names)} از نظر آماری **بی‌معنی‌اند (|t|<۱)**. "
                    + (f"قدرت توضیحی مدل عمدتاً از {'، '.join(sig_names)} می‌آید "
                       "(پراکسی نرخ بهره/تورم)، نه از بخش پولی (α, φ). "
                       if sig_names else "")
                    + "بنابراین این برازش را نباید شاهدی بر اعتبار مکانیسم «پولی» Frenkel-Bilson "
                      "دانست؛ با تعداد کم مشاهده، R² بالا می‌تواند گمراه‌کننده باشد.")
        else:
            st.info(f"برآورد Frenkel-Bilson ناممکن: {fb.get('reason','')}")

    # ── PSY (GSADF/BSADF) — رفتار انفجاریِ انحراف از بنیادی ──
    st.markdown("##### ۲) PSY — رفتار انفجاری نسبت به ارزش بنیادی")
    if live["ok"]:
        # داده ماهانه برای کاهش هزینه محاسباتی
        h = live["history"].copy()
        h["month"] = h["dt"].dt.to_period("M")
        monthly = h.groupby("month")["close_toman"].mean()
        monthly.index = monthly.index.to_timestamp()
        # حذف صفر/NaN قبل از لگاریتم
        monthly = monthly.replace(0, np.nan).dropna()

        # ── متغیرِ هدف: نسبتِ بازار به بنیادی، نه نرخِ اسمی ──
        _usa_infl = df.set_index("year_shamsi")["usa_infl"] if "usa_infl" in df.columns else None
        fund_m, fund_how = monthly_fundamental(ppp, _usa_infl, pd.Series(monthly.index))

        if fund_how and len(fund_m) >= 40:
            target = psy.misalignment_target(monthly.reindex(fund_m.index), fund_m)
            target_label = "log(بازار ÷ PPP)"
            if fund_how == "cpi":
                st.info(
                    "✅ آزمون روی **نسبتِ نرخ بازار به ارزشِ بنیادیِ PPP** اجرا می‌شود. بنیادیِ ماهانه از "
                    "**CPI ماهانهٔ واقعیِ ایران** ساخته و به PPP سالانهٔ داشبورد بنچ‌مارک شده است "
                    "(سطح از سری سالانه، شکلِ درون‌سال از CPI). اجرای PSY روی لگاریتمِ نرخِ اسمی در "
                    "اقتصادی با تورمِ ~۵۰٪ ریشهٔ انفجاری را از خودِ روندِ تورمی می‌گیرد، نه از حباب.")
            else:
                st.warning(
                    "🟡 آزمون روی **نسبتِ بازار به PPP** اجرا می‌شود، اما CPI ماهانه در دسترس نبود و "
                    "بنیادی با **درون‌یابیِ لگاریتم-خطیِ PPP سالانه** ساخته شده است. درون‌یابی "
                    "اطلاعاتِ درون‌سال نمی‌سازد، پس دنبالهٔ BSADF هموارتر از حقیقت است — این محدودیت "
                    "باید در بخشِ روش‌شناسیِ مقاله ذکر شود.")
        else:
            target = np.log(monthly)
            target_label = "log(نرخ اسمی) — ناقص"
            st.error(
                "⚠️ سری بنیادیِ ماهانه ساخته نشد، پس آزمون روی **نرخِ اسمی** اجرا شد. "
                "**این نتیجه برای مقاله قابلِ استناد نیست**؛ رفتارِ انفجاری در اینجا عمدتاً بازتابِ "
                "روندِ تورمی است، نه حباب.")

        _n_obs = len(target)
        if _n_obs < 50:
            st.warning(
                f"⚠️ **توانِ آماری پایین:** {_n_obs} مشاهدهٔ ماهانه. آزمونِ PSY زیرِ ~۵۰ مشاهده توانِ "
                "کمی دارد؛ نتیجهٔ «بدون رفتارِ انفجاری» را شاهدی بر نبودِ حباب نگیرید "
                "(خطای نوع دوم، نه تأییدِ فرضیهٔ صفر).")

        with st.spinner("اجرای PSY + شبیه‌سازیِ مقادیر بحرانی (بارِ اول کند است، سپس کش می‌شود)…"):
            res = get_psy(target)

        sadf = res.table
        # تاریخ‌گذاری فقط وقتی معتبر است که آزمونِ سوپریمم (GSADF) فرضِ صفر را رد کرده باشد.
        # قاعدهٔ نقطه‌ای به‌تنهایی روی قدم‌زدنِ تصادفی ۷۷٪ مثبتِ کاذب می‌دهد (مسئلهٔ آزمونِ چندگانه)،
        # با قاعدهٔ حداقل مدت ۳۴٪، و تنها با گیتِ GSADF به ~۹٪ می‌رسد. (شبیه‌سازیِ ۲۰۰ مسیر، n=120)
        stamped = sadf["is_explosive"] if res.significant else pd.Series(False, index=sadf.index)

        fig_sadf = go.Figure()
        fig_sadf.add_trace(go.Scatter(x=sadf.index, y=monthly.reindex(sadf.index).values,
                                      name="نرخ ماهانه", yaxis="y1",
                                      line=dict(color=C["navy"], width=2.5)))
        fig_sadf.add_trace(go.Scatter(x=sadf.index, y=sadf["bsadf"],
                                      name="آماره BSADF", yaxis="y2",
                                      line=dict(color=C["gold"], width=2)))
        fig_sadf.add_trace(go.Scatter(x=sadf.index, y=sadf["cv95"],
                                      name="CV ۹۵٪ (Monte-Carlo، دنباله‌ای)", yaxis="y2",
                                      line=dict(color="red", width=1.5, dash="dot")))
        bubble_pts = sadf[stamped]
        if not bubble_pts.empty:
            fig_sadf.add_trace(go.Scatter(
                x=bubble_pts.index, y=monthly.reindex(bubble_pts.index).values,
                mode="markers", name="دورهٔ انفجاری",
                marker=dict(color="red", size=9, symbol="x")))

        brand_fig(fig_sadf, height=450, toman_yaxis=False)
        fig_sadf.update_layout(
            yaxis=dict(title="نرخ (ﺗﻮﻣﺎن)", tickformat=",.0f", ticksuffix=" ﺗﻮﻣﺎن"),
            yaxis2=dict(title="BSADF", overlaying="y", side="right", showgrid=False),
            xaxis_title="تاریخ",
        )
        st.plotly_chart(fig_sadf, width="stretch")

        # ── جدولِ گزارش‌شدنی در مقاله ──
        k1, k2, k3, k4 = st.columns(4)
        k1.metric("GSADF", f"{res.gsadf:.3f}")
        k2.metric("CV ۹۵٪", f"{res.gsadf_cv[0.95]:.3f}")
        k3.metric("p-value", f"{res.gsadf_pvalue:.3f}")
        k4.metric("تأخیر (BIC)", f"{res.k}")

        n_bub = int(stamped.sum())
        if res.significant and n_bub > 0:
            st.error(f"🔴 فرضیهٔ صفرِ ریشهٔ واحد در سطحِ ۵٪ رد شد "
                     f"(GSADF={res.gsadf:.3f} > CV₉₅={res.gsadf_cv[0.95]:.3f}). "
                     f"**{n_bub} ماه** در دوره‌های انفجاریِ معتبر قرار دارند "
                     f"(حداقل مدت {res.min_duration} ماه).")
        elif res.significant:
            st.warning("🟡 آمارهٔ GSADF معنادار است اما هیچ دورهٔ پیوسته‌ای قاعدهٔ حداقل مدت "
                       f"({res.min_duration} ماه) را برآورده نکرد — احتمالاً جهش‌های کوتاه، "
                       "نه انحرافِ پایدار.")
        else:
            st.success(f"🟢 رفتارِ انفجاری معنادار شناسایی نشد "
                       f"(GSADF={res.gsadf:.3f} ≤ CV₉₅={res.gsadf_cv[0.95]:.3f}).")
            st.caption("⚠️ «عدمِ شناسایی» نبودِ حباب را اثبات نمی‌کند؛ خطای نوع دوم محتمل است.")

        for w in res.warnings_:
            st.caption(f"⚠️ {w}")

        with st.expander("مشخصاتِ آزمون (برای بخشِ روش‌شناسیِ مقاله)"):
            _how = {"cpi": "CPI ماهانهٔ واقعی، بنچ‌مارک‌شده به PPP سالانه",
                    "interp": "درون‌یابیِ لگاریتم-خطیِ PPP سالانه (محدودیت: بدونِ اطلاعاتِ درون‌سال)",
                    "": "—"}[fund_how]
            st.markdown(f"""
- **متغیرِ هدف:** {target_label}
- **ساختِ بنیادیِ ماهانه:** {_how}
- **تصریح:** ADF با ثابت، بدونِ روند؛ تأخیر با BIC از ۰ تا ۴ ⇒ k = {res.k}
- **پنجرهٔ حداقلی:** r₀ = {res.r0:.3f} ⇒ w₀ = {res.min_window} مشاهده (قاعدهٔ PSY: r₀ = 0.01 + 1.8/√n)
- **مقادیرِ بحرانی:** Monte-Carlo، {res.n_sim} تکرار، فرضِ صفرِ قدم‌زدنِ تصادفی با εₜ ~ N(0,1)،
  seed = {res.seed}. CV **دنباله‌ای** (pointwise) است نه ثابت. سوپریمم در شبیه‌سازی روی همان
  شبکهٔ گامِ ۱ گرفته می‌شود که روی داده — گامِ درشت‌تر CV را پایین و اندازهٔ آزمون را متورم می‌کند.
- **قاعدهٔ تاریخ‌گذاری:** دورهٔ پیوسته با طول ≥ log(n) = {res.min_duration}، **مشروط به ردِ GSADF**.
  بدونِ این شرط، قاعدهٔ نقطه‌ای روی قدم‌زدنِ تصادفی ~۷۷٪ مثبتِ کاذب می‌دهد.
- **تعدادِ مشاهدات:** {_n_obs} (ماهانه)
- **اصطلاح:** خروجی «رفتارِ انفجاری/انحراف» است، نه اثباتِ حبابِ عقلایی — اثباتِ حباب نیازمندِ
  ردِ همهٔ مدل‌های بنیادیِ جایگزین است.
- **مرجع:** Phillips, Shi & Yu (2015), *IER* 56(4), 1043–1078.
""")
    else:
        st.info("برای آزمونِ PSY نیاز به دادهٔ زندهٔ tgju است.")

    # ── Monte Carlo Fan Chart ──
    st.markdown("##### ۳) Monte Carlo — پیش‌بینی احتمالاتی با GARCH")
    if live["ok"]:
        mu_m, sigma_m = ec.estimate_drift_vol(live["history"])
        # محاسبه بازده لگاریتمی با حذف مقادیر صفر/منفی
        _series = live["history"]["close_toman"].replace(0, np.nan).dropna()
        garch = ec.fit_garch(np.log(_series).diff().dropna())
        # نوسان شرطی از GARCH (مقیاس روزانه → ماهانه)
        sigma_garch_m = garch["sigma"] * np.sqrt(22)
        sigma_used = max(sigma_m, sigma_garch_m)

        # رانش از سناریوی انتخابی کاربر
        mu_scenario = np.log((1 + infl_iran / 100) / (1 + infl_usa / 100)) / 12
        col_a, col_b = st.columns(2)
        with col_a:
            mu_choice = st.radio("منبع رانش ماهانه:",
                                 ["تاریخی (از نرخ‌های روزانه)", "از سناریو تورمی فعلی"],
                                 index=1, horizontal=False)
        with col_b:
            n_paths = st.slider("تعداد مسیر شبیه‌سازی", 200, 5000, 1000, 100)
        mu_final = mu_m if mu_choice.startswith("تاریخی") else mu_scenario

        shock_choice = st.radio(
            "منبع شوک:",
            ["نرمال (GBM/GARCH)", "Bootstrap از پسماند backtest"],
            horizontal=True,
            help="Bootstrap از پسماند: شوک‌ها از خطای walk-forward مدل PPP نمونه‌گیری می‌شوند — "
                 "اگر توزیع پسماند کشیده/چوله باشد، باندها واقع‌گرایانه‌تر می‌شوند.",
        )

        with st.spinner(f"شبیه‌سازی {n_paths} مسیر…"):
            bootstrap_ok = False
            if shock_choice.startswith("Bootstrap") and not combined_rates.empty:
                try:
                    bt_for_resid = bt.walk_forward(df, combined_rates, "ppp",
                                                    start_year=1390,
                                                    end_year=int(combined_rates.index.max()))
                    resid = fct.backtest_residuals_from(bt_for_resid)
                    if len(resid.dropna()) >= 5:
                        fan = fct.fan_chart(
                            start_rate=manual_rate, start_shamsi=start_shamsi,
                            n_months=horizon, monthly_drift=mu_final,
                            monthly_sigma=sigma_used, backtest_residuals=resid,
                            n_paths=n_paths,
                        )
                        paths = fan.attrs.get("paths")
                        bootstrap_ok = paths is not None
                except Exception as _e:  # noqa: BLE001
                    st.warning(f"Bootstrap ناموفق ({_e}) — بازگشت به GBM نرمال.")
            if not bootstrap_ok:
                paths = ec.monte_carlo_paths(manual_rate, mu_final, sigma_used,
                                             n_months=horizon, n_paths=n_paths)
                fan = ec.fan_chart(paths)
                fan["label"] = ds.forward_month_labels(start_shamsi, horizon)

        fig_mc = go.Figure()
        # بازه‌های اطمینان (از بیرون به درون)
        fig_mc.add_trace(go.Scatter(x=fan["label"], y=fan["p95"], name="۹۵٪ بالا",
                                    line=dict(width=0), showlegend=False))
        fig_mc.add_trace(go.Scatter(x=fan["label"], y=fan["p5"], name="۹۰٪ اطمینان",
                                    fill="tonexty", fillcolor="rgba(184,134,11,.15)",
                                    line=dict(width=0)))
        fig_mc.add_trace(go.Scatter(x=fan["label"], y=fan["p80"], name="۸۰٪ بالا",
                                    line=dict(width=0), showlegend=False))
        fig_mc.add_trace(go.Scatter(x=fan["label"], y=fan["p20"], name="۶۰٪ اطمینان",
                                    fill="tonexty", fillcolor="rgba(184,134,11,.35)",
                                    line=dict(width=0)))
        fig_mc.add_trace(go.Scatter(x=fan["label"], y=fan["p50"], name="میانه (p50)",
                                    line=dict(color=C["navy"], width=3.5),
                                    mode="lines+markers", marker=dict(size=9),
                                    hovertemplate="%{x}<br><b>%{y:,.0f} ﺗﻮﻣﺎن</b><extra>میانه</extra>"))
        brand_fig(fig_mc, height=480)
        fig_mc.update_layout(yaxis_title="تومان / دلار", xaxis_title="ماه شمسی",
                             xaxis_tickangle=-30, hovermode="x unified")
        st.plotly_chart(fig_mc, width="stretch")

        kk1, kk2, kk3 = st.columns(3)
        kk1.metric("رانش ماهانه برآوردی", f"{mu_final*100:+.2f}٪")
        kk2.metric("نوسان ماهانه (GARCH)", f"{sigma_used*100:.2f}٪")
        kk3.metric(f"میانه افق {horizon} ماه", f"{fan['p50'].iloc[-1]:,.0f} ﺗﻮﻣﺎن")

        st.dataframe(
            fan[["label", "p5", "p20", "p50", "p80", "p95"]].assign(
                p5=fan["p5"].round(0).map("{:,.0f}".format),
                p20=fan["p20"].round(0).map("{:,.0f}".format),
                p50=fan["p50"].round(0).map("{:,.0f}".format),
                p80=fan["p80"].round(0).map("{:,.0f}".format),
                p95=fan["p95"].round(0).map("{:,.0f}".format),
            ).rename(columns={
                "label": "ماه", "p5": "۵٪ (تومان)", "p20": "۲۰٪ (تومان)",
                "p50": "میانه (تومان)", "p80": "۸۰٪ (تومان)", "p95": "۹۵٪ (تومان)",
            }),
            width="stretch", hide_index=True,
        )
        st.caption("شبیه‌سازی هندسی براونی (log-normal) با نوسان GARCH(1,1). "
                   "بازه ۹۰٪ نشان می‌دهد نرخ آینده با احتمال ۹۰٪ بین این دو خط قرار می‌گیرد.")
    else:
        st.info("برای پیش‌بینی Monte Carlo نیاز به داده زنده tgju است.")


# ── تب ۶: اعتبارسنجی گذشته‌نگر (Walk-Forward Backtest) ──────────────────────
with t6:
    st.subheader("🧪 Walk-Forward Backtest — اعتبار مدل‌ها در گذشته")
    st.markdown("در هر سال، مدل **فقط با داده تا سال قبل** برآورد می‌شود (بدون look-ahead). "
                "سپس پیش‌بینی با نرخ واقعی بازار مقایسه می‌گردد. معیار طلایی: **Theil's U < 1** "
                "یعنی مدل از قدم‌زنی تصادفی بهتر است.")
    if not combined_rates.empty:
        years_avail = sorted(combined_rates.dropna().index.astype(int).tolist())
        y_min, y_max = years_avail[0] + 2, years_avail[-1]
        bc1, bc2 = st.columns(2)
        with bc1:
            default_start = max(min(1390, y_max), y_min)
            bt_start = st.number_input("سال شروع ارزیابی:",
                                       min_value=y_min, max_value=y_max,
                                       value=default_start, step=1)
        with bc2:
            bt_end = st.number_input("سال پایان ارزیابی:",
                                     min_value=int(bt_start), max_value=y_max,
                                     value=y_max, step=1)

        lookback = st.slider(
            "افق لنگر (lookback سال پایه):", 1, 5, 1,
            help="فاصله سال پایه از سال پیش‌بینی. lookback=1 یعنی لنگر غلتانِ "
                 "یک‌قدم‌جلوتر (دقیق‌ترین). مقادیر بزرگ‌تر = آزمون افق بلندتر "
                 "(خطا بیشتر، واقع‌گرایانه‌تر برای پیش‌بینی چندساله).")

        models_to_test = ["ppp", "monetary_basic"]
        if tier >= 2:
            models_to_test.append("monetary_velocity")
        if tier >= 3:
            models_to_test.append("ecm")  # ECM پویا فقط در لایهٔ پیشرفته

        with st.spinner("اجرای walk-forward روی همه مدل‌ها…"):
            comp = bt.compare_models(df, combined_rates, bt_start, bt_end,
                                     models_list=tuple(models_to_test),
                                     lookback=lookback)
        st.markdown("##### مقایسه مدل‌ها")
        _disp = comp.copy()
        _disp["RMSE"] = _disp["RMSE"].map(lambda v: f"{v:,.0f}" if pd.notna(v) else "—")
        _disp["MAE"] = _disp["MAE"].map(lambda v: f"{v:,.0f}" if pd.notna(v) else "—")
        _disp["MAPE_%"] = _disp["MAPE_%"].map(lambda v: f"{v:.1f}٪" if pd.notna(v) else "—")
        _disp["Theils_U"] = _disp["Theils_U"].map(lambda v: f"{v:.3f}" if pd.notna(v) else "—")
        _disp["DM (مدل↔RW)"] = [
            (f"{s:+.2f}{pub.sig_stars(p)}" if pd.notna(s) else "—")
            for s, p in zip(comp.get("DM_stat", []), comp.get("DM_p", []))
        ]
        _disp = _disp.drop(columns=["DM_stat", "DM_p", "Naive_RMSE", "_key"], errors="ignore")
        st.dataframe(_disp, width="stretch", hide_index=True)
        st.caption("🟢 Theil's U < 1 ⇒ بهتر از قدم‌زنی تصادفی (RW). "
                   "**اما U به‌تنهایی کافی نیست** — ستون DM (Diebold–Mariano) می‌گوید آیا تفاوت "
                   "**از نظر آماری معنادار** است: مقدارِ منفی = برتریِ مدل؛ ستاره‌ها * p<۰٫۱۰، ** p<۰٫۰۵، *** p<۰٫۰۱. "
                   "نبودِ ستاره ⇒ نمی‌توان ادعا کرد مدل واقعاً از RW بهتر است (درسِ Meese–Rogoff 1983).")
        _tex = pub.comparison_latex(comp)
        st.download_button("⬇ دانلود جدول مقایسه (LaTeX · booktabs)", data=_tex,
                           file_name="model_comparison.tex", mime="text/plain")

        # نمودار actual vs predicted برای مدل انتخابی
        st.markdown("##### نمودار پیش‌بینی در برابر واقعیت")
        chosen = st.selectbox("مدل:", models_to_test,
                              format_func=lambda k: m.MODEL_INFO[k]["name"])
        bt_res = bt.walk_forward(df, combined_rates, chosen, bt_start, bt_end,
                                 lookback=lookback)
        if not bt_res.empty:
            fig_bt = go.Figure()
            fig_bt.add_trace(go.Scatter(x=bt_res["year"], y=bt_res["actual"],
                                        name="واقعی (بازار)", mode="lines+markers",
                                        line=dict(color=C["navy"], width=3.5)))
            fig_bt.add_trace(go.Scatter(x=bt_res["year"], y=bt_res["predicted"],
                                        name="پیش‌بینی مدل", mode="lines+markers",
                                        line=dict(color=C["gold"], width=3, dash="dash")))
            fig_bt.add_trace(go.Scatter(x=bt_res["year"], y=bt_res["naive_rw"],
                                        name="قدم‌زنی تصادفی", mode="lines",
                                        line=dict(color=C["mute"], width=1.5, dash="dot")))
            brand_fig(fig_bt, height=460)
            fig_bt.update_layout(xaxis_title="سال شمسی",
                                 yaxis_title="نرخ (تومان)",
                                 hovermode="x unified")
            st.plotly_chart(fig_bt, width="stretch")

            # تقسیم رژیمی
            st.markdown("##### عملکرد در دو رژیم (پیش/پس از ۱۳۹۷)")
            regimes = bt.regime_split(bt_res, 1397)
            reg_df = pd.DataFrame(regimes).T
            st.dataframe(reg_df.round(2), width="stretch")
            st.caption("🔍 رفتار مدل در دوران پیش از شوک ۱۳۹۷ معمولاً بهتر از پس از آن است — "
                       "گسست ساختاری و تغییر V باعث افت اعتبار مدل می‌شود.")
    else:
        st.warning("داده نرخ بازار برای backtest موجود نیست.")


# ── تب ۷: روش‌شناسی ─────────────────────────────────────────────────────────
with t7:
    st.subheader("📚 روش‌شناسی مدل‌ها")
    st.markdown("هر مدل، مفروضات و شرایطی دارد که در آن می‌شکند. این بخش به شما می‌گوید "
                "چه زمانی به کدام مدل اعتماد کنید و چه زمانی نه.")

    for key, info in m.MODEL_INFO.items():
        with st.expander(f"Tier {info['tier']} — {info['name']}", expanded=(info["tier"] == tier)):
            st.markdown(f"**فرمول:**")
            st.latex(info["formula"])
            st.markdown("**فروض اصلی:**")
            for a in info["assumptions"]:
                st.markdown(f"- {a}")
            st.markdown("**کجا در ایران می‌شکند:**")
            for lim in info["limits_iran"]:
                st.markdown(f"- ⚠️ {lim}")

    st.markdown("---")
    st.markdown("### 🎯 قواعد کلیدی متدولوژیک")
    st.markdown("""
1. **برآورد روی فرکانس بومی، نمایش روی ماهانه.** درون‌یابی فقط برای ترازبندی نمایش، نه رگرسیون.
2. **دو شاخص قیمت متفاوت‌اند.** بانک مرکزی و مرکز آمار پس از ۱۳۹۷ واگرا می‌شوند.
3. **نرخ‌های متعدد ارز.** بازار آزاد ≠ نیما ≠ رسمی. حباب از بازار آزاد سنجیده می‌شود.
4. **پیش‌بینی بدون باند اطمینان قابل اعتماد نیست.** Monte Carlo حداقل ۱۰۰۰ مسیر.
5. **رفتار انفجاری باید با GSADF/BSADF آزمایش شود، نه با چشم** — و روی *انحراف از بنیادی*،
   نه نرخ اسمی؛ وگرنه با تورم ~۵۰٪ خودِ روند تورمی «انفجاری» خوانده می‌شود.
6. **«انحراف» ≠ «حباب عقلایی».** GSADF فقط ریشهٔ انفجاری را رد می‌کند؛ اثبات حباب
   نیازمند رد همهٔ مدل‌های بنیادیِ جایگزین است.
""")
    st.info("📖 منابع: Cassel (1918), Frenkel-Bilson-Mussa (1976), Meese-Rogoff (1983), "
            "Clark-MacDonald BEER (1998), Phillips-Wu-Yu (2011), Phillips-Shi-Yu (2015).")


# ── تب ۸: تفسیر هوشمند ───────────────────────────────────────────────────────
with t8:
    st.subheader("🧠 تفسیر هوشمند")
    notes = []
    if gap_ppp > 100:
        notes.append(f"🔴 **حباب مثبت شدید نسبت به PPP ({gap_ppp:+.0f}٪):** نرخ بازار چند برابر ارزش ذاتی است. "
                     "در ایران این الگو ترکیب سه عامل است: (۱) **پرمیوم ریسک تحریم** که هیچ مدل کلاسیکی آن را قیمت‌گذاری نمی‌کند، "
                     "(۲) **خروج سرمایه** و تقاضای دلار به‌عنوان ذخیره ارزش، (۳) **انتظارات تورمی فزاینده**. "
                     "انحراف بزرگ از PPP در اقتصاد تحریمی خطای مدل نیست، ویژگی ساختاری است.")
    elif gap_ppp > 25:
        notes.append(f"🟡 **حباب مثبت متوسط ({gap_ppp:+.0f}٪):** بازار جلوتر از ذاتیات تورمی حرکت می‌کند؛ احتمالاً تقاضای احتیاطی و انتظارات کوتاه‌مدت.")
    else:
        notes.append(f"🟢 **نزدیکی نسبی به PPP ({gap_ppp:+.0f}٪):** بازار همسو با ذاتیات تورمی — وضعیتی نادر که معمولاً پس از شوک تعدیل دیده می‌شود.")

    if m2_iran > infl_iran + 5:
        notes.append(f"⚠️ **شکاف نقدینگی-تورم:** رشد نقدینگی ({m2_iran}٪) فراتر از تورم ({infl_iran}٪) است. "
                     "بر اساس نظریه مقداری پول (Friedman)، این مازاد در میان‌مدت (۶–۱۸ ماه) به تورم و سپس نرخ ارز منتقل می‌شود.")

    if oil_price < 60:
        notes.append(f"🛢️ **قیمت نفت پایین ({oil_price}$):** در ترکیب با تحریم نفتی، درآمد ارزی کاهش و فشار بر تراز پرداخت‌ها افزایش می‌یابد. "
                     "وابستگی بودجه ایران به نفت، ضریب اثرگذاری این کانال را بالا می‌برد.")

    div = abs(ppp_now - mon_now) / ppp_now * 100
    if div > 20:
        notes.append(f"📊 **واگرایی PPP و پولی ({div:.0f}٪):** نقض فرض ثبات سرعت گردش پول (V). "
                     "در اقتصاد تورمی، خانوار سبد دارایی را به ارز و کالای بادوام منتقل می‌کند و V بی‌ثبات می‌شود.")

    if scenario == "بدبینانه" or oil_price < 55:
        notes.append("🚫 **نقش تحریم (متغیر پنهان):** نه PPP و نه مدل پولی، پرمیوم ریسک تحریم را مستقیم مدل نمی‌کنند. "
                     "بخش بزرگی از حباب پایدار (~۳۰–۵۰٪+) را می‌توان به این پرمیوم نسبت داد.")

    end = fc["ppp_toman"].iloc[-1]
    chg = (end - manual_rate) / manual_rate * 100
    notes.append(f"🔮 **چشم‌انداز {horizon} ماه آینده:** بر اساس مسیر PPP، نرخ از {manual_rate:,.0f} به حدود "
                 f"**{end:,.0f} تومان** می‌رسد (~{chg:+.0f}٪) — مشروط بر ثبات تورم {infl_iran}٪ و نبود شوک سیاسی.")

    for n in notes:
        st.markdown(n)

    # ── تحلیل عمیق با Gemini (در کنار تحلیل قاعده‌محور بالا) ──
    if gemini.is_configured():
        if st.button("🤖 تحلیل عمیق‌تر با هوش مصنوعی", key="ai_fx_interpret"):
            _ctx = (
                f"نرخ بازار فعلی: {manual_rate:,.0f} تومان\n"
                f"ارزش ذاتی PPP: {ppp_now:,.0f} | مدل پولی: {mon_now:,.0f} تومان\n"
                f"حباب نسبت به PPP: {gap_ppp:+.0f}%\n"
                f"تورم ایران: {infl_iran}% | رشد نقدینگی: {m2_iran}% | قیمت نفت: {oil_price}$ | سناریو: {scenario}\n"
                f"چشم‌انداز {horizon} ماه (مسیر PPP): حدود {end:,.0f} تومان ({chg:+.0f}%)"
            )
            _prompt = ("بر پایهٔ این وضعیت مدل‌های نرخ ارز ایران، تحلیلی ۴ تا ۶ جمله‌ای، فارسی و حرفه‌ای بده: "
                       "ریشهٔ حباب، ریسک‌های پیشِ‌رو و یک جمع‌بندی کاربردی. در پایان یک خط disclaimer.\n\n" + _ctx)
            with st.spinner("در حال تحلیل با Gemini…"):
                _r = gemini.ask(_prompt, system=assistant.SYSTEM_PROMPT)
            st.session_state["fx_ai"] = _r["text"] if _r.get("ok") else f"خطا: {_r.get('error')}"
        if st.session_state.get("fx_ai"):
            st.info(st.session_state["fx_ai"])

    st.markdown("---")
    st.caption("⚠️ این داشبورد ابزار **تحلیل سناریو** است نه پیش‌بینی قطعی. هر دو مدل در شرایط تحریم، چندنرخی بودن ارز و شوک‌های ساختاری "
               "اعتبار محدود دارند و باید در کنار شاخص‌های تراز پرداخت‌ها، ذخایر ارزی و ریسک ژئوپلیتیک تفسیر شوند.")

    with st.expander("📋 داده تاریخی اکسل"):
        st.dataframe(df, width="stretch", hide_index=True)

# ── تب ۹: نرخ بهره واقعی ─────────────────────────────────────────────────────
with t9:
    st.subheader("🏦 نرخ بهره واقعی: بازده اسمی در برابر تورم")
    ri = ds.load_real_interest_monthly()
    if ri is None or ri.empty:
        st.info("داده‌ی نرخ بهره/تورم در دسترس نیست (فایل تورم یا YTM اخزا یافت نشد).")
    else:
        x = list(ri.index)
        # ── نمودار ۱: نرخ بهره در برابر تورم ──
        st.markdown("##### نرخ بهره در برابر تورم")
        fig_ri = go.Figure()
        fig_ri.add_trace(go.Scatter(
            x=x, y=ri["ytm"], name="نرخ بدون ریسک (YTM)",
            mode="lines+markers", line=dict(color=C["navy"], width=3),
            marker=dict(size=6), connectgaps=False,
            hovertemplate="%{x}<br><b>%{y:.1f}٪</b><extra>YTM بدون ریسک</extra>"))
        fig_ri.add_trace(go.Scatter(
            x=x, y=ri["infl_pp"], name="تورم نقطه‌به‌نقطه",
            mode="lines", line=dict(color=C["gold"], width=3),
            hovertemplate="%{x}<br><b>%{y:.1f}٪</b><extra>تورم ن.ب.ن</extra>"))
        fig_ri.add_trace(go.Scatter(
            x=x, y=ri["infl_annual"], name="نرخ تورم سالانه (میانگین متحرک ۱۲ ماهه)",
            mode="lines", line=dict(color=C["gold_light"], width=2, dash="dot"),
            hovertemplate="%{x}<br><b>%{y:.1f}٪</b><extra>تورم سالانه</extra>"))
        brand_fig(fig_ri, height=440, toman_yaxis=False)
        fig_ri.update_layout(xaxis_title="ماه شمسی", yaxis_title="درصد (٪)",
                             yaxis_ticksuffix="٪", hovermode="x unified")
        st.plotly_chart(fig_ri, width="stretch")
        st.caption("نرخ بدون ریسک = میانگین ماهانهٔ بازدهٔ بدون‌ریسک بازار. هر دو سری تورم سالانه‌مقیاس‌اند: "
                   "**نقطه‌به‌نقطه** (مرجع) و **میانگین متحرک ۱۲ ماهه** (هدلاین رسمی مرکز آمار) — برای مقایسهٔ منصفانه با YTM.")

        # ── نمودار ۲: نرخ بهره واقعی ──
        st.divider()
        st.markdown("##### نرخ بهره واقعی = بهره منهای تورم")
        rr = ri["real_rate"].dropna()
        if rr.empty:
            st.info("بازه‌ی هم‌پوشان داده برای محاسبه‌ی بهره واقعی وجود ندارد.")
        else:
            xr = list(rr.index)
            colors = ["#C0392B" if v < 0 else C["navy"] for v in rr.values]
            fig_rr = go.Figure()
            fig_rr.add_trace(go.Bar(
                x=xr, y=rr.values, marker_color=colors, name="نرخ بهره واقعی",
                hovertemplate="%{x}<br><b>%{y:.1f}٪</b><extra>بهره واقعی</extra>"))
            fig_rr.add_hline(y=0, line_color=C["mute"], line_width=1)
            brand_fig(fig_rr, height=420, legend_bottom=False, toman_yaxis=False)
            fig_rr.update_layout(xaxis_title="ماه شمسی", yaxis_title="بهره واقعی (٪)",
                                 yaxis_ticksuffix="٪")
            st.plotly_chart(fig_rr, width="stretch")
            st.caption(
                f"بازه‌ی محاسبه: **{xr[0]}** تا **{xr[-1]}** (نرخ بهره واقعی = نرخ بدون ریسک منهای تورم نقطه‌به‌نقطه). "
                f"آخرین مقدار: **{rr.iloc[-1]:.1f}٪**. بهره واقعی عمیقاً منفی یعنی پولِ نگه‌داشته‌شده "
                "در بانک هر ماه ارزش واقعی خود را از دست می‌دهد — مالیات تورمی بر پس‌انداز و انگیزه‌ی فرار به دارایی‌ها.")

# ── تب ۱۰: بورس ──────────────────────────────────────────────────────────────
def _score_color(v, vmax):
    """رنگِ امتیاز: سبز=بالا، قرمز=پایین، خاکستری=بدون امتیاز (NaN)."""
    if pd.isna(v):
        return "#BFBCB2"
    t = max(-1.0, min(1.0, float(v) / vmax)) if vmax else 0.0
    base = (0xD9, 0xD6, 0xCC)  # کرم خنثی
    tip = (0x2E, 0x7D, 0x32) if t >= 0 else (0xC0, 0x39, 0x2B)  # سبز / قرمز
    t = abs(t)
    rgb = tuple(int(base[i] + (tip[i] - base[i]) * t) for i in range(3))
    return f"rgb({rgb[0]},{rgb[1]},{rgb[2]})"

with t10:
    st.subheader("📊 بورس تهران — تحلیل صنایع و نقشه‌ی سناریو")
    _bourse = get_bourse()
    if not _bourse:
        st.error("فایل «تحلیل_کامل_بورس_1405.xlsx» یافت نشد. آن را کنار داشبورد (همان پوشه‌ی app.py) قرار دهید.")
    else:
        ind = _bourse["industries"].copy()
        stk = _bourse["stocks"].copy()

        b1, b2, b3, b4 = st.columns(4)
        b1.metric("P/E میانه بازار", "۷.۶")
        b2.metric("تعداد صنایع", "۶۱")
        b3.metric("تعداد سهام", "۹۰۶")
        b4.metric("تاریخ داده", "خرداد ۱۴۰۵")

        st.info(
            "⚠️ **نکات تحلیلی (پیش از تصمیم):**\n"
            "- **بانک:** ROE بالا اغلب از تسعیر ارز/تجدید ارزیابی است، نه عملیات پایدار.\n"
            "- **سیمان:** P/B بالا (۵.۲) یعنی از نظر دارایی گران؛ فقط ROE توجیه‌گر است.\n"
            "- **نفتی/کود:** بازده گذشته عالی ولی حاشیه پایین؛ گذشته ≠ آینده.\n"
            "- **کشاورزی/شیرینی:** رشد نجومی ولی وزن کوچک = محدودیت نقدشوندگی."
        )

        # ۱) Treemap وزن صنایع
        st.markdown("##### ۱) نقشه‌ی بازار — وزن صنایع")
        tm = ind.dropna(subset=["وزن_بازار٪"]).copy()
        _vmax = float(pd.Series([abs(tm["امتیاز"].min()), abs(tm["امتیاز"].max())]).max())
        tm_colors = [_score_color(v, _vmax) for v in tm["امتیاز"]]
        fig_tm = go.Figure(go.Treemap(
            labels=tm["صنعت"], parents=[""] * len(tm), values=tm["وزن_بازار٪"],
            marker=dict(colors=tm_colors, line=dict(width=1, color="#fff")),
            text=[f"{w:.1f}٪" for w in tm["وزن_بازار٪"]], textinfo="label+text",
            hovertemplate="<b>%{label}</b><br>وزن بازار: %{value:.2f}٪<extra></extra>"))
        brand_fig(fig_tm, height=480, legend_bottom=False, toman_yaxis=False)
        st.plotly_chart(fig_tm, width="stretch")
        st.caption("اندازه = سهم از کل ارزش بازار؛ رنگ = جذابیت بنیادی (امتیاز مرکب): سبز بالاتر، قرمز پایین‌تر، خاکستری بدون امتیاز.")

        # ۲) رتبه‌بندی صنایع (Bar افقی)
        st.markdown("##### ۲) رتبه‌بندی صنایع بر پایه‌ی امتیاز مرکب")
        rk = ind.dropna(subset=["امتیاز"]).sort_values("امتیاز")  # صعودی → بالاترین در بالای نمودار
        rk_colors = ["#2E7D32" if v >= 0 else "#C0392B" for v in rk["امتیاز"]]
        fig_rank = go.Figure(go.Bar(
            y=rk["صنعت"], x=rk["امتیاز"], orientation="h", marker_color=rk_colors,
            hovertemplate="<b>%{y}</b><br>امتیاز: %{x:.2f}<extra></extra>"))
        fig_rank.add_vline(x=0, line_color=C["mute"], line_width=1)
        brand_fig(fig_rank, height=max(520, 19 * len(rk)), legend_bottom=False, toman_yaxis=False)
        fig_rank.update_layout(xaxis_title="امتیاز مرکب (z-score)", yaxis_title="")
        st.plotly_chart(fig_rank, width="stretch")
        st.caption("بالای صفر = بهتر از میانگین بازار. امتیاز = میانگین z-score چهار بُعد (ارزش، رشد، کیفیت، حاشیه) با وزن مساوی.")

        # ۳) ⭐ نقشه‌ی سناریو (Scatter)
        st.markdown("##### ۳) ⭐ نقشه‌ی سناریو — دلاری٪ در برابر امتیاز")
        sm = ind.dropna(subset=["امتیاز", "دلاری٪"]).copy()
        _sref = 2.0 * float(sm["وزن_بازار٪"].max()) / (60.0 ** 2)
        fig_scn = go.Figure(go.Scatter(
            x=sm["دلاری٪"], y=sm["امتیاز"], mode="markers+text",
            text=sm["صنعت"], textposition="top center", textfont=dict(size=9, color=C["text"]),
            marker=dict(size=sm["وزن_بازار٪"], sizemode="area", sizeref=_sref, sizemin=4,
                        color=sm["امتیاز"], cmid=0,
                        colorscale=[[0, "#C0392B"], [0.5, "#D9D6CC"], [1, "#2E7D32"]],
                        line=dict(width=1, color="#fff"),
                        colorbar=dict(title="امتیاز")),
            hovertemplate="<b>%{text}</b><br>دلاری: %{x:.0f}٪<br>امتیاز: %{y:.2f}<br>وزن بازار: %{marker.size:.2f}٪<extra></extra>"))
        fig_scn.add_vline(x=50, line_dash="dash", line_color=C["mute"], line_width=2)
        _ytop = float(sm["امتیاز"].max())
        fig_scn.add_annotation(x=78, y=_ytop, text="برنده‌ی تضعیف ریال (تشدید تنش)",
                               showarrow=False, font=dict(size=12, color="#C0392B"))
        fig_scn.add_annotation(x=22, y=_ytop, text="برنده‌ی تقویت ریال (گشایش)",
                               showarrow=False, font=dict(size=12, color="#2E7D32"))
        brand_fig(fig_scn, height=560, legend_bottom=False, toman_yaxis=False)
        fig_scn.update_layout(xaxis_title="دلاری٪ (سهم شرکت‌های صادرات‌محور)",
                              yaxis_title="امتیاز مرکب", xaxis_ticksuffix="٪")
        st.plotly_chart(fig_scn, width="stretch")
        st.caption("هر نقطه یک صنعت؛ اندازه = وزن بازار. سمت راستِ خطِ ۵۰٪ (دلاری‌بالا) برنده‌ی سناریوی تضعیف ریال "
                   "(تشدید تنش ژئوپلیتیک)، سمت چپ (ریالی/داخلی‌محور) برنده‌ی گشایش/تقویت ریال است.")
        st.warning("ستون «دلاری» بر پایه‌ی شرکت‌هایی است که داده‌ی خالص ارزی دارند (~۲۷٪ کل بازار)؛ "
                   "جهت‌گیری معتبر است، عددِ دقیق نه.")

        # ۴) کاوشگر سهام هر صنعت
        st.markdown("##### ۴) کاوشگر سهام هر صنعت")
        _opts = sorted(stk["صنعت"].dropna().unique().tolist())
        _def = _opts.index("بانکها و موسسات اعتباری") if "بانکها و موسسات اعتباری" in _opts else 0
        pick = st.selectbox("انتخاب صنعت:", _opts, index=_def, key="bourse_industry")
        _row = ind[ind["صنعت"] == pick]
        e1, e2, e3 = st.columns(3)
        if not _row.empty:
            r = _row.iloc[0]
            _pe = pd.to_numeric(r["PE"], errors="coerce")
            _roe = pd.to_numeric(r["ROE"], errors="coerce")
            _cnt = pd.to_numeric(r["تعداد"], errors="coerce")
            e1.metric("P/E میانه صنعت", f"{_pe:.1f}" if pd.notna(_pe) else "—")
            e2.metric("ROE صنعت", f"{_roe:.0f}٪" if pd.notna(_roe) else "—")
            e3.metric("تعداد سهم", f"{int(_cnt)}" if pd.notna(_cnt) else "—")
        _cols = ["نماد", "شرکت", "قیمت", "PE", "ROE", "رشد_سود", "بازده_1y", "ارزش_بازار_همت"]
        _t = stk[stk["صنعت"] == pick].sort_values("ارزش_بازار_همت", ascending=False)[_cols].copy()
        # برخی سلول‌ها رشته‌اند (مثلاً قیمت = '-')؛ پیش از فرمت به عدد تبدیل می‌شوند تا کرش نکند
        for _c in ["قیمت", "ارزش_بازار_همت", "PE", "ROE", "رشد_سود", "بازده_1y"]:
            _t[_c] = pd.to_numeric(_t[_c], errors="coerce")
        _t["قیمت"] = _t["قیمت"].map(lambda v: f"{v:,.0f}" if pd.notna(v) else "—")
        _t["ارزش_بازار_همت"] = _t["ارزش_بازار_همت"].map(lambda v: f"{v:,.1f}" if pd.notna(v) else "—")
        _t["PE"] = _t["PE"].map(lambda v: f"{v:.1f}" if pd.notna(v) else "—")
        for _c in ["ROE", "رشد_سود", "بازده_1y"]:
            _t[_c] = _t[_c].map(lambda v: f"{v:.0f}٪" if pd.notna(v) else "—")
        st.dataframe(_t, hide_index=True, width="stretch")
        st.caption(f"سهام صنعت «{pick}» مرتب بر ارزش بازار (همت)، نزولی. منبع: فایل تحلیل بورس خرداد ۱۴۰۵.")

# ── تب ۱۱: حباب طلا، سکه و صندوق‌ها ──────────────────────────────────────────
with t11:
  @st.fragment(run_every="300s")   # آپدیت خودکار هر ۵ دقیقه — فقط همین بخش
  def render_bubble_tab():
    st.subheader("💎 حباب لحظه‌ای طلا، سکه و صندوق‌های طلا/نقره")
    st.caption("حباب = انحراف قیمت بازار از ارزش ذاتی. منبع لحظه‌ای طلا/سکه: etfbaz (با fallback به tgju) · "
               "منبع NAV صندوق‌ها: TSETMC · آپدیت خودکار هر ۵ دقیقه.")

    cbtn, cinfo = st.columns([1, 4])
    with cbtn:
        if st.button("🔄 به‌روزرسانی", key="refresh_bubbles"):
            get_bubbles.clear()

    bub = get_bubbles()
    if not bub["ok"]:
        st.error(f"❌ دریافت داده ناموفق بود: {bub.get('error') or 'نامشخص'} — اتصال اینترنت/فیلترشکن را بررسی کنید.")
    else:
        inp = bub["inputs"]
        rows = bub["rows"]
        st.caption(f"🕓 آخرین داده: **{bub['ts_shamsi']}** · منبع: {bub.get('source') or '—'}")

        # ── ورودی‌های پایهٔ بازار ──
        def _fmt(v, suf="", dash="—"):
            return f"{v:,.0f}{suf}" if pd.notna(v) else dash
        ic1, ic2, ic3, ic4 = st.columns(4)
        ic1.metric("دلار آزاد", _fmt(inp.get("dollar_toman"), " ﺗ"),
                   inp.get("dollar_change") or None)
        ic2.metric("انس جهانی طلا", _fmt(inp.get("ons_usd"), " $"),
                   inp.get("ons_change") or None)
        ic3.metric("طلای ۱۸ عیار (گرم)", _fmt(inp.get("geram18_toman"), " ﺗ"))
        ic4.metric("پاریتهٔ جهانی هر گرم خالص", _fmt(inp.get("parity_toman"), " ﺗ"))

        st.markdown("##### حباب هر ابزار")
        # هر بازده مثبت = گران‌تر از ارزش ذاتی (هشدار) → دلتای معکوس (مثبت قرمز)
        bcols = st.columns(len(rows))
        for col, r in zip(bcols, rows):
            bp = r["bubble_pct"]
            col.metric(
                r["name"],
                f"{bp:+.1f}٪" if pd.notna(bp) else "—",
                delta=(r.get("change_pct") or None),
            )
            col.caption(f"بازار: {_fmt(r['market_toman'])} ﺗ" +
                        (f" · ذاتی: {_fmt(r['intrinsic_toman'])} ﺗ" if pd.notna(r["intrinsic_toman"]) else ""))

        # ── نمودار میله‌ای افقی حباب ──
        valid = [r for r in rows if pd.notna(r["bubble_pct"])]
        if valid:
            valid_sorted = sorted(valid, key=lambda r: r["bubble_pct"])
            names = [r["name"] for r in valid_sorted]
            vals = [r["bubble_pct"] for r in valid_sorted]
            # رنگ‌بندی: حباب بالا قرمز، متوسط طلایی، منفی سبز
            def _col(v):
                if v < 0:
                    return "#2e7d32"
                if v < 5:
                    return C["gold"]
                if v < 12:
                    return C["gold_dark"]
                return "#c0392b"
            colors = [_col(v) for v in vals]
            figb = go.Figure(go.Bar(
                x=vals, y=names, orientation="h",
                marker=dict(color=colors),
                text=[f"{v:+.1f}٪" for v in vals],
                textposition="outside",
                hovertemplate="%{y}<br><b>حباب: %{x:+.2f}٪</b><extra></extra>",
            ))
            figb.add_shape(type="line", xref="x", yref="paper",
                           x0=0, x1=0, y0=0, y1=1,
                           line=dict(color=C["mute"], width=1.5, dash="dot"))
            brand_fig(figb, height=380, legend_bottom=False, toman_yaxis=False)
            figb.update_xaxes(ticksuffix="٪", title="حباب (درصد)")
            figb.update_layout(margin=dict(t=20, b=20, l=20, r=60))
            st.plotly_chart(figb, width="stretch")

        # ── جدول کامل ──
        df = pd.DataFrame(rows)
        disp = pd.DataFrame({
            "ابزار": df["name"],
            "گروه": df["group"],
            "قیمت بازار (تومان)": df["market_toman"].map(lambda v: f"{v:,.0f}" if pd.notna(v) else "—"),
            "ارزش ذاتی (تومان)": df["intrinsic_toman"].map(lambda v: f"{v:,.0f}" if pd.notna(v) else "—"),
            "حباب": df["bubble_pct"].map(lambda v: f"{v:+.2f}٪" if pd.notna(v) else "—"),
            "توضیح": df["note"],
        })
        st.dataframe(disp, width="stretch", hide_index=True)

        # ── تحلیل هوشمند (Gemini) ──
        if gemini.is_configured():
            if st.button("🧠 تحلیل هوشمند این داده‌ها", key="ai_interpret_bubbles"):
                with st.spinner("در حال تحلیل با Gemini…"):
                    _res = assistant.interpret_snapshot(bub)
                st.session_state["bubble_ai"] = (
                    _res["text"] if _res.get("ok") else f"خطا: {_res.get('error')}")
            if st.session_state.get("bubble_ai"):
                st.info(st.session_state["bubble_ai"])
        else:
            st.caption("💡 برای «تحلیل هوشمند»، کلید Gemini را در `.streamlit/secrets.toml` قرار دهید.")

        with st.expander("📐 روش‌شناسی محاسبهٔ حباب"):
            st.markdown(
                """
**فرمول پایه:** `حباب = (قیمت بازار ÷ ارزش ذاتی − ۱) × ۱۰۰`

- **طلای آبشده (مثقال):** ارزش ذاتی = پاریتهٔ جهانی طلا = `انس جهانی ÷ ۳۱٫۱۰۳۵ × دلار آزاد`.
  این حباب، اختلاف بازار داخلی طلا با ارزش جهانی آن (به نرخ دلار آزاد) را نشان می‌دهد.
- **سکه‌ها (امامی، نیم سکه):** ارزش ذاتی = `وزن طلای خالص × قیمت گرم طلای ۲۴ عیار داخلی`.
  وزن طلای خالص = `وزن کل × عیار ÷ ۱۰۰۰` (سکه امامی ۸٫۱۳۳ گرم با عیار ۹۰۰ ≈ ۷٫۳۲ گرم خالص؛
  نیم سکه ۴٫۰۶۶۵ گرم با عیار ۹۰۰). این حباب، صرفِ «ضرب سکه» جدا از حباب خود طلا را می‌سنجد.
- **صندوق‌های طلا/نقره (عیار، سیمین):** ارزش ذاتی = `NAV ابطال` صندوق؛ حباب = صرف/تخفیف قیمت
  معاملاتی واحد نسبت به خالص ارزش دارایی. صندوق نقره معمولاً حباب بالاتری از صندوق طلا دارد.

**منابع:** قیمت لحظه‌ای دلار/انس/طلا/سکه از `etfbaz` (با fallback به `tgju`) و
قیمت معاملاتی + NAV صندوق‌ها از `TSETMC`.
                """
            )
  render_bubble_tab()

# ── تب ۱۲: دستیار هوشمند ─────────────────────────────────────────────────────
with t12:
    st.subheader("🤖 دستیار هوشمند مالی")
    if not gemini.is_configured():
        st.warning("کلید Gemini تنظیم نشده است. آن را در `.streamlit/secrets.toml` با کلید "
                   "`GEMINI_API_KEY` قرار دهید تا دستیار فعال شود.")
    else:
        st.caption("به دادهٔ زندهٔ حباب، بازار طلا/ارز/کالا و صندوق‌ها دسترسی دارد و به دستورات تو "
                   "پاسخ می‌دهد. مثال: «بازده صندوق‌های اهرمی»، «حباب نیم سکه چنده؟»، «دلار و یورو امروز».")

        _msgs = st.session_state.setdefault("assistant_msgs", [])
        qc1, qc2, qc3 = st.columns(3)
        with qc1:
            if st.button("📊 گزارش بازار امروز", key="ai_report", use_container_width=True):
                with st.spinner("تهیهٔ گزارش با Gemini Pro…"):
                    _r = assistant.daily_report()
                _msgs.append({"role": "assistant",
                              "text": _r["text"] if _r.get("ok") else f"خطا: {_r.get('error')}"})
        with qc2:
            if st.button("🧠 تفسیر وضعیت حباب", key="ai_interpret2", use_container_width=True):
                with st.spinner("در حال تحلیل…"):
                    _r = assistant.interpret_snapshot(get_bubbles())
                _msgs.append({"role": "assistant",
                              "text": _r["text"] if _r.get("ok") else f"خطا: {_r.get('error')}"})
        with qc3:
            if st.button("🗑️ پاک‌کردن گفتگو", key="ai_clear", use_container_width=True):
                st.session_state["assistant_msgs"] = []
                _msgs = st.session_state["assistant_msgs"]

        # تاریخچهٔ گفتگو
        for _m in _msgs:
            with st.chat_message("user" if _m["role"] == "user" else "assistant"):
                st.markdown(_m["text"])

        # ورودی چت
        _prompt = st.chat_input("سوالت دربارهٔ بازار، صندوق یا حباب…")
        if _prompt:
            _msgs.append({"role": "user", "text": _prompt})
            with st.chat_message("user"):
                st.markdown(_prompt)
            with st.chat_message("assistant"):
                with st.spinner("در حال فکر کردن…"):
                    _r = assistant.chat(_msgs)
                _ans = _r["text"] if _r.get("ok") else f"خطا: {_r.get('error')}"
                st.markdown(_ans)
            _msgs.append({"role": "assistant", "text": _ans})
            # چت هم می‌تواند داشبورد را کنترل کند (تغییر ورودی/تب/رفرش)
            if _apply_ai_actions(_r.get("actions") or {}):
                st.rerun()

        st.caption("⚠️ تحلیل‌ها آموزشی‌اند، نه توصیهٔ مالی. مدل: chat با gemini-2.5-flash · گزارش با gemini-2.5-pro.")

# ── فوتر برند ────────────────────────────────────────────────────────────────
_lf = ds.logo_data_uri(white=True)
_lf_img = f'<img src="{_lf}" style="height:46px;opacity:.9;margin-bottom:12px">' if _lf else ""
st.markdown(
    f"""
    <div style="background:{C['navy_deep']};border-radius:14px;padding:30px;margin-top:28px;
                text-align:center;color:rgba(255,255,255,.72)">
        {_lf_img}
        <div style="color:#fff;font-weight:800;font-size:16px">آرش صفری · تحلیل اقتصادی و ارزی</div>
        <div style="font-size:11px;letter-spacing:.25em;opacity:.5;margin-top:14px;direction:ltr">
            PPP · MONETARY · ETFBAZ LIVE · GEMINI AI · {ds.PERSIAN_MONTHS[0]} 1405
        </div>
    </div>
    """,
    unsafe_allow_html=True,
)

# ── ناوبری تب توسط دستیار (هک JS؛ st.tabs کنترل برنامه‌ای ندارد) ──────────────
_goto = st.session_state.pop("_ai_goto", None)
if _goto:
    import time
    import streamlit.components.v1 as components
    _core = _goto.split(" ", 1)[1] if " " in _goto else _goto   # حذف ایموجی ابتدای برچسب
    components.html(
        f"""
        <script>
        // nonce {time.time()} — اجبار به اجرای مجدد در هر فراخوانی
        const target = {json.dumps(_core)};
        const doc = window.parent.document;
        function clickTab() {{
          const tabs = doc.querySelectorAll('button[role="tab"]');
          for (const b of tabs) {{
            if (b.innerText && b.innerText.includes(target)) {{ b.click(); return true; }}
          }}
          return false;
        }}
        if (!clickTab()) setTimeout(clickTab, 350);
        </script>
        """,
        height=0,
    )
