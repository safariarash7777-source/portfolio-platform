/**
 * مسیرِ واقعیِ عضو، در مرورگر — آماده برای اجرا، بدونِ محیطِ ساختگی.
 *
 * ── چرا این فایل هست ولی اجرا نشده ──────────────────────────────────────────
 * تستِ مستقیمِ Postgres جای آزمونِ `supabase-js`، احرازِ هویت و صفحه را
 * نمی‌گیرد. این اسکریپت همان مسیری را می‌رود که کاربر می‌رود:
 *
 *   ورود ← ثبت دارایی از صفحه ← ذخیره با API واقعی ← بازکردن در نشستِ تازه
 *   ← اصلاح نسخه ← مقایسه ← هشدارِ آزمایشی
 *
 * و با **دو عضو** جداییِ اطلاعات را می‌سنجد.
 *
 * ── پیش‌نیاز (هیچ‌کدام در این اسکریپت نیست و نباید باشد) ────────────────────
 * متغیرها از مسیرِ امنِ محیط تنظیم می‌شوند، نه در کد و نه در چت:
 *   QA_BASE_URL                  آدرسِ نمونهٔ در حالِ اجرا
 *   QA_MEMBER_A_EMAIL / _PASSWORD
 *   QA_MEMBER_B_EMAIL / _PASSWORD
 * و خودِ برنامه به `NEXT_PUBLIC_SUPABASE_URL`، `NEXT_PUBLIC_SUPABASE_ANON_KEY`
 * و `SUPABASE_SERVICE_ROLE_KEY` نیاز دارد.
 *
 * ⚠️ کانالِ واقعیِ هشدار باید خاموش بماند: `REBALANCE_ALERT_CHANNELS=log`.
 * این اسکریپت خودش آن را بررسی می‌کند و اگر روشن بود، **اجرا نمی‌شود** —
 * چون یک آزمونِ QA نباید به صندوقِ ورودیِ کسی برسد.
 */

const BASE = process.env.QA_BASE_URL;
const A = { email: process.env.QA_MEMBER_A_EMAIL, password: process.env.QA_MEMBER_A_PASSWORD };
const B = { email: process.env.QA_MEMBER_B_EMAIL, password: process.env.QA_MEMBER_B_PASSWORD };

const missing = [
  ['QA_BASE_URL', BASE],
  ['QA_MEMBER_A_EMAIL', A.email], ['QA_MEMBER_A_PASSWORD', A.password],
  ['QA_MEMBER_B_EMAIL', B.email], ['QA_MEMBER_B_PASSWORD', B.password],
].filter(([, v]) => !v).map(([k]) => k);

if (missing.length) {
  console.error('این آزمون بدونِ محیطِ آزمایشی اجرا نمی‌شود. متغیرهای غایب:');
  for (const k of missing) console.error(`  - ${k}`);
  console.error('\nهیچ‌کدام در کد یا چت قرار نمی‌گیرند؛ از مسیرِ امنِ محیط تنظیم شوند.');
  process.exit(2);
}

const channels = (process.env.REBALANCE_ALERT_CHANNELS ?? 'log').trim();
if (channels !== 'log') {
  console.error(`REBALANCE_ALERT_CHANNELS=${channels} — کانالِ واقعی روشن است.`);
  console.error('آزمونِ QA نباید پیامِ واقعی بفرستد. با `log` دوباره اجرا کن.');
  process.exit(2);
}

// ⚠️ ایمپورتِ مرورگر **پس از** گاردهاست: نبودِ متغیرِ محیطی باید پیامِ مفید
// بدهد، نه خطای «playwright نصب نیست» که مسئلهٔ اصلی را پنهان می‌کند.
const { chromium } = await (async () => {
  for (const m of ['playwright', 'playwright-core']) {
    try { return await import(m); } catch { /* بعدی */ }
  }
  throw new Error('نه playwright نصب است نه playwright-core');
})();

let failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) console.log(`  ok  ${name}`);
  else { failed++; console.error(`FAIL  ${name} ${extra}`); }
};

async function login(context, who) {
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', who.email);
  await page.fill('input[type="password"]', who.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 20000 });
  return page;
}

const browser = await chromium.launch();
try {
  // ── عضو اول: ثبت، ذخیره، بازکردن دوباره، اصلاح ───────────────────────────
  const ctxA = await browser.newContext();
  const pageA = await login(ctxA, A);
  await pageA.goto(`${BASE}/dashboard/holdings`, { waitUntil: 'networkidle' });

  check('صفحهٔ دارایی برای عضو باز شد', /holdings/.test(pageA.url()));

  await pageA.fill('input[name="symbol"], input[placeholder*="نماد"]', 'خودرو');
  await pageA.fill('input[name="qty"], input[inputmode="decimal"]', '100');
  await pageA.click('button:has-text("ذخیره")');
  await pageA.waitForLoadState('networkidle');

  const bodyA1 = await pageA.textContent('body');
  check('نسخهٔ تازه ذخیره و نمایش داده شد', /نسخهٔ/.test(bodyA1 ?? ''));

  // نشستِ تازه — کوکی از حافظه نمی‌آید، از سرور خوانده می‌شود.
  const ctxA2 = await browser.newContext();
  const pageA2 = await login(ctxA2, A);
  await pageA2.goto(`${BASE}/dashboard/holdings`, { waitUntil: 'networkidle' });
  const bodyA2 = await pageA2.textContent('body');
  check('همان دارایی در نشستِ تازه دیده می‌شود', /خودرو/.test(bodyA2 ?? ''));

  // اصلاح ⇒ نسخهٔ دوم، و نسخهٔ اول باید دست‌نخورده بماند.
  await pageA2.fill('input[name="qty"], input[inputmode="decimal"]', '140');
  await pageA2.click('button:has-text("ذخیره")');
  await pageA2.waitForLoadState('networkidle');
  const bodyA3 = await pageA2.textContent('body');
  check('نسخهٔ دوم ساخته شد', /۱۴۰|140/.test(bodyA3 ?? ''));

  // ── هشدارِ آزمایشی: فقط گیرندهٔ `log` ─────────────────────────────────────
  const alertRes = await pageA2.evaluate(async (base) => {
    const r = await fetch(`${base}/api/portfolio/rebalance-alert`, { method: 'POST' });
    return { status: r.status, body: await r.json().catch(() => null) };
  }, BASE);
  check('مسیر هشدار پاسخ داد', alertRes.status === 200, String(alertRes.status));
  check('هشدار فقط از کانال log رفت',
    (alertRes.body?.attempts ?? []).every((a) => a.channel === 'log'),
    JSON.stringify(alertRes.body?.attempts));

  // اجرای دوباره نباید پیامِ دوم بسازد.
  const again = await pageA2.evaluate(async (base) => {
    const r = await fetch(`${base}/api/portfolio/rebalance-alert`, { method: 'POST' });
    return r.json();
  }, BASE);
  check('اجرای دوباره پیامِ تکراری نساخت',
    again?.sent === false, JSON.stringify(again));

  // ── عضو دوم: نباید چیزی از عضو اول ببیند ─────────────────────────────────
  const ctxB = await browser.newContext();
  const pageB = await login(ctxB, B);
  await pageB.goto(`${BASE}/dashboard/holdings`, { waitUntil: 'networkidle' });
  const bodyB = await pageB.textContent('body');
  check('عضو دوم داراییِ عضو اول را نمی‌بیند', !/خودرو/.test(bodyB ?? ''));

  console.log(failed === 0 ? '\n✅ مسیر عضو سبز' : `\n❌ ${failed} مورد شکست خورد`);
} finally {
  await browser.close();
}
process.exit(failed === 0 ? 0 : 1);
