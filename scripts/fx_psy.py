"""
psy.py — پیاده‌سازی صحیح آزمون حباب PSY (Phillips, Shi & Yu 2015)

جایگزین `sup_adf` در econometrics.py. سه ایراد اصلی نسخهٔ قبلی رفع شده است:

1. **تعمیم تأخیر (lag augmentation).** نسخهٔ قبلی `maxlag=1, autolag=None` بود؛
   یعنی عملاً ADF بدون انتخاب تأخیر. در حضور همبستگی سریالی، آمارهٔ ADF اریب
   می‌شود و رفتار انفجاری کاذب تولید می‌کند. اینجا تأخیر با BIC (یا AIC) از
   ۰ تا kmax انتخاب می‌شود.

2. **مقدار بحرانی ثابت ۱٫۴۹.** توزیع BSADF غیراستاندارد و تابعی از (n, r0, k)
   است. اینجا CV با شبیه‌سازی Monte Carlo تحت فرضیهٔ صفر «قدم‌زدن تصادفی»
   روی *همان* طول نمونه و *همان* r0 تولید می‌شود، به‌صورت **دنباله‌ای**
   (pointwise) نه یک عدد ثابت. seed ثابت ⇒ بازتولیدپذیری.

3. **قاعدهٔ حداقل مدت.** PSY تاریخ‌گذاری را فقط برای دوره‌هایی معتبر می‌دانند
   که طولشان از δ·log(n) بیشتر باشد؛ در غیر این‌صورت جهش‌های تک‌نقطه‌ای
   به‌عنوان «حباب» گزارش می‌شوند.

نکتهٔ اصطلاح‌شناسی: خروجی این ماژول «رفتار انفجاری» (explosive behaviour) است،
نه اثبات حباب عقلایی. اگر آزمون روی نرخ اسمی اجرا شود، در اقتصادی با تورم
۴۰٪ رفتار انفجاری تقریباً همیشه یافت می‌شود و بی‌معناست. حتماً از
`misalignment_target()` استفاده کنید تا آزمون روی نسبت قیمت به بنیادی
(price-to-fundamental) اجرا شود — این همان چیزی است که تئوری حباب اقتضا می‌کند.

مرجع: Phillips, P.C.B., Shi, S., Yu, J. (2015), "Testing for Multiple Bubbles:
Historical Episodes of Exuberance and Collapse in the S&P 500",
International Economic Review 56(4), 1043–1078.
"""
from __future__ import annotations

import json
import math
import os
import warnings
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

__all__ = [
    "adf_tstat",
    "adf_auto",
    "bsadf_sequence",
    "simulate_bsadf_cv",
    "psy_test",
    "misalignment_target",
    "PSYResult",
]

# مسیر کش مقادیر بحرانی شبیه‌سازی‌شده (تولید مجدد گران است)
_CACHE_DIR = os.environ.get(
    "PSY_CV_CACHE", os.path.join(os.path.dirname(os.path.abspath(__file__)), ".psy_cache")
)


# ────────────────────────────────────────────────────────────────────────────
# ۱) ADF با تعمیم تأخیر
# ────────────────────────────────────────────────────────────────────────────
def adf_tstat(y: np.ndarray, k: int = 0) -> tuple[float, float]:
    """
    آمارهٔ t ضریب φ در رگرسیون ADF با ثابت و k تفاضل باوقفه:

        Δy_t = α + φ·y_{t-1} + Σ_{i=1..k} ψ_i·Δy_{t-i} + ε_t

    Returns:
        (t_stat, bic) — در صورت ناکافی‌بودن مشاهدات (nan, inf)
    """
    y = np.asarray(y, dtype=float)
    m = y.size
    dy = np.diff(y)
    n = dy.size - k                      # تعداد ردیف رگرسیون
    n_par = 2 + k
    if n < n_par + 5 or not np.isfinite(y).all():
        return np.nan, np.inf

    Y = dy[k:]
    cols = [np.ones(n), y[k:m - 1]]
    for i in range(1, k + 1):
        cols.append(dy[k - i:dy.size - i])
    X = np.column_stack(cols)

    if np.std(X[:, 1]) == 0:
        return np.nan, np.inf
    try:
        XtX = X.T @ X
        XtX_inv = np.linalg.inv(XtX)
        beta = XtX_inv @ (X.T @ Y)
        resid = Y - X @ beta
        ssr = float(resid @ resid)
        dof = n - n_par
        if dof <= 0 or ssr <= 0:
            return np.nan, np.inf
        s2 = ssr / dof
        se = math.sqrt(s2 * XtX_inv[1, 1])
        if not np.isfinite(se) or se <= 0:
            return np.nan, np.inf
        t = float(beta[1] / se)
        bic = n * math.log(ssr / n) + n_par * math.log(n)
        return t, bic
    except (np.linalg.LinAlgError, ValueError):
        return np.nan, np.inf


def adf_auto(y: np.ndarray, kmax: int = 4, ic: str = "bic") -> tuple[float, int]:
    """ADF با انتخاب خودکار تأخیر بر پایهٔ BIC (پیش‌فرض) یا AIC. خروجی: (t, k)."""
    best_t, best_k, best_ic = np.nan, 0, np.inf
    n_eff = np.asarray(y).size
    kmax = int(min(kmax, max(0, (n_eff - 12) // 3)))
    for k in range(0, kmax + 1):
        t, crit = adf_tstat(y, k)
        if ic == "aic" and np.isfinite(crit):
            # تبدیل BIC→AIC: جریمهٔ log(n)·p → 2p
            n_rows = np.asarray(y).size - 1 - k
            crit = crit - (2 + k) * math.log(max(n_rows, 2)) + 2 * (2 + k)
        if np.isfinite(crit) and crit < best_ic:
            best_ic, best_t, best_k = crit, t, k
    return best_t, best_k


# ────────────────────────────────────────────────────────────────────────────
# ۲) دنبالهٔ BSADF
# ────────────────────────────────────────────────────────────────────────────
def _min_window(n: int, r0: float | None) -> int:
    """پنجرهٔ حداقلی. اگر r0 داده نشود از قاعدهٔ PSY: r0 = 0.01 + 1.8/√n."""
    if r0 is None:
        r0 = 0.01 + 1.8 / math.sqrt(n)
    return max(int(math.ceil(r0 * n)), 15)


def _bsadf_k0(y: np.ndarray, w0: int) -> np.ndarray:
    """
    دنبالهٔ BSADF برای k=0 به فرمِ بسته و بردارشده (prefix-sum).

    دقیقاً معادلِ حلقهٔ `adf_tstat(..., k=0)` با step=1 است اما چند صد برابر
    سریع‌تر؛ همین امکان می‌دهد شبیه‌سازیِ مقادیر بحرانی با **گامِ ۱** انجام شود.
    گامِ درشت‌تر در شبیه‌سازی، سوپریمم را روی شبکهٔ تُنُک می‌گیرد و CV را پایین
    برآورد می‌کند (اندازهٔ آزمون متورم می‌شود) — پس گامِ ۱ اختیاری نیست.

    رگرسیون در پنجرهٔ y[r1..r2]:  Δy_t = α + φ·y_{t-1} + ε_t  با L = r2−r1 ردیف.
    """
    y = np.asarray(y, dtype=float)
    n = y.size
    lmin = w0 - 1                                   # حداقل تعداد ردیفِ رگرسیون
    out = np.full(n, np.nan)
    if n < w0 + 1:
        return out

    PY = np.concatenate(([0.0], np.cumsum(y)))                    # Σ y
    PYY = np.concatenate(([0.0], np.cumsum(y * y)))               # Σ y²
    PYlag = np.concatenate(([0.0], np.cumsum(y[:-1] * y[1:])))    # Σ y_t·y_{t+1}
    PDD = np.concatenate(([0.0], np.cumsum(np.diff(y) ** 2)))     # Σ (Δy)²

    for r2 in range(lmin, n):
        r1 = np.arange(0, r2 - lmin + 1)
        L = (r2 - r1).astype(float)
        Sx = PY[r2] - PY[r1]                                   # Σ y_{t-1}
        Sxx = PYY[r2] - PYY[r1]                                # Σ y_{t-1}²
        Sd = y[r2] - y[r1]                                     # Σ Δy
        Sxd = (PYlag[r2] - PYlag[r1]) - Sxx                    # Σ y_{t-1}·Δy
        Sdd = PDD[r2] - PDD[r1]                                # Σ (Δy)²
        Sxx_c = Sxx - Sx * Sx / L                              # مرکزی‌شده (اثرِ ثابت)
        Sxd_c = Sxd - Sx * Sd / L
        Sdd_c = Sdd - Sd * Sd / L
        with np.errstate(divide="ignore", invalid="ignore"):
            sse = Sdd_c - Sxd_c * Sxd_c / Sxx_c
            t = (Sxd_c / Sxx_c) / np.sqrt((sse / (L - 2.0)) / Sxx_c)
        ok = np.isfinite(t) & (Sxx_c > 0) & (sse > 0) & (L >= 7)
        if ok.any():
            out[r2] = float(np.max(t[ok]))
    return out


def bsadf_sequence(
    y: np.ndarray,
    r0: float | None = None,
    k: int | None = None,
    kmax: int = 4,
    ic: str = "bic",
    step: int = 1,
) -> tuple[np.ndarray, int]:
    """
    دنبالهٔ Backward Sup-ADF: برای هر نقطهٔ پایانی r2، سوپریمم آمارهٔ ADF روی
    تمام پنجره‌های [r1, r2] با طول حداقل w0.

    Args:
        y: سری (معمولاً لگاریتم نسبت قیمت به بنیادی).
        r0: کسر پنجرهٔ حداقلی. None ⇒ قاعدهٔ PSY.
        k: تأخیر ثابت. None ⇒ انتخاب خودکار با ic روی پنجرهٔ کامل و
           استفاده از همان k در تمام زیرپنجره‌ها (سازگار با شبیه‌سازی CV).
        step: گام حرکت r1 (برای تسریع شبیه‌سازی؛ روی دادهٔ واقعی ۱ بگذارید).

    Returns:
        (bsadf, k_used) — آرایه‌ای هم‌طول y با nan در ابتدای نمونه.
    """
    y = np.asarray(y, dtype=float)
    n = y.size
    w0 = _min_window(n, r0)
    if n < w0 + 5:
        return np.full(n, np.nan), 0

    if k is None:
        _, k = adf_auto(y, kmax=kmax, ic=ic)

    if k == 0 and step == 1:                       # مسیرِ سریعِ بردارشده (هم‌ارزِ حلقه)
        return _bsadf_k0(y, w0), 0

    out = np.full(n, np.nan)
    for r2 in range(w0 - 1, n):
        best = -np.inf
        r1_max = r2 - w0 + 1
        for r1 in range(0, r1_max + 1, step):
            t, _ = adf_tstat(y[r1:r2 + 1], k)
            if np.isfinite(t) and t > best:
                best = t
        out[r2] = best if np.isfinite(best) else np.nan
    return out, int(k)


# ────────────────────────────────────────────────────────────────────────────
# ۳) مقادیر بحرانی Monte Carlo (بازتولیدپذیر + کش‌شده)
# ────────────────────────────────────────────────────────────────────────────
def _cache_key(n: int, r0: float | None, k: int, n_sim: int, seed: int, step: int) -> str:
    r0s = "auto" if r0 is None else f"{r0:.4f}"
    return f"bsadf_n{n}_r0{r0s}_k{k}_B{n_sim}_s{seed}_st{step}.json"


def simulate_bsadf_cv(
    n: int,
    r0: float | None = None,
    k: int = 0,
    n_sim: int = 299,
    seed: int = 20250721,
    alphas: tuple[float, ...] = (0.90, 0.95, 0.99),
    step: int = 2,
    use_cache: bool = True,
) -> dict:
    """
    مقادیر بحرانی محدود-نمونه‌ای برای BSADF و GSADF تحت فرضیهٔ صفر
    y_t = y_{t-1} + ε_t ,  ε ~ N(0,1) ,  y_0 = 0.

    خروجی dict شامل:
        cv_bsadf: {alpha: array(n)}  — چندک نقطه‌ای دنبالهٔ BSADF
        cv_gsadf: {alpha: float}     — چندک آمارهٔ سوپریمم کل
        meta: پارامترهای شبیه‌سازی (برای گزارش در مقاله)

    هزینه: پیچیدگی O(n_sim · n² / step). برای k=0 مسیرِ بردارشدهٔ `_bsadf_k0`
    فعال می‌شود (~۸۵× سریع‌تر)، پس n_sim=999 با step=1 برای n≈۲۰۰ چند ثانیه
    است. برای k>0 حلقهٔ کند اجرا می‌شود. نتیجه روی دیسک کش می‌شود.

    **step را ۱ بگذارید.** step>1 سوپریمم را روی شبکهٔ تُنُک می‌گیرد و CV را
    پایین برآورد می‌کند؛ چون آمارهٔ روی دادهٔ واقعی با گامِ ۱ حساب می‌شود،
    مقایسه ناهمگون و اندازهٔ آزمون متورم می‌شود (n=120: ۱۱٪ به‌جای ۵٪).
    """
    key = _cache_key(n, r0, k, n_sim, seed, step)
    path = os.path.join(_CACHE_DIR, key)
    if use_cache and os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as fh:
                raw = json.load(fh)
            return {
                "cv_bsadf": {float(a): np.asarray(v) for a, v in raw["cv_bsadf"].items()},
                "cv_gsadf": {float(a): float(v) for a, v in raw["cv_gsadf"].items()},
                "meta": raw["meta"],
            }
        except Exception:  # noqa: BLE001 — کش خراب ⇒ بازتولید
            pass

    rng = np.random.default_rng(seed)
    mat = np.full((n_sim, n), np.nan)
    for b in range(n_sim):
        path_b = np.cumsum(rng.standard_normal(n))
        seq, _ = bsadf_sequence(path_b, r0=r0, k=k, step=step)
        mat[b, :] = seq

    with warnings.catch_warnings():
        warnings.simplefilter("ignore", category=RuntimeWarning)
        cv_bsadf = {a: np.nanquantile(mat, a, axis=0) for a in alphas}
        gmax = np.nanmax(mat, axis=1)
        cv_gsadf = {a: float(np.nanquantile(gmax, a)) for a in alphas}

    meta = {
        "n": n, "r0": r0, "k": k, "n_sim": n_sim, "seed": seed, "step": step,
        "null": "random walk, eps ~ N(0,1), y0 = 0",
        "min_window": _min_window(n, r0),
    }
    if use_cache:
        try:
            os.makedirs(_CACHE_DIR, exist_ok=True)
            with open(path, "w", encoding="utf-8") as fh:
                json.dump({
                    "cv_bsadf": {str(a): np.asarray(v).tolist() for a, v in cv_bsadf.items()},
                    "cv_gsadf": {str(a): v for a, v in cv_gsadf.items()},
                    "meta": meta,
                }, fh)
        except OSError:
            pass

    return {"cv_bsadf": cv_bsadf, "cv_gsadf": cv_gsadf, "meta": meta}


# ────────────────────────────────────────────────────────────────────────────
# ۴) تاریخ‌گذاری با قاعدهٔ حداقل مدت
# ────────────────────────────────────────────────────────────────────────────
def _date_stamp(flag: np.ndarray, n: int, delta: float = 1.0) -> np.ndarray:
    """
    فقط دوره‌های پیوسته‌ای که طولشان ≥ δ·log(n) است معتبرند (PSY 2015، §4).
    """
    min_dur = max(int(math.ceil(delta * math.log(max(n, 3)))), 2)
    out = np.zeros_like(flag, dtype=bool)
    i = 0
    while i < flag.size:
        if flag[i]:
            j = i
            while j < flag.size and flag[j]:
                j += 1
            if (j - i) >= min_dur:
                out[i:j] = True
            i = j
        else:
            i += 1
    return out


# ────────────────────────────────────────────────────────────────────────────
# ۵) رابط اصلی
# ────────────────────────────────────────────────────────────────────────────
@dataclass
class PSYResult:
    table: pd.DataFrame                 # value, bsadf, cv90, cv95, cv99, exceeds, is_explosive
    gsadf: float
    gsadf_cv: dict
    gsadf_pvalue: float
    k: int
    r0: float
    min_window: int
    min_duration: int
    n_sim: int
    seed: int
    target_note: str = ""
    warnings_: list = field(default_factory=list)

    @property
    def significant(self) -> bool:
        return bool(np.isfinite(self.gsadf) and self.gsadf > self.gsadf_cv.get(0.95, np.inf))

    def summary(self) -> str:
        eps = int(self.table["is_explosive"].sum())
        return (
            f"GSADF = {self.gsadf:.3f} | CV95 = {self.gsadf_cv.get(0.95, float('nan')):.3f} | "
            f"p ≈ {self.gsadf_pvalue:.3f} | k = {self.k} | w0 = {self.min_window} | "
            f"دوره‌های انفجاری معتبر: {eps} مشاهده "
            f"(حداقل مدت {self.min_duration})"
        )


def psy_test(
    series: pd.Series,
    r0: float | None = None,
    kmax: int = 4,
    ic: str = "bic",
    n_sim: int = 299,
    seed: int = 20250721,
    cv_step: int = 2,
    delta: float = 1.0,
    alpha: float = 0.95,
    target_note: str = "",
) -> PSYResult:
    """
    آزمون کامل PSY روی یک سری. سری باید **لگاریتم نسبت قیمت به بنیادی** باشد،
    نه لگاریتم نرخ اسمی (نک. misalignment_target).
    """
    s = pd.Series(series).dropna().astype(float)
    n = s.size
    warns: list[str] = []
    if n < 40:
        warns.append(
            f"تنها {n} مشاهده. توان آزمون PSY زیر ~۵۰ مشاهده پایین است؛ "
            "نتیجهٔ «بدون حباب» را به‌عنوان شواهدِ نبود حباب گزارش نکنید."
        )

    bsadf, k = bsadf_sequence(s.values, r0=r0, kmax=kmax, ic=ic, step=1)
    cvs = simulate_bsadf_cv(n=n, r0=r0, k=k, n_sim=n_sim, seed=seed, step=cv_step)

    tab = pd.DataFrame({"value": s.values, "bsadf": bsadf}, index=s.index)
    for a in (0.90, 0.95, 0.99):
        tab[f"cv{int(a * 100)}"] = cvs["cv_bsadf"][a]

    cv_sel = cvs["cv_bsadf"][alpha]
    exceeds = np.where(np.isfinite(bsadf) & np.isfinite(cv_sel), bsadf > cv_sel, False)
    tab["exceeds"] = exceeds
    tab["is_explosive"] = _date_stamp(exceeds, n, delta=delta)

    gsadf = float(np.nanmax(bsadf)) if np.isfinite(bsadf).any() else np.nan

    # p-value تجربی از توزیع شبیه‌سازی‌شدهٔ GSADF (تقریب از سه چندک ذخیره‌شده
    # کافی نیست، پس دوباره از کل ماتریس استفاده نمی‌کنیم؛ تقریب خطی بین چندک‌ها)
    gq = cvs["cv_gsadf"]
    if not np.isfinite(gsadf):
        pval = np.nan
    elif gsadf > gq[0.99]:
        pval = 0.01
    elif gsadf > gq[0.95]:
        pval = 0.05 - 0.04 * (gsadf - gq[0.95]) / max(gq[0.99] - gq[0.95], 1e-9)
    elif gsadf > gq[0.90]:
        pval = 0.10 - 0.05 * (gsadf - gq[0.90]) / max(gq[0.95] - gq[0.90], 1e-9)
    else:
        pval = 0.10 + 0.90 * min(1.0, max(0.0, (gq[0.90] - gsadf) / max(abs(gq[0.90]), 1e-9)))

    return PSYResult(
        table=tab,
        gsadf=gsadf,
        gsadf_cv=gq,
        gsadf_pvalue=float(pval),
        k=k,
        r0=(0.01 + 1.8 / math.sqrt(n)) if r0 is None else r0,
        min_window=_min_window(n, r0),
        min_duration=max(int(math.ceil(delta * math.log(max(n, 3)))), 2),
        n_sim=n_sim,
        seed=seed,
        target_note=target_note,
        warnings_=warns,
    )


# ────────────────────────────────────────────────────────────────────────────
# ۶) ساخت متغیر هدف صحیح
# ────────────────────────────────────────────────────────────────────────────
def misalignment_target(
    market: pd.Series,
    fundamental: pd.Series,
    how: str = "log_ratio",
) -> pd.Series:
    """
    متغیر هدف آزمون حباب: نسبت قیمت بازار به ارزش بنیادی، در لگاریتم.

    چرا: تئوری حباب عقلایی دربارهٔ انحراف قیمت از ارزش بنیادی است. اجرای
    PSY روی لگاریتم نرخ اسمی در اقتصادی با تورم ۴۰٪ ⇒ ریشهٔ انفجاری ناشی از
    روند تورمی، نه حباب. این خطای مشخصه‌سازی متداول‌ترین ایراد داوران است.

    Args:
        market: نرخ بازار آزاد (سطح، هم‌فرکانس با fundamental).
        fundamental: ارزش بنیادی (PPP، مدل پولی یا BEER) — هم‌شاخص.
        how: "log_ratio" (پیش‌فرض) یا "log_real" برای نرخ حقیقی.

    Returns:
        سری هم‌راستاشده و بدون NaN.
    """
    mk = pd.Series(market).astype(float)
    fd = pd.Series(fundamental).astype(float).reindex(mk.index).interpolate(limit_area="inside")
    both = pd.concat([mk.rename("m"), fd.rename("f")], axis=1).dropna()
    both = both[(both["m"] > 0) & (both["f"] > 0)]
    if both.empty:
        raise ValueError("هم‌پوشانی معتبری بین سری بازار و بنیادی وجود ندارد.")
    if how == "log_real":
        return np.log(both["m"]) - np.log(both["f"])
    return np.log(both["m"] / both["f"])


# ────────────────────────────────────────────────────────────────────────────
# سازگاری با کد قدیمی — نسخهٔ درست‌شدهٔ sup_adf
# ────────────────────────────────────────────────────────────────────────────
def sup_adf(series: pd.Series, r0: float = 0.2, **kw) -> pd.DataFrame:
    """
    شیم سازگاری با `econometrics.sup_adf` قدیمی. ستون‌های قدیمی حفظ شده‌اند
    اما `sadf` اکنون دنبالهٔ BSADF و `is_bubble` نتیجهٔ تاریخ‌گذاری با CV
    شبیه‌سازی‌شده و قاعدهٔ حداقل مدت است.

    توصیه: مستقیماً از psy_test استفاده کنید تا به CV دنباله‌ای و p-value
    دسترسی داشته باشید.
    """
    res = psy_test(series, r0=r0, **kw)
    out = res.table.rename(columns={"bsadf": "sadf", "is_explosive": "is_bubble"}).copy()
    out.attrs["critical_value"] = float(res.gsadf_cv[0.95])
    out.attrs["cv_series"] = res.table["cv95"].values
    out.attrs["gsadf"] = res.gsadf
    out.attrs["gsadf_pvalue"] = res.gsadf_pvalue
    out.attrs["k"] = res.k
    out.attrs["result"] = res
    return out
