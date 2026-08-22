import { chromium } from 'playwright';

const OUT = 'docs/assets/public-rebaseline/states';
const BASE = process.env.QA_BASE_URL || 'http://127.0.0.1:3111';

// ⚠️ فیکسچر — عددها ساختگی و صرفاً برای دیدنِ «حالتِ رابط»اند.
// هیچ‌کدام ادعای دادهٔ واقعیِ بازار نیستند و هیچ‌جای محصول استفاده نمی‌شوند.
const fixture = (ageMinutes) => ({
  fetchedAt: Date.now() - ageMinutes * 60000,
  crypto: [],
  goldGlobal: [],
  ir: {
    // `faName` لازم است، وگرنه ستونِ نام خالی رندر می‌شود و تصویر شبیه باگ
    // به نظر می‌رسد. اعداد عمداً تکراری‌اند تا با قیمتِ واقعی اشتباه نشوند.
    gold:     [{ id: 'g1', faName: 'سکهٔ نمونه (فیکسچر)', price: 111111111, changePercent: 0.4, unit: 'toman' }],
    currency: [{ id: 'c1', faName: 'ارزِ نمونه (فیکسچر)',  price: 1111111,   changePercent: -0.2, unit: 'toman' }],
    funds: [], stocks: [],
  },
});

/**
 * ⚠️ تصویر از **خودِ عنصر** گرفته می‌شود، نه از یک ناحیهٔ مختصاتی.
 *
 * نسخهٔ اول `boundingBox()` را می‌گرفت و همان را به‌عنوان `clip` می‌داد. آن
 * اندازه پیش از نشستنِ داده خوانده می‌شد، پس ارتفاع فقط به‌اندازهٔ تیتر بود و
 * هر شش تصویر عملاً یک نوارِ خالی شدند — سه‌تایشان بایت‌به‌بایت یکی. تصویری که
 * ادعا می‌کند «حالتِ کهنه» را نشان می‌دهد ولی چیزی جز عنوان ندارد، بدتر از
 * نبودِ تصویر است.
 *
 * حالا منتظرِ خودِ کارت می‌مانیم و از همان عنصر عکس می‌گیریم.
 */
const shotMarket = async (page, name) => {
  const card = page.locator('#market .card-elevated').first();
  await card.waitFor({ state: 'visible', timeout: 15000 });
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await card.screenshot({ path: `${OUT}/${name}.png` });
  console.log('  saved', name);
};

const run = async () => {
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined });

  // 1) LOADING — response held open
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.route('**/api/market', async () => { /* never fulfilled */ });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    await shotMarket(page, '01-market-loading');
    await ctx.close();
  }

  // 2) STALE — real shape, 90 minutes old
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.route('**/api/market', (r) =>
      r.fulfill({ contentType: 'application/json', body: JSON.stringify(fixture(90)) }));
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await shotMarket(page, '02-market-stale');
    await ctx.close();
  }

  // 3) FRESH — same shape, 0 minutes old (control, so stale is comparable)
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.route('**/api/market', (r) =>
      r.fulfill({ contentType: 'application/json', body: JSON.stringify(fixture(0)) }));
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await shotMarket(page, '03-market-fresh-control');
    await ctx.close();
  }

  // 4) EMPTY — well-formed response with no rows at all
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.route('**/api/market', (r) => r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ fetchedAt: Date.now(), crypto: [], goldGlobal: [],
        ir: { gold: [], currency: [], funds: [], stocks: [] } }),
    }));
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await shotMarket(page, '04-market-empty');
    await ctx.close();
  }

  // 5) ERROR — transport failure
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.route('**/api/market', (r) => r.abort());
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await shotMarket(page, '05-market-error');
    await ctx.close();
  }

  // 6) ZERO-PRICE GUARD — source returns 0, row must not appear
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.route('**/api/market', (r) => r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ fetchedAt: Date.now(), crypto: [], goldGlobal: [],
        ir: { gold: [{ id: 'قیمتِ صفر', price: 0, changePercent: null, unit: 'toman' },
                     { id: 'سکه امامی', price: 111111111, changePercent: 0.4, unit: 'toman' }],
              currency: [], funds: [], stocks: [] } }),
    }));
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const zeroVisible = await page.locator('text=قیمتِ صفر').count();
    console.log('  zero-price row rendered:', zeroVisible, '(expect 0)');
    await shotMarket(page, '06-market-zero-price-filtered');
    await ctx.close();
  }

  await browser.close();
};
run().catch((e) => { console.error(e); process.exit(1); });
