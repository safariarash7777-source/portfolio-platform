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
    gold:     [{ id: 'سکه امامی', price: 111111111, changePercent: 0.4, unit: 'toman' }],
    currency: [{ id: 'دلار آزاد',  price: 1111111,   changePercent: -0.2, unit: 'toman' }],
    funds: [], stocks: [],
  },
});

const shot = async (page, name, clip) => {
  await page.screenshot({ path: `${OUT}/${name}.png`, ...(clip ? { clip } : { fullPage: false }) });
  console.log('  saved', name);
};

const marketBox = async (page) => {
  const el = await page.$('#market');
  if (!el) return null;
  const b = await el.boundingBox();
  return b ? { x: b.x, y: b.y, width: b.width, height: Math.min(b.height, 620) } : null;
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
    await shot(page, '01-market-loading', await marketBox(page));
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
    await shot(page, '02-market-stale', await marketBox(page));
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
    await shot(page, '03-market-fresh-control', await marketBox(page));
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
    await shot(page, '04-market-empty', await marketBox(page));
    await ctx.close();
  }

  // 5) ERROR — transport failure
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.route('**/api/market', (r) => r.abort());
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await shot(page, '05-market-error', await marketBox(page));
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
    await shot(page, '06-market-zero-price-filtered', await marketBox(page));
    await ctx.close();
  }

  await browser.close();
};
run().catch((e) => { console.error(e); process.exit(1); });
