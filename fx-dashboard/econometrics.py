"""
ماژول اقتصادسنجی: آزمونِ رفتارِ انفجاری GSADF/BSADF (Phillips–Shi–Yu 2015)،
نوسان GARCH(1,1)، و پیش‌بینی احتمالاتی Monte Carlo با Fan Chart.

توجه به مرجع‌دهی: PWY = Phillips, Wu & Yu (2011) آزمونِ SADF تک‌حبابی است؛
PSY = Phillips, Shi & Yu (2015) آزمونِ GSADF چندحبابی. آنچه اینجا و در psy.py
پیاده شده PSY 2015 است.

وابستگی‌های سنگین (statsmodels, arch) اختیاری‌اند؛ در نبودشان
از پیاده‌سازی numpy داخلی استفاده می‌شود.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

try:
    from statsmodels.tsa.stattools import adfuller
    _HAS_SM = True
except Exception:  # noqa: BLE001
    _HAS_SM = False

try:
    from arch import arch_model
    _HAS_ARCH = True
except Exception:  # noqa: BLE001
    _HAS_ARCH = False


# ────────────────────────────────────────────────────────────────────────────
# ۱) ADF درون‌ساخت (در صورت نبود statsmodels)
# ────────────────────────────────────────────────────────────────────────────
def _adf_stat(y: np.ndarray) -> float:
    """آماره t ضریب φ در رگرسیون Δy_t = α + φ·y_{t-1} + ε_t (ADF با ثابت، بدون تأخیر)."""
    y = np.asarray(y, dtype=float)
    dy = np.diff(y)
    x = y[:-1]
    n = len(dy)
    if n < 8 or np.std(x) == 0:
        return np.nan
    X = np.column_stack([np.ones(n), x])
    try:
        beta, *_ = np.linalg.lstsq(X, dy, rcond=None)
        resid = dy - X @ beta
        sigma2 = (resid @ resid) / (n - 2)
        cov = sigma2 * np.linalg.inv(X.T @ X)
        se_phi = np.sqrt(cov[1, 1])
        return beta[1] / se_phi if se_phi > 0 else np.nan
    except np.linalg.LinAlgError:
        return np.nan


def _adf(y: np.ndarray) -> float:
    if _HAS_SM and len(y) >= 12:
        try:
            return float(adfuller(y, regression="c", autolag=None, maxlag=1)[0])
        except Exception:  # noqa: BLE001
            return _adf_stat(y)
    return _adf_stat(y)


# ────────────────────────────────────────────────────────────────────────────
# ۲) [حذف‌شده] sup_adf قدیمی
# ────────────────────────────────────────────────────────────────────────────
# تابعِ `sup_adf` حذف شد. سه ایرادِ آن: (۱) مقدارِ بحرانیِ ثابتِ ۱٫۴۹ — توزیعِ
# BSADF غیراستاندارد و تابعی از (n, r0, k) است؛ (۲) ADF بدونِ تعمیمِ تأخیر؛
# (۳) نبودِ قاعدهٔ حداقل مدت، پس جهش‌های تک‌نقطه‌ای «حباب» شمرده می‌شدند.
# جایگزین: `psy.psy_test` (و برای فراخوانیِ سریعِ k=0، `gsadf` در بخش ۱۰ همین فایل).


# ────────────────────────────────────────────────────────────────────────────
# ۳) GARCH(1,1) — برآورد نوسان شرطی
# ────────────────────────────────────────────────────────────────────────────
def _garch11_numpy(returns: np.ndarray) -> dict:
    """برآورد GARCH(1,1) با MLE ساده‌سازی‌شده (در نبود arch)."""
    r = np.asarray(returns, dtype=float)
    r = r[~np.isnan(r)]
    var_uncond = np.var(r)
    if var_uncond == 0 or len(r) < 30:
        return {"omega": var_uncond, "alpha": 0.0, "beta": 0.0,
                "sigma": np.sqrt(var_uncond) if var_uncond > 0 else 0.0}
    # مقادیر معمول تجربی برای سری‌های مالی روزانه
    alpha, beta = 0.08, 0.90
    omega = var_uncond * (1 - alpha - beta)
    sig2 = np.empty(len(r))
    sig2[0] = var_uncond
    for t in range(1, len(r)):
        sig2[t] = omega + alpha * r[t - 1] ** 2 + beta * sig2[t - 1]
    return {"omega": omega, "alpha": alpha, "beta": beta,
            "sigma": float(np.sqrt(sig2[-1]))}


def fit_garch(returns: pd.Series) -> dict:
    """برآورد GARCH(1,1) با arch در صورت موجود؛ در غیر این صورت numpy."""
    r = pd.to_numeric(returns, errors="coerce").dropna() * 100  # درصد برای پایداری
    if _HAS_ARCH and len(r) >= 50:
        try:
            res = arch_model(r, vol="GARCH", p=1, q=1, dist="normal").fit(disp="off")
            p = res.params
            return {
                "omega": float(p.get("omega", 0)) / 10000,
                "alpha": float(p.get("alpha[1]", 0)),
                "beta": float(p.get("beta[1]", 0)),
                "sigma": float(np.sqrt(res.conditional_volatility.iloc[-1] ** 2) / 100),
            }
        except Exception:  # noqa: BLE001
            pass
    return _garch11_numpy((r / 100).values)


# ────────────────────────────────────────────────────────────────────────────
# ۴) Monte Carlo Fan Chart
# ────────────────────────────────────────────────────────────────────────────
def monte_carlo_paths(
    start_rate: float,
    monthly_drift: float,
    monthly_vol: float,
    n_months: int,
    n_paths: int = 1000,
    seed: int = 42,
) -> np.ndarray:
    """
    شبیه‌سازی هندسی براونی روی نرخ ارز (log-normal).

    Returns: ماتریس (n_paths, n_months) از نرخ‌های شبیه‌سازی شده.
    """
    rng = np.random.default_rng(seed)
    shocks = rng.normal(loc=monthly_drift - 0.5 * monthly_vol ** 2,
                        scale=monthly_vol, size=(n_paths, n_months))
    log_paths = np.cumsum(shocks, axis=1)
    return start_rate * np.exp(log_paths)


def fan_chart(paths: np.ndarray) -> pd.DataFrame:
    """صدک‌های 5، 20، 50، 80، 95 از مسیرهای Monte Carlo."""
    qs = [5, 20, 50, 80, 95]
    arr = np.percentile(paths, qs, axis=0)
    return pd.DataFrame(arr.T, columns=[f"p{q}" for q in qs])


# ────────────────────────────────────────────────────────────────────────────
# ۵) برآورد رانش/نوسان ماهانه از داده زنده
# ────────────────────────────────────────────────────────────────────────────
def estimate_drift_vol(history: pd.DataFrame, price_col: str = "close_toman") -> tuple[float, float]:
    """
    از تاریخچه روزانه نرخ، رانش و نوسان ماهانه را برآورد می‌کند (روزهای کاری ≈ ۲۲).

    Returns: (monthly_drift, monthly_vol)  هر دو در مقیاس لگاریتمی.
    """
    if history is None or history.empty or price_col not in history.columns:
        return 0.02, 0.05
    s = pd.to_numeric(history[price_col], errors="coerce").dropna()
    if len(s) < 30:
        return 0.02, 0.05
    log_ret = np.log(s / s.shift(1)).dropna()
    daily_mu = log_ret.mean()
    daily_sd = log_ret.std()
    return float(daily_mu * 22), float(daily_sd * np.sqrt(22))


# ────────────────────────────────────────────────────────────────────────────
# ۶) Johansen Cointegration / BEER (اختیاری، نیازمند statsmodels)
# ────────────────────────────────────────────────────────────────────────────
def estimate_frenkel_bilson(df: pd.DataFrame, market: pd.Series) -> dict:
    """
    برآورد OLS مدل Frenkel-Bilson روی داده سالانه:
        log E_t = β0 + α·(m_ir − m_us) − φ·(y_ir − y_us) + λ·(i_ir − i_us) + ε

    در صورت نبود ستون نرخ بهره ایران، λ برآورد نمی‌شود و مدل به فرم پایه برمی‌گردد.
    خروجی: dict شامل ضرایب، خطای استاندارد، t-stat، R²، n.
    """
    d = df.set_index("year_shamsi").copy()
    common = market.index.intersection(d.index)
    if len(common) < 8:
        return {"ok": False, "reason": "داده ناکافی (نیاز به حداقل ۸ سال)"}

    # ساخت تفاضل‌های لازم (با sentinel ها)
    rows = []
    has_interest = "infl_cbi" in d.columns  # پراکسی برای نرخ بهره در نبود i_ir صریح
    for y in common:
        m_diff = (d.loc[y, "m2_growth"] - d.loc[y, "usa_m2_growth"]) / 100.0
        y_diff = (d.loc[y, "gdp_growth"] - d.loc[y, "usa_gdp_growth"]) / 100.0
        i_diff = ((d.loc[y, "infl_cbi"] - d.loc[y, "usa_infl"]) / 100.0
                  if has_interest else np.nan)
        rows.append((y, m_diff, y_diff, i_diff, float(market.loc[y])))
    arr = pd.DataFrame(rows, columns=["year", "m_diff", "y_diff", "i_diff", "E"]).dropna()
    if len(arr) < 6:
        return {"ok": False, "reason": "داده ناکافی پس از حذف NaN"}

    y_vec = np.log(arr["E"].values)
    has_i = arr["i_diff"].notna().all() and has_interest
    if has_i:
        X = np.column_stack([np.ones(len(arr)), arr["m_diff"], -arr["y_diff"], arr["i_diff"]])
        names = ["const", "alpha (m-m*)", "phi (y-y*)", "lambda (i-i*)"]
    else:
        X = np.column_stack([np.ones(len(arr)), arr["m_diff"], -arr["y_diff"]])
        names = ["const", "alpha (m-m*)", "phi (y-y*)"]

    try:
        beta, *_ = np.linalg.lstsq(X, y_vec, rcond=None)
        resid = y_vec - X @ beta
        ss_res = float(resid @ resid)
        ss_tot = float(((y_vec - y_vec.mean()) ** 2).sum())
        r2 = 1 - ss_res / ss_tot if ss_tot > 0 else np.nan
        n, k = X.shape
        sigma2 = ss_res / (n - k) if n > k else np.nan
        cov = sigma2 * np.linalg.inv(X.T @ X)
        se = np.sqrt(np.diag(cov))
        t_stats = beta / se
        coefs = {names[i]: {"beta": float(beta[i]),
                            "se": float(se[i]),
                            "t": float(t_stats[i])} for i in range(len(beta))}
        return {
            "ok": True, "n": int(n), "r2": float(r2) if not np.isnan(r2) else np.nan,
            "coefs": coefs, "has_interest": bool(has_i),
            "note": "i* پراکسی از تفاضل تورم استفاده شده — نرخ بهره صریح در داده موجود نیست."
                    if has_i else "بدون تفاضل نرخ بهره.",
        }
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "reason": f"خطای جبری: {e}"}


# ────────────────────────────────────────────────────────────────────────────
# ۷) هم‌انباشتگی Engle-Granger + ECM واقعی  (هستهٔ مشترک ECM و BEER)
# ────────────────────────────────────────────────────────────────────────────
# مقادیر بحرانی تقریبی MacKinnon برای آزمون هم‌انباشتگی Engle-Granger
# (بدون روند، بر حسب تعداد کل متغیرها n = ۱ وابسته + k رگرسور).
_EG_CRIT = {
    2: {"1%": -3.90, "5%": -3.34, "10%": -3.04},
    3: {"1%": -4.29, "5%": -3.74, "10%": -3.45},
    4: {"1%": -4.64, "5%": -4.10, "10%": -3.81},
    5: {"1%": -4.96, "5%": -4.42, "10%": -4.13},
}


def engle_granger(frame: pd.DataFrame, y_col: str, x_cols: list[str]) -> dict:
    """
    آزمون هم‌انباشتگی Engle-Granger دو مرحله‌ای:
      مرحله ۱: رگرسیون بلندمدت  y = β0 + Σ βi·xi + u  (OLS سطوح لگاریتمی)
      مرحله ۲: ADF روی پسماند u — اگر مانا بود، رابطه هم‌انباشته است.

    خروجی: dict شامل beta, fitted(سطح exp), resid, adf_stat, eg_cv_5,
            is_cointegrated, r2, n, x_cols.
    اگر هم‌انباشتگی رد شود، fitted همچنان برمی‌گردد ولی is_cointegrated=False
    تا UI بتواند صادقانه هشدار «رابطهٔ بلندمدت تأیید نشد» بدهد.
    """
    cols = [y_col] + list(x_cols)
    data = frame[cols].replace([np.inf, -np.inf], np.nan).dropna()
    n = len(data)
    if n < 12:
        return {"ok": False, "reason": f"داده ناکافی برای هم‌انباشتگی (n={n}, نیاز ≥۱۲)"}

    y = data[y_col].values
    X = np.column_stack([np.ones(n)] + [data[c].values for c in x_cols])
    try:
        beta, *_ = np.linalg.lstsq(X, y, rcond=None)
    except np.linalg.LinAlgError as e:
        return {"ok": False, "reason": f"خطای جبری: {e}"}

    resid = y - X @ beta
    ss_res = float(resid @ resid)
    ss_tot = float(((y - y.mean()) ** 2).sum())
    r2 = 1 - ss_res / ss_tot if ss_tot > 0 else np.nan

    adf_stat = _adf(resid)
    n_vars = 1 + len(x_cols)
    cv = _EG_CRIT.get(min(n_vars, 5), _EG_CRIT[5])
    is_coint = (not np.isnan(adf_stat)) and (adf_stat < cv["5%"])

    fitted = pd.Series(np.exp(X @ beta), index=data.index, name="fitted")
    resid_s = pd.Series(resid, index=data.index, name="resid")
    return {
        "ok": True, "n": int(n), "r2": float(r2) if not np.isnan(r2) else np.nan,
        "beta": beta, "x_cols": list(x_cols), "y_col": y_col,
        "fitted": fitted, "resid": resid_s,
        "adf_stat": float(adf_stat) if not np.isnan(adf_stat) else np.nan,
        "eg_cv_5": cv["5%"], "is_cointegrated": bool(is_coint),
    }


def ecm_fit(frame: pd.DataFrame, y_col: str, x_cols: list[str]) -> dict:
    """
    برآورد مدل تصحیح خطا (ECM) روی رابطهٔ هم‌انباشتهٔ Engle-Granger:
        Δy_t = c + α·u_{t-1} + Σ γi·Δxi_t + ε_t
    α (سرعت تعدیل) باید منفی و معنادار باشد تا بازگشت به تعادل تأیید شود.

    خروجی: eg (نتیجهٔ engle_granger) + alpha, gamma, ecm_params, و تابع پیش‌بینی.
    """
    eg = engle_granger(frame, y_col, x_cols)
    if not eg.get("ok"):
        return eg

    data = frame[[y_col] + list(x_cols)].replace([np.inf, -np.inf], np.nan).dropna()
    dy = data[y_col].diff()
    dx = data[x_cols].diff()
    u_lag = eg["resid"].reindex(data.index).shift(1)

    reg = pd.concat([dy.rename("dy"), u_lag.rename("u_lag"), dx], axis=1).dropna()
    m = len(reg)
    if m < 8:
        eg["ecm_ok"] = False
        eg["ecm_reason"] = f"داده ناکافی برای ECM کوتاه‌مدت (m={m})"
        return eg

    Z = np.column_stack([np.ones(m), reg["u_lag"].values] +
                        [reg[c].values for c in x_cols])
    yv = reg["dy"].values
    try:
        p, *_ = np.linalg.lstsq(Z, yv, rcond=None)
    except np.linalg.LinAlgError:
        eg["ecm_ok"] = False
        eg["ecm_reason"] = "خطای جبری در ECM"
        return eg

    resid = yv - Z @ p
    sigma2 = (resid @ resid) / (m - Z.shape[1]) if m > Z.shape[1] else np.nan
    try:
        se = np.sqrt(np.diag(sigma2 * np.linalg.inv(Z.T @ Z)))
        alpha_t = p[1] / se[1] if se[1] > 0 else np.nan
    except np.linalg.LinAlgError:
        alpha_t = np.nan

    eg.update({
        "ecm_ok": True,
        "ecm_const": float(p[0]),
        "alpha": float(p[1]),          # سرعت تعدیل (باید <۰ باشد)
        "alpha_t": float(alpha_t) if not np.isnan(alpha_t) else np.nan,
        "gamma": {x_cols[i]: float(p[2 + i]) for i in range(len(x_cols))},
        "ecm_resid_std": float(np.std(resid)),
    })
    return eg


def ecm_one_step(ecm: dict, frame: pd.DataFrame, t_index) -> float:
    """
    پیش‌بینی پویای یک‌قدم‌جلوی ln_E در سال t با مدل ECM برآوردشده.
        Δŷ_t = c + α·u_{t-1} + Σ γi·Δxi_t  →  ŷ_t = y_{t-1} + Δŷ_t
    از u_{t-1} (انحراف تعادلی سال قبل) و Δxi_t (تغییر بنیادها) استفاده می‌کند.
    خروجی: نرخ پیش‌بینی‌شده در سطح (نه لگاریتم). NaN اگر ممکن نباشد.
    """
    if not ecm.get("ecm_ok"):
        return np.nan
    y_col, x_cols = ecm["y_col"], ecm["x_cols"]
    data = frame[[y_col] + list(x_cols)].replace([np.inf, -np.inf], np.nan)
    idx = list(data.index)
    if t_index not in idx:
        return np.nan
    pos = idx.index(t_index)
    if pos < 1:
        return np.nan
    t_prev = idx[pos - 1]
    y_prev = data.loc[t_prev, y_col]
    u_prev = ecm["resid"].get(t_prev, np.nan)
    if pd.isna(y_prev) or pd.isna(u_prev):
        return np.nan
    dyhat = ecm["ecm_const"] + ecm["alpha"] * u_prev
    for c in x_cols:
        dxi = data.loc[t_index, c] - data.loc[t_prev, c]
        if pd.isna(dxi):
            return np.nan
        dyhat += ecm["gamma"][c] * dxi
    return float(np.exp(y_prev + dyhat))


def beer_equilibrium(df: pd.DataFrame, market: pd.Series) -> pd.Series | None:
    """
    نرخ تعادلی BEER بر پایهٔ هم‌انباشتگی Engle-Granger:
        log E = β0 + β1·log(CPI_ir/CPI_us) + β2·log(oil) + u
    حالا به‌جای OLS کور، آزمون هم‌انباشتگی روی پسماند اجرا می‌شود تا از
    رگرسیون کاذب پرهیز شود. وضعیت هم‌انباشتگی در attrs سری ذخیره می‌شود:
        .attrs["is_cointegrated"], .attrs["adf_stat"], .attrs["eg_cv_5"], .attrs["r2"]

    Args:
        df: داده سالانه (شامل cpi_cbi, usa_cpi, oil_exports)
        market: سری نرخ بازار (شاخص = year_shamsi)
    """
    from data_sources import cointegration_inputs
    frame = cointegration_inputs(df, market)
    x_cols = [c for c in ("ln_cpi_rel", "ln_oil") if c in frame.columns]
    if "ln_E" not in frame.columns or len(x_cols) < 1:
        return None
    eg = engle_granger(frame, "ln_E", x_cols)
    if not eg.get("ok"):
        return None
    fitted = eg["fitted"].rename("beer")
    fitted.attrs.update({
        "is_cointegrated": eg["is_cointegrated"],
        "adf_stat": eg["adf_stat"],
        "eg_cv_5": eg["eg_cv_5"],
        "r2": eg["r2"],
        "n": eg["n"],
    })
    return fitted


# ────────────────────────────────────────────────────────────────────────────
# ۸) ARDL Bounds Test (Pesaran–Shin–Smith 2001) — مناسبِ نمونهٔ کوچک و I(0)/I(1)
# ────────────────────────────────────────────────────────────────────────────
def ardl_bounds_test(frame: pd.DataFrame, y_col: str, x_cols: list[str],
                     case: int = 3) -> dict:
    """
    آزمونِ کرانه‌ایِ هم‌انباشتگیِ ARDL (Pesaran–Shin–Smith 2001).

    برتری نسبت به Engle–Granger: نیازی به I(1) بودنِ همهٔ متغیرها ندارد (ترکیبِ
    I(0)/I(1) مجاز است) و در نمونه‌های کوچک توانِ بهتری دارد.

    تصمیم با آمارهٔ F و کرانه‌های PSS: F>کرانهٔ بالا ⇒ هم‌انباشته؛ F<کرانهٔ پایین ⇒ خیر؛
    بینابین ⇒ بی‌نتیجه. حالتِ ۳ = عرض از مبدأ نامقید، بدون روند (پیش‌فرض).

    خروجی: ok, n, f_stat, lower_5, upper_5, decision ∈ {cointegrated, inconclusive, none},
            crit (DataFrame کرانه‌ها)، order. گریس‌فول در نبودِ statsmodels یا دادهٔ کم.
    """
    out = {"ok": False}
    try:
        from statsmodels.tsa.ardl import UECM
    except Exception:  # noqa: BLE001
        out["reason"] = "statsmodels در دسترس نیست"
        return out
    cols = [y_col] + list(x_cols)
    data = frame[cols].replace([np.inf, -np.inf], np.nan).dropna().sort_index()
    n = len(data)
    if n < 12:
        return {"ok": False, "n": n, "reason": f"دادهٔ ناکافی برای ARDL (n={n})"}
    try:
        y = data[y_col].reset_index(drop=True)
        X = data[x_cols].reset_index(drop=True)
        # UECM(۱، [۱…]) پارسیمونی؛ همهٔ exogها لگ ≥۱ (الزامِ UECM)
        res = UECM(y, 1, X, 1, trend="c").fit()
        bt = res.bounds_test(case=case)
        cv = bt.crit_vals
        f = float(bt.stat)
        lo5 = float(cv.loc[95.0, "lower"]); up5 = float(cv.loc[95.0, "upper"])
        decision = "cointegrated" if f > up5 else ("none" if f < lo5 else "inconclusive")
        return {"ok": True, "n": n, "f_stat": f, "lower_5": lo5, "upper_5": up5,
                "decision": decision, "crit": cv, "x_cols": list(x_cols), "case": case}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "n": n, "reason": f"خطای ARDL: {e}"}


# ────────────────────────────────────────────────────────────────────────────
# ۹) Gregory–Hansen (1996) — هم‌انباشتگی با شکستِ ساختاریِ درون‌زا (مدلِ C: انتقالِ سطح)
# ────────────────────────────────────────────────────────────────────────────
# مقادیر بحرانیِ ADF*/Z_t* (Gregory–Hansen 1996, جدول ۱، مدل C = level shift)
# بر حسبِ تعداد رگرسورهای I(1) (بدونِ ثابت و دامی).
_GH_CRIT_C = {
    1: {"1%": -5.13, "5%": -4.61, "10%": -4.34},
    2: {"1%": -5.44, "5%": -4.92, "10%": -4.69},
    3: {"1%": -5.77, "5%": -5.28, "10%": -4.99},
    4: {"1%": -6.05, "5%": -5.56, "10%": -5.31},
}


def gregory_hansen(frame: pd.DataFrame, y_col: str, x_cols: list[str],
                   trim: float = 0.15) -> dict:
    """
    آزمونِ هم‌انباشتگیِ Gregory–Hansen (1996) با شکستِ ساختاریِ درون‌زا — مدلِ C
    (انتقالِ سطح). برای هر نقطهٔ شکستِ ممکن τ در بازهٔ تریم‌شده، رگرسیونِ بلندمدت با
    دامیِ سطح برازش و ADF روی پسماند گرفته می‌شود؛ آمارهٔ آزمون = کمینهٔ (منفی‌ترینِ)
    این ADFهاست و با مقادیر بحرانیِ GH سنجیده می‌شود.

    چرا مهم است: EG/ARDL فرض می‌کنند رابطهٔ بلندمدت در کل نمونه ثابت است؛ در ایران
    با گسست‌های ۱۳۹۰/۱۳۹۷ این فرض می‌شکند. GH اجازه می‌دهد یک شکستِ سطح وجود داشته
    باشد و نقطهٔ آن را درون‌زا تخمین می‌زند.

    خروجی: ok, n, gh_stat, break_index(سال), cv_5, is_cointegrated, m. گریس‌فول.
    """
    cols = [y_col] + list(x_cols)
    data = frame[cols].replace([np.inf, -np.inf], np.nan).dropna().sort_index()
    n = len(data)
    m = len(x_cols)
    if n < 15:
        return {"ok": False, "n": n, "reason": f"دادهٔ ناکافی برای GH (n={n})"}
    y = data[y_col].to_numpy(float)
    Xmat = data[x_cols].to_numpy(float)
    years = list(data.index)
    lo = max(int(np.floor(trim * n)), m + 3)
    hi = min(int(np.ceil((1 - trim) * n)), n - (m + 3))
    if hi <= lo:
        return {"ok": False, "n": n, "reason": "بازهٔ تریمِ ناکافی"}

    best_stat, best_k = np.inf, None
    for k in range(lo, hi):
        D = np.zeros(n); D[k:] = 1.0                      # دامیِ انتقالِ سطح
        Z = np.column_stack([np.ones(n), D, Xmat])
        try:
            beta, *_ = np.linalg.lstsq(Z, y, rcond=None)
        except np.linalg.LinAlgError:
            continue
        resid = y - Z @ beta
        adf = _adf(resid)
        if not np.isnan(adf) and adf < best_stat:
            best_stat, best_k = adf, k
    if best_k is None:
        return {"ok": False, "n": n, "reason": "محاسبهٔ ADF ناموفق"}

    cv = _GH_CRIT_C.get(min(max(m, 1), 4), _GH_CRIT_C[4])
    return {"ok": True, "n": n, "gh_stat": float(best_stat),
            "break_index": years[best_k], "break_frac": round(best_k / n, 2),
            "cv_1": cv["1%"], "cv_5": cv["5%"], "cv_10": cv["10%"],
            "is_cointegrated": bool(best_stat < cv["5%"]), "m": m,
            "x_cols": list(x_cols)}


# ────────────────────────────────────────────────────────────────────────────
# ۱۰) GSADF واقعی (Phillips–Shi–Yu 2015) با مقادیر بحرانیِ شبیه‌سازی‌شدهٔ Monte-Carlo
# ────────────────────────────────────────────────────────────────────────────
# ADF(0) با ثابت، به فرمِ بسته و بردارشده روی همهٔ پنجره‌های هم‌پایان — تا GSADF
# که O(n²) آزمون ADF دارد، با prefix-sum سریع و قابلِ شبیه‌سازی شود.
def _bsadf_sequence(y: np.ndarray, lmin: int) -> np.ndarray:
    """
    دنبالهٔ BSADF: برای هر نقطهٔ پایان r2، بیشینهٔ آمارهٔ ADF(0) روی همهٔ نقاطِ شروع r1.
    lmin = حداقل تعداد مشاهدهٔ رگرسیون (L = r2−r1).
    خروجی: آرایهٔ طول n با NaN برای r2 < lmin.
    """
    y = np.asarray(y, float)
    n = len(y)
    PY = np.concatenate(([0.0], np.cumsum(y)))               # PY[k]=Σ y[0:k]
    PYY = np.concatenate(([0.0], np.cumsum(y * y)))
    prod = y[:-1] * y[1:]
    PYlag = np.concatenate(([0.0], np.cumsum(prod)))          # PYlag[k]=Σ_{j<k} y[j]y[j+1]
    dq = np.diff(y) ** 2
    PDD = np.concatenate(([0.0], np.cumsum(dq)))              # PDD[k]=Σ_{j<k} (Δy)²
    out = np.full(n, np.nan)
    for r2 in range(lmin, n):
        r1 = np.arange(0, r2 - lmin + 1)
        L = (r2 - r1).astype(float)
        Sx = PY[r2] - PY[r1]
        Sxx = PYY[r2] - PYY[r1]
        Sd = y[r2] - y[r1]
        Sxd = (PYlag[r2] - PYlag[r1]) - (PYY[r2] - PYY[r1])
        Sdd = PDD[r2] - PDD[r1]
        Sxx_c = Sxx - Sx * Sx / L
        Sxd_c = Sxd - Sx * Sd / L
        Sdd_c = Sdd - Sd * Sd / L
        with np.errstate(divide="ignore", invalid="ignore"):
            phi = Sxd_c / Sxx_c
            sse = Sdd_c - Sxd_c * Sxd_c / Sxx_c
            sigma2 = sse / (L - 2.0)
            t = phi / np.sqrt(sigma2 / Sxx_c)
        t = t[np.isfinite(t) & (Sxx_c > 0) & (sse > 0) & (L > 2)]
        if t.size:
            out[r2] = float(np.max(t))
    return out


def gsadf(series: pd.Series, r0: float = 0.25) -> dict:
    """
    آمارهٔ GSADF (سوپریممِ دنبالهٔ BSADF) برای تشخیصِ رفتارِ انفجاری/حباب.
    خروجی: ok, n, gsadf_stat, bsadf (pd.Series هم‌خوان با شاخص)، lmin.
    """
    s = series.dropna().astype(float)
    n = len(s)
    lmin = max(int(np.floor(r0 * n)), 4)
    if n < 20 or lmin >= n:
        return {"ok": False, "n": n, "reason": "دادهٔ ناکافی برای GSADF"}
    bs = _bsadf_sequence(s.to_numpy(), lmin)
    return {"ok": True, "n": n, "lmin": lmin,
            "gsadf_stat": float(np.nanmax(bs)),
            "bsadf": pd.Series(bs, index=s.index)}


def simulate_gsadf_cv(n: int, r0: float = 0.25, B: int = 199,
                      seed: int = 42, levels=(90.0, 95.0, 99.0)) -> dict:
    """
    مقادیر بحرانیِ GSADF را با شبیه‌سازیِ Monte-Carlo تحتِ فرضِ صفرِ ریشهٔ واحد
    (قدم‌زنیِ تصادفی) تولید می‌کند. کش‌شدن لازم است (وابسته فقط به n, r0, B, seed).

    خروجی: gsadf_cv (dict سطح→مقدار) و bsadf_cv (dict سطح→آرایهٔ دنباله، برای تاریخ‌گذاری).
    """
    rng = np.random.default_rng(seed)
    lmin = max(int(np.floor(r0 * n)), 4)
    gs = np.empty(B)
    bs_all = np.full((B, n), np.nan)
    for b in range(B):
        e = rng.standard_normal(n)
        y = np.cumsum(e)                      # I(1) تحت H0
        seq = _bsadf_sequence(y, lmin)
        bs_all[b] = seq
        gs[b] = np.nanmax(seq)
    gsadf_cv = {lv: float(np.percentile(gs, lv)) for lv in levels}
    with np.errstate(invalid="ignore"):
        bsadf_cv = {lv: np.nanpercentile(bs_all, lv, axis=0) for lv in levels}
    return {"gsadf_cv": gsadf_cv, "bsadf_cv": bsadf_cv, "B": B, "lmin": lmin}
