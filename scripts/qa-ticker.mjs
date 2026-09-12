#!/usr/bin/env node
/**
 * بررسیِ رفتاریِ نوارِ قیمتِ صفحهٔ اصلی.
 *
 * چهار چیز را روی مرورگرِ واقعی می‌سنجد که تستِ واحد نمی‌تواند:
 *   ۱ چند دارایی واقعاً رندر می‌شود (باید ۸ تا ۱۲ باشد، نه ده‌ها)
 *   ۲ صفحه‌خوان قیمت‌ها را یک بار می‌بیند، نه دو بار
 *   ۳ زیرِ prefers-reduced-motion نوار حرکت نمی‌کند
 *   ۴ سرریزِ افقی در ۳۹۰px و ۱۴۴۰px صفر است
 *
 *   QA_BASE_URL=http://127.0.0.1:3111 node scripts/qa-ticker.mjs
 */
const { chromium } = await (async () => {
  for (const m of ['playwright', 'playwright-core']) {
    try { return await import(m); } catch { /* بعدی */ }
  }
  throw new Error('نه playwright نصب است نه playwright-core');
})();

const BASE = process.env.QA_BASE_URL || 'http://127.0.0.1:3111';
const OUT = 'docs/assets/public-rebaseline/states';

// ⚠️ فیکسچر — شکلِ پاسخِ واقعی با حجمِ واقعی. اعداد ساختگی‌اند و هیچ‌جای
// محصول استفاده نمی‌شوند؛ فقط برای دیدنِ رفتارِ انتخاب زیرِ فشارِ منبعِ شلوغ.
const noisy = () => {
  const cur = (id, p) => ({ id, faName: `ارزِ ${id}`, price: p, changePercent: 0.3, unit: 'toman' });
  const gold = (id, p) => ({ id, faName: `طلای ${id}`, price: p, changePercent: -0.2, unit: 'toman' });
  return {
    fetchedAt: Date.now(),
    ir: {
      fetchedAt: Date.now(),
      currency: [
        cur('USD', 111111), cur('EUR', 122222), cur('AED', 33333), cur('GBP', 144444),
        cur('TRY', 5555), cur('JPY', 777), cur('CNY', 16666), cur('CAD', 88888),
        cur('AUD', 99999), cur('CHF', 121212), cur('SEK', 13131), cur('NOK', 14141),
        cur('RUB', 1515), cur('INR', 1616), cur('IQD', 171),
      ],
      gold: [
        gold('IR_GOLD_18K', 111111111), gold('IR_GOLD_24K', 122222222),
        gold('IR_GOLD_MELTED', 133333333), gold('IR_COIN_EMAMI', 144444444),
        gold('IR_COIN_BAHAR', 155555555), gold('IR_COIN_HALF', 166666666),
        gold('IR_COIN_QUARTER', 177777777), gold('IR_COIN_1G', 188888888),
        gold('IR_GOLD_BUBBLE', 1999),
      ],
      funds: [], stocks: [],
    },
    goldGlobal: [{ id: 'pax-gold', faName: 'انس طلا (PAXG)', price: 2222, change24h: 0.5 }],
    crypto: [
      { id: 'bitcoin', faName: 'بیت‌کوین', price: 66666, change24h: -1.1 },
      { id: 'ethereum', faName: 'اتریوم', price: 3333, change24h: 2.2 },
      { id: 'solana', faName: 'سولانا', price: 111, change24h: 4.4 },
    ],
  };
};

let failures = 0;
const check = (ok, label, detail) => {
  if (!ok) failures++;
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const newPage = async (browser, { width, height, reducedMotion }) => {
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion });
  const page = await ctx.newPage();
  await page.route('**/api/market', (r) =>
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(noisy()) }));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.ticker-row', { timeout: 15000 });
  await page.waitForTimeout(500);
  return { ctx, page };
};

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined });

// ── ۱ و ۲: تعداد و خواندنِ صفحه‌خوان (حرکت روشن) ──────────────────────────────
console.log('\nحرکتِ عادی · ۱۴۴۰×۹۰۰');
{
  const { ctx, page } = await newPage(browser, { width: 1440, height: 900, reducedMotion: 'no-preference' });

  const visible = await page.locator('ul.ticker-row:not([aria-hidden="true"]) li').count();
  const total = await page.locator('ul.ticker-row li').count();
  const hidden = await page.locator('ul.ticker-row[aria-hidden="true"] li').count();

  check(visible >= 8 && visible <= 12, 'بینِ ۸ تا ۱۲ دارایی رندر شد', `${visible} دارایی از ۲۸ ردیفِ منبع`);
  check(hidden === visible, 'کپیِ دوم دقیقاً هم‌اندازهٔ اصلی و aria-hidden است', `${hidden} پنهان`);
  check(total === visible * 2, 'در DOM دو کپی هست (برای پیوستگیِ حرکت)', `${total} مجموع`);

  // نویز نباید رد شده باشد
  for (const noise of ['ارزِ JPY', 'ارزِ TRY', 'طلای IR_GOLD_BUBBLE', 'سولانا']) {
    check((await page.locator(`ul.ticker-row:not([aria-hidden="true"]) li:has-text("${noise}")`).count()) === 0,
      `«${noise}» در نوار نیست`);
  }
  for (const keep of ['ارزِ USD', 'طلای IR_COIN_EMAMI', 'بیت‌کوین']) {
    check((await page.locator(`ul.ticker-row:not([aria-hidden="true"]) li:has-text("${keep}")`).count()) === 1,
      `«${keep}» هست و یک بار`);
  }

  // حرکت واقعاً هست
  const track = page.locator('.ticker-track');
  const x1 = (await track.boundingBox()).x;
  await page.waitForTimeout(1200);
  const x2 = (await track.boundingBox()).x;
  check(Math.abs(x2 - x1) > 0.5, 'نوار حرکت می‌کند', `Δx=${(x2 - x1).toFixed(1)}px`);

  // عکس از خودِ ظرف گرفته می‌شود، نه از ناحیهٔ مختصاتی: ظرف ثابت است، فقط
  // مسیرِ داخلش حرکت می‌کند — پس scrollIntoView روی مسیر هرگز «پایدار» نمی‌شود.
  await page.locator('[data-testid="market-ticker"]').screenshot({ path: `${OUT}/08-ticker-curated.png` });
  console.log('  saved 08-ticker-curated');
  await ctx.close();
}

// ── ۳: کاهشِ حرکت ────────────────────────────────────────────────────────────
console.log('\nprefers-reduced-motion: reduce · ۱۴۴۰×۹۰۰');
{
  const { ctx, page } = await newPage(browser, { width: 1440, height: 900, reducedMotion: 'reduce' });

  const lists = await page.locator('ul.ticker-row').count();
  check(lists === 1, 'کپیِ تکراری اصلاً ساخته نشده', `${lists} فهرست`);

  const anim = await page.locator('.ticker-track').evaluate((el) => getComputedStyle(el).animationName);
  check(anim === 'none', 'انیمیشنِ نوار خاموش است', `animation-name: ${anim}`);

  const track = page.locator('.ticker-track');
  const x1 = (await track.boundingBox()).x;
  await page.waitForTimeout(1500);
  const x2 = (await track.boundingBox()).x;
  check(Math.abs(x2 - x1) < 0.5, 'نوار ثابت می‌ماند', `Δx=${(x2 - x1).toFixed(2)}px`);

  const scrollable = await page.locator('.ticker-wrap').evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  const overflowX = await page.locator('.ticker-wrap').evaluate((el) => getComputedStyle(el).overflowX);
  check(!scrollable || overflowX === 'auto' || overflowX === 'scroll',
    'محتوای بیرونِ کادر با اسکرولِ افقی در دسترس است', `overflow-x: ${overflowX}`);

  await page.locator('[data-testid="market-ticker"]').screenshot({ path: `${OUT}/09-ticker-reduced-motion.png` });
  console.log('  saved 09-ticker-reduced-motion');
  await ctx.close();
}

// ── ۴: سرریزِ افقی ───────────────────────────────────────────────────────────
console.log('\nسرریزِ افقی');
for (const [w, h] of [[390, 844], [1440, 900]]) {
  const { ctx, page } = await newPage(browser, { width: w, height: h, reducedMotion: 'no-preference' });
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(over <= 0, `${w}×${h}: بدونِ سرریزِ افقی`, `${over}px`);
  await ctx.close();
}

await browser.close();
console.log(failures === 0 ? '\nهمهٔ بررسی‌ها سبز.' : `\n${failures} بررسی مردود.`);
process.exit(failures === 0 ? 0 : 1);
