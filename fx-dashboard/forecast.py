"""
پیش‌بینی احتمالاتی نرخ ارز با Fan Chart مبتنی بر Monte Carlo.

دو منبع شوک پیاده شده است:
  1) Empirical Bootstrap از پسماند Walk-Forward (در صورت موجود بودن)
  2) شوک نرمال با σ از تاریخچه روزانه (GARCH در econometrics.py)

تفاوت با models.forecast_forward:
  forecast_forward → تنها مسیر نقطه‌ای (point path)
  این ماژول → ۱۰۰۰+ مسیر تصادفی + باندهای ۵۰/۸۰/۹۵٪
"""
import numpy as np
import pandas as pd

from data_sources import forward_month_labels


def empirical_shocks(backtest_residuals: pd.Series, n_paths: int, n_months: int,
                     rng=None) -> np.ndarray:
    """
    Bootstrap از پسماند سالانه backtest. تبدیل به شوک ماهانه:
      monthly_shock ≈ annual_shock / 12  (تقسیم تقریبی)
    """
    rng = rng or np.random.default_rng(42)
    r = backtest_residuals.dropna().values
    if len(r) < 3:
        return np.zeros((n_paths, n_months))
    # تبدیل پسماند نسبی سالانه به ماهانه (لگاریتمی)
    log_r = np.log1p(r)  # درصد → فاکتور لگاریتمی
    monthly_log = log_r / 12.0
    shocks = rng.choice(monthly_log, size=(n_paths, n_months), replace=True)
    return shocks


def normal_shocks(monthly_sigma: float, monthly_drift: float,
                  n_paths: int, n_months: int, rng=None) -> np.ndarray:
    """شوک نرمال log-normal (GBM)."""
    rng = rng or np.random.default_rng(42)
    return rng.normal(
        loc=monthly_drift - 0.5 * monthly_sigma ** 2,
        scale=monthly_sigma,
        size=(n_paths, n_months),
    )


def fan_chart(start_rate: float, start_shamsi: str, n_months: int,
              monthly_drift: float, monthly_sigma: float,
              backtest_residuals: pd.Series = None,
              n_paths: int = 1000, seed: int = 42) -> pd.DataFrame:
    """
    تولید Fan Chart:
      - اگر backtest_residuals داده شده، شوک از bootstrap گرفته می‌شود
      - در غیر این صورت، توزیع نرمال با σ، μ ورودی

    Returns: DataFrame(label, p5, p20, p50, p80, p95, n_paths)
    """
    rng = np.random.default_rng(seed)
    if backtest_residuals is not None and len(backtest_residuals.dropna()) >= 5:
        shocks = empirical_shocks(backtest_residuals, n_paths, n_months, rng=rng)
        # افزودن رانش (drift) ماهانه
        shocks = shocks + monthly_drift
    else:
        shocks = normal_shocks(monthly_sigma, monthly_drift, n_paths, n_months, rng=rng)

    log_paths = np.cumsum(shocks, axis=1)
    paths = start_rate * np.exp(log_paths)

    qs = [5, 20, 50, 80, 95]
    arr = np.percentile(paths, qs, axis=0)
    out = pd.DataFrame(arr.T, columns=[f"p{q}" for q in qs])
    out["label"] = forward_month_labels(start_shamsi, n_months)
    out.attrs["n_paths"] = n_paths
    out.attrs["paths"] = paths
    return out


def _norm_cdf(z):
    try:
        from scipy.stats import norm
        return float(norm.cdf(z))
    except Exception:  # noqa: BLE001
        from math import erf, sqrt
        return float(0.5 * (1 + erf(z / sqrt(2))))


def _crps_gaussian(y, mu, sigma):
    """CRPS بستهٔ پیش‌بینیِ گاوسی N(mu, sigma²) در برابر مشاهدهٔ y (نمرهٔ سرهٔ مناسب)."""
    if sigma <= 0:
        return abs(y - mu)
    try:
        from scipy.stats import norm
        cdf, pdf = norm.cdf, norm.pdf
    except Exception:  # noqa: BLE001
        from math import erf, sqrt, pi, exp
        cdf = lambda z: 0.5 * (1 + erf(z / sqrt(2)))
        pdf = lambda z: exp(-z * z / 2) / sqrt(2 * pi)
    z = (y - mu) / sigma
    return float(sigma * (z * (2 * cdf(z) - 1) + 2 * pdf(z) - 1.0 / np.sqrt(np.pi)))


def probabilistic_backtest(monthly: pd.Series, h: int = 3, min_train: int = 24) -> dict:
    """
    اعتبارسنجیِ احتمالاتیِ pseudo-out-of-sample برای پیش‌بینیِ GBM روی سریِ ماهانه.

    در هر مبدأ t (با حداقل min_train مشاهده)، رانش μ و نوسان σ از log-returnهای تا t
    برآورد و توزیعِ h-قدم‌جلو به‌صورت لاگ-نرمال ساخته می‌شود؛ سپس با مقدارِ محقق‌شدهٔ
    t+h مقایسه می‌گردد. بدونِ look-ahead.

    معیارها (ارزیابیِ صادقانهٔ fan chart — وگرنه باندها صرفاً دکورند):
      • PIT_t = Φ((y−μ̂)/σ̂)؛ اگر کالیبره باشد باید ~ یکنواخت(۰،۱) باشد.
      • پوششِ تجربیِ باندهای ۵۰٪/۹۰٪ (آیا ۹۰٪ باند واقعاً ۹۰٪ مشاهدات را می‌گیرد؟).
      • CRPS (در فضای لاگ) مدل در برابر قدم‌زنیِ تصادفیِ بی‌رانش.

    خروجی: ok, n, h, coverage50, coverage90, mean_pit, crps_model, crps_rw, pit(آرایه).
    """
    s = pd.to_numeric(monthly, errors="coerce").replace(0, np.nan).dropna()
    ly = np.log(s.to_numpy(float))
    n = len(ly)
    if n < min_train + h + 10:
        return {"ok": False, "n": n, "reason": "دادهٔ ناکافی برای اعتبارسنجیِ احتمالاتی"}
    pit, in50, in90, crps_m, crps_rw = [], [], [], [], []
    for t in range(min_train, n - h):
        r = np.diff(ly[: t + 1])
        mu = float(np.mean(r)); sd = float(np.std(r, ddof=1))
        if not np.isfinite(sd) or sd <= 0:
            continue
        f_mu = ly[t] + h * mu
        f_sd = sd * np.sqrt(h)
        y = ly[t + h]
        z = (y - f_mu) / f_sd
        pit.append(_norm_cdf(z))
        in50.append(abs(z) <= 0.674490)
        in90.append(abs(z) <= 1.644854)
        crps_m.append(_crps_gaussian(y, f_mu, f_sd))
        crps_rw.append(_crps_gaussian(y, ly[t], f_sd))   # RW بی‌رانش، همان σ
    if not pit:
        return {"ok": False, "n": n, "reason": "هیچ مبدأ معتبری"}
    return {
        "ok": True, "n": len(pit), "h": h,
        "coverage50": float(np.mean(in50) * 100),
        "coverage90": float(np.mean(in90) * 100),
        "mean_pit": float(np.mean(pit)),
        "crps_model": float(np.mean(crps_m)),
        "crps_rw": float(np.mean(crps_rw)),
        "pit": np.asarray(pit),
    }


def backtest_residuals_from(bt_df: pd.DataFrame) -> pd.Series:
    """
    پسماند نسبی از walk-forward:
        e_t = (actual_t − predicted_t) / predicted_t
    """
    bt = bt_df.dropna(subset=["actual", "predicted"]).copy()
    if bt.empty:
        return pd.Series(dtype=float)
    return ((bt["actual"] - bt["predicted"]) / bt["predicted"]).reset_index(drop=True)
