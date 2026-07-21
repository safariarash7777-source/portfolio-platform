"""
اعتبارسنجی عددی psy.py

سه سنجه:
  A) اندازهٔ آزمون (size) — قدم‌زدن تصادفی نباید حباب بدهد. نرخ رد باید ≈ ۵٪ باشد.
     نسخهٔ قدیمی با CV ثابت ۱٫۴۹ اینجا فاجعه می‌دهد.
  B) توان آزمون (power) — سری با فاز انفجاری تزریق‌شده باید شناسایی شود
     و تاریخ‌گذاری باید در بازهٔ درست بیفتد.
  C) اثر همبستگی سریالی — AR(1) قوی نباید حباب کاذب بدهد (اثر lag augmentation).
"""
import time
import numpy as np
import pandas as pd

import psy

N = 120
SEED = 7
# تنظیماتِ کالیبره‌شده — همان چیزی که app.get_psy استفاده می‌کند.
# با NSIM=199 و CV_STEP=3 (مقادیرِ اولیهٔ این فایل) مقدارِ بحرانی ~۰٫۱۳ کمتر از
# حقیقت برآورد می‌شد و بخش A نرخِ ردِ ~۱۵٪ می‌داد؛ نه به‌خاطرِ ایرادِ psy.py،
# بلکه به‌خاطرِ همین دو پارامتر. با مسیرِ بردارشدهٔ _bsadf_k0 هزینه‌شان ناچیز است.
NSIM = 999
CV_STEP = 1

rng = np.random.default_rng(SEED)


def run(y, tag, **kw):
    s = pd.Series(y)
    res = psy.psy_test(s, n_sim=NSIM, cv_step=CV_STEP, **kw)
    n_ep = int(res.table["is_explosive"].sum())
    print(f"  [{tag}] {res.summary()}")
    return res, n_ep


print("پیش‌گرم‌کردن کش مقادیر بحرانی…")
t0 = time.time()
cv = psy.simulate_bsadf_cv(n=N, k=0, n_sim=NSIM, seed=psy.__dict__.get("_", 20250721), step=CV_STEP)
print(f"  CV95 (GSADF) = {cv['cv_gsadf'][0.95]:.3f}  | زمان: {time.time()-t0:.1f}s")
print(f"  CV95 دنباله‌ای: min={np.nanmin(cv['cv_bsadf'][0.95]):.2f} "
      f"max={np.nanmax(cv['cv_bsadf'][0.95]):.2f}  (نسخهٔ قدیمی: ثابت 1.49)")

# ── A) اندازهٔ آزمون ──────────────────────────────────────────────────────
print("\nA) اندازهٔ آزمون روی قدم‌زدن تصادفی (باید ≈۵٪ باشد)")
REP = 40
rej_new = 0
rej_old = 0
for i in range(REP):
    y = np.cumsum(rng.standard_normal(N))
    b, k = psy.bsadf_sequence(y, k=0)
    g = np.nanmax(b)
    if g > cv["cv_gsadf"][0.95]:
        rej_new += 1
    if np.nansum(b > 1.49) > 0:          # قاعدهٔ نسخهٔ قدیمی
        rej_old += 1
print(f"  نرخ رد — نسخهٔ اصلاح‌شده: {rej_new/REP:6.1%}   (هدف ۵٪)")
print(f"  نرخ رد — قاعدهٔ قدیمی cv=1.49: {rej_old/REP:6.1%}   ← اندازهٔ متورم")

# ── B) توان آزمون ────────────────────────────────────────────────────────
print("\nB) توان: سری با فاز انفجاری تزریق‌شده (t=60..85)")
y = np.zeros(N)
eps = rng.standard_normal(N) * 0.5
for t in range(1, N):
    if 60 <= t < 85:
        y[t] = 1.06 * y[t - 1] + eps[t]      # ریشهٔ انفجاری
    else:
        y[t] = y[t - 1] + eps[t]
res_b, n_ep = run(y, "explosive")
det = np.where(res_b.table["is_explosive"].values)[0]
if det.size:
    print(f"  بازهٔ شناسایی‌شده: t={det.min()}..{det.max()}  (حقیقت: 60..84)")
else:
    print("  ❌ هیچ دوره‌ای شناسایی نشد")

# ── C) همبستگی سریالی ────────────────────────────────────────────────────
print("\nC) AR(1) با ρ=0.85 حول یک روند (نباید حباب بدهد)")
y = np.zeros(N)
e = rng.standard_normal(N)
for t in range(1, N):
    y[t] = 0.85 * y[t - 1] + e[t]
res_c, n_c = run(y, "AR(1)")
b_naive, _ = psy.bsadf_sequence(y, k=0)
print(f"  با k=0 اجباری (شبیه نسخهٔ قدیمی): {int(np.nansum(b_naive > 1.49))} مشاهدهٔ «حباب» کاذب")
print(f"  با انتخاب BIC (k={res_c.k}): {n_c} مشاهده")

# ── D) بازتولیدپذیری ─────────────────────────────────────────────────────
print("\nD) بازتولیدپذیری seed")
a = psy.simulate_bsadf_cv(n=60, k=0, n_sim=50, seed=123, step=4, use_cache=False)
b = psy.simulate_bsadf_cv(n=60, k=0, n_sim=50, seed=123, step=4, use_cache=False)
same = np.allclose(a["cv_bsadf"][0.95], b["cv_bsadf"][0.95], equal_nan=True)
print(f"  دو اجرا با seed یکسان برابرند: {same}")

# ── E) متغیر هدف ─────────────────────────────────────────────────────────
print("\nE) اثر متغیر هدف: نرخ اسمی تورمی در برابر نسبت به بنیادی")
idx = pd.date_range("2015-01-01", periods=N, freq="ME")
infl = np.exp(np.cumsum(np.full(N, 0.028)))              # تورم ماهانه ~۲.۸٪
noise = np.exp(np.cumsum(rng.standard_normal(N) * 0.02))
market = 1000 * infl * noise
fundamental = 1000 * infl                                 # بنیادی = مسیر تورمی
mk = pd.Series(market, index=idx)
fd = pd.Series(fundamental, index=idx)

r_nom, n_nom = run(np.log(mk), "log نرخ اسمی")
tgt = psy.misalignment_target(mk, fd)
r_mis, n_mis = run(tgt, "log(بازار/بنیادی)")
print(f"  «حباب» روی نرخ اسمی: {n_nom} مشاهده  ← مصنوعِ روند تورمی")
print(f"  حباب روی انحراف از بنیادی: {n_mis} مشاهده  ← درست (باید ۰ باشد)")
print("\n✅ تست‌ها اجرا شد.")
