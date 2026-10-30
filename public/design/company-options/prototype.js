import { DATA, DATA_JSON } from './data.mjs';

const variant = document.body.dataset.view === 'dossier' ? 'dossier' : 'decision';
const fa = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 });
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const digits = value => String(value).replace(/\d/g, char => '۰۱۲۳۴۵۶۷۸۹'[Number(char)]);
const title = variant === 'decision' ? 'الف · خلاصه و مسیر بررسی' : 'ب · سند و تحلیل عمیق';
const allowedStates = new Set(['ready', 'empty', 'error']);
let state = new URL(location.href).searchParams.get('state') || 'ready';
if (!allowedStates.has(state)) state = 'ready';
let reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const tag = () => '<span class="sample-tag">دادهٔ آموزشی</span>';
const note = () => `<p class="section-note">مثال آموزشی · <span class="mono">${DATA.datasetId}</span> · هیچ داده یا سند واقعی در این نمونه استفاده نشده است.</p>`;
const unknown = reason => `<span class="unknown">نامعلوم</span><small class="reason-text">${escape(reason)}</small>`;
const fieldValue = row => row.value === null ? unknown(row.reason) : `<span class="value mono" data-figure="${row.key}">${fa.format(row.value)}</span>`;
const getRow = key => DATA.rows.find(row => row.key === key);

function shell(content) {
  return `
    <div class="preview-bar"><div class="wrap"><strong>نمونهٔ تأییدنشده · NOT FOR MERGE</strong><span>فقط مقایسهٔ ساختار صفحه · داده‌ها آموزشی‌اند · اتصال به حساب یا سرویس ندارد</span></div></div>
    <header class="wrap masthead">
      <div class="brand"><img src="../../brand/mark.png" width="28" height="57" alt="نشان آرش صفری"><div><strong>آرش صفری</strong><small>تحلیلگر و مشاور سرمایه‌گذاری</small></div></div>
      <nav class="variant-switch" aria-label="انتخاب ساختار صفحه شرکت">
        <a data-variant-link href="./decision.html" ${variant === 'decision' ? 'aria-current="page"' : ''}>الف · مسیر بررسی</a>
        <a data-variant-link href="./dossier.html" ${variant === 'dossier' ? 'aria-current="page"' : ''}>ب · میز اسناد</a>
      </nav>
    </header>
    <div class="wrap controls" aria-label="کنترل‌های نمونهٔ آموزشی">
      <label for="sample-state">حالت نمونه<select id="sample-state"><option value="ready" ${state === 'ready' ? 'selected' : ''}>دادهٔ آموزشی</option><option value="empty" ${state === 'empty' ? 'selected' : ''}>حالت خالی آموزشی</option><option value="error" ${state === 'error' ? 'selected' : ''}>شبیه‌سازی نمایش خطا</option></select></label>
      <label for="reduce-motion"><input id="reduce-motion" type="checkbox" ${reduced ? 'checked' : ''}>کاهش حرکت</label>
      <p class="dataset-label">دادهٔ مشترک: <span class="mono" data-dataset-id>${DATA.datasetId}</span></p>
    </div>
    <main id="main" tabindex="-1" class="wrap">${content}</main>
    <footer class="wrap"><div class="shared-footer"><p>این صفحه ابزار معامله، توصیهٔ سرمایه‌گذاری یا پروندهٔ واقعی شرکت نیست.</p><p>${escape(title)} · نسخهٔ آموزشی ثابت <span class="mono">${DATA.datasetId}</span></p><p class="hash">اثر دادهٔ مشترک: <span class="mono" data-data-hash>در حال محاسبهٔ اثر فایل محلی…</span></p></div></footer>`;
}

function metric(key) {
  const row = getRow(key);
  return `<article class="card metric"><p class="label">${escape(row.label)}</p><strong class="number" ${row.value === null ? '' : `data-figure="${key}"`}>${row.value === null ? 'نامعلوم' : fa.format(row.value)}</strong><span class="unit">${escape(row.unit)} · آموزشی</span>${row.value === null ? `<p class="reason">${escape(row.reason)}</p>` : '<p class="reason">فقط مقدار ثبت‌شدهٔ مثال؛ بدون رتبه یا نتیجه‌گیری اقتصادی</p>'}</article>`;
}

function meta() {
  const entries = [
    ['مبدأ داده', DATA.source.label],
    ['شناسهٔ آموزشی', `<span class="mono">${DATA.source.sampleDocumentId}</span>`],
    ['پایان دورهٔ مثال', `<span class="mono">${digits(DATA.period)}</span>`],
    ['تعریف دوره', DATA.periodDefinition],
    ['واحد مبلغ / مقدار', `${DATA.amountUnit} / ${DATA.quantityUnit}`],
    ['تاریخ نسخهٔ آموزشی', `<span class="mono">${digits(DATA.source.createdOn)}</span> · زمان منبع واقعی نیست`],
    ['زمان انتشار منبع واقعی', unknown('برای مثال آموزشی تعریف نشده است.')],
    ['زمان جمع‌آوری واقعی', unknown('این نمونه از سرویس داده دریافت نشده است.')],
    ['شناسهٔ گزارش رسمی', unknown('شناسهٔ آموزشی جای شناسهٔ رسمی گزارش نیست.')],
    ['نسخه / اصلاحیه', unknown('در این مثال، revision رسمی تعریف نشده است.')],
    ['پیوند سند رسمی', unknown('سند رسمی واقعی به این نمونه پیوست نشده است.')],
  ];
  return `<dl class="meta-grid">${entries.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
}

function sourceCard(disclosure = false) {
  const contents = `<p class="muted">منبع این صفحه، فایل آموزشی مشترک است. تاریخ دوره، زمان انتشار و زمان خواندن سه مفهوم جدا هستند.</p>${meta()}${note()}`;
  return disclosure
    ? `<details id="sources" class="card disclosure"><summary>سند مبنا و شناسنامهٔ دادهٔ آموزشی</summary><div class="details-body">${contents}</div></details>`
    : `<section id="sources" class="card document-sheet"><div class="document-topline"><div><p class="eyebrow">سند مبنا · رسمی نیست</p><h2>شناسنامهٔ داده، پیش از تحلیل</h2></div>${tag()}</div>${contents}</section>`;
}

function tableRows(rows) {
  return rows.map(row => `<tr><th scope="row">${escape(row.label)}</th><td>${fieldValue(row)}</td><td>${escape(row.unit)}</td><td><span class="mono">${digits(DATA.period)}</span></td></tr>`).join('') || '<tr><td colspan="4">در همین جدول آموزشی سطری با این عنوان پیدا نشد؛ ارقام تغییر نکرده‌اند.</td></tr>';
}

function figures() {
  return `<section id="figures" class="card"><div class="panel-head"><div><p class="eyebrow">ارقام قابل ردیابی</p><h2>چه چیزی داریم، چه چیزی نداریم؟</h2></div>${tag()}</div>
    <div class="table-tools"><label class="search-field" for="row-search">یافتن عنوان در همین جدول<input id="row-search" type="search" maxlength="80" autocomplete="off" placeholder="مثلاً سود یا فروش"></label><p class="table-count" role="status" aria-live="polite" id="row-count">${fa.format(DATA.rows.length)} سطر آموزشی</p></div>
    <div class="table-scroll" tabindex="0" role="region" aria-label="جدول ارقام آموزشی؛ در صفحه کوچک پیمایش افقی دارد"><table class="data-table"><caption>همان ارقام در هر دو طرح · سند آموزشی <span class="mono">${DATA.source.sampleDocumentId}</span></caption><thead><tr><th scope="col">عنوان</th><th scope="col">مقدار</th><th scope="col">واحد</th><th scope="col">دورهٔ مثال</th></tr></thead><tbody id="figure-rows">${tableRows(DATA.rows)}</tbody></table></div>${note()}</section>`;
}

function months() {
  return `<section id="months" class="card"><div class="panel-head"><div><p class="eyebrow">چهار مشاهدهٔ همان مثال</p><h2>مسیر مبلغ فروش ماهانه</h2></div>${tag()}</div><p class="muted">واحد همهٔ نقاط: میلیون ریال. مشاهدهٔ بیشتر فروش به‌تنهایی سود بیشتر را ثابت نمی‌کند.</p><div class="months" style="margin-top:20px">${DATA.months.map((month, index) => `<article class="month ${index === DATA.months.length - 1 ? 'latest' : ''}"><span>${month.label}</span><strong class="mono" data-month="${month.period}">${fa.format(month.sales)}</strong><span class="mono">${digits(month.period)}</span></article>`).join('')}</div>${note()}</section>`;
}

function limitations() {
  return `<section id="questions" class="card"><div class="panel-head"><div><p class="eyebrow">مرز برداشت از داده</p><h2>پیش از نتیجه‌گیری چه باید روشن شود؟</h2></div>${tag()}</div><ul class="quality-list"><li>هزینه و سود موجود نیستند؛ تغییر فروش را تغییر سود نمی‌نامیم.</li><li>نسخهٔ اصلاحیه و سند رسمی نامعلوم‌اند؛ این مثال شاهد انتخاب آخرین گزارش نیست.</li><li>زمان انتشار و زمان جمع‌آوری واقعی تعریف نشده‌اند؛ دورهٔ مالی را جای آن‌ها نمی‌گذاریم.</li></ul><div class="next-box"><strong>اقدام بعدی در محصول واقعی</strong><p>دریافت گزارش رسمیِ همان دوره و تطبیق واحد و نسخه، پیش از تحلیل. این دکمه یا صفحه، دریافت واقعی انجام نمی‌دهد.</p></div>${note()}</section>`;
}

function decision() {
  return `<section class="hero"><div><p class="eyebrow">طرح الف · خلاصه و مسیر بررسی</p><h1 class="hero-name">${DATA.company}</h1><p class="lede">اول ببینیم چه می‌دانیم؛ بعد سند و جزئیات را بررسی کنیم.</p><p class="hero-period">دورهٔ آموزشی: <span class="mono">${digits(DATA.period)}</span></p><div class="hero-actions"><a class="button primary" href="#figures">دیدن ارقام و نامعلوم‌ها</a><a class="button quiet" href="#sources">بررسی سند مبنا</a></div></div><div class="hero-aside"><h2>یک نگاه، با مرز روشن</h2><p>مبلغ و مقدار فروش در این مثال ثبت شده‌اند. دربارهٔ سود، هزینه و ارزش‌گذاری داده‌ای نداریم.</p></div></section>
    <section class="summary-grid" aria-label="خلاصه ارقام آموزشی">${metric('sales')}${metric('quantity')}${metric('profit')}</section>
    <div class="decision-body"><div class="stack">${months()}${figures()}${sourceCard(true)}</div><aside class="stack"><section class="card"><p class="eyebrow">مسیر مطالعه</p><h2>گام بعدیِ بررسی شما</h2><ol class="steps"><li><div><h3>عدد را با دوره بخوانید</h3><p>مبلغ، مقدار و واحد را کنار هم ببینید.</p><a href="#figures">بازکردن ارقام</a></div></li><li><div><h3>سند مبنا را بشناسید</h3><p>آیا منبع، زمان و نسخه مشخص‌اند؟</p><a href="#sources">دیدن شناسنامهٔ منبع</a></div></li><li><div><h3>ابهام را باز نگه دارید</h3><p>فروش بیشتر، به‌تنهایی ادعای سود نیست.</p><a href="#questions">دیدن ابهام‌ها</a></div></li></ol></section>${limitations()}</aside></div>`;
}

function dossier() {
  return `<div class="doc-layout"><nav class="doc-rail" aria-label="فهرست پرونده آموزشی"><h2>پروندهٔ مطالعه</h2><p>ساختار ب · از سند به برداشت</p><a href="#sources">۱. شناسنامهٔ سند</a><a href="#figures">۲. جدول ارقام</a><a href="#months">۳. مشاهدات ماهانه</a><a href="#questions">۴. ابهام و دامنه</a><a href="#summary">۵. جمع‌بندی همان داده</a></nav><div class="doc-main"><header class="doc-header"><div><p class="eyebrow">طرح ب · سند و تحلیل عمیق</p><h1>${DATA.company}</h1><p class="doc-subtitle">${DATA.sector} · پروندهٔ آموزشی <span class="mono">${DATA.datasetId}</span></p></div>${tag()}</header>${sourceCard()}<p class="reading-order">این ساختار، شناسنامه و جدول را پیش از جمع‌بندی نشان می‌دهد؛ منطق و ارقام با طرح الف یکسان‌اند.</p>${figures()}<div class="doc-columns">${months()}${limitations()}</div><section id="summary" class="doc-section"><h2>جمع‌بندی همان دادهٔ آموزشی</h2><p class="muted">عددها تکرار همان فایل مشترک‌اند؛ امتیاز یا توصیه‌ای به آن‌ها اضافه نشده است.</p><div class="summary-grid">${metric('sales')}${metric('quantity')}${metric('profit')}</div></section></div></div>`;
}

function stateView() {
  const empty = state === 'empty';
  return `<section class="card state-card" ${empty ? 'role="status"' : 'role="alert"'}><p class="state-code">${empty ? 'EMPTY · حالت آموزشی' : 'ERROR · شبیه‌سازی نمایش'}</p><h1>${empty ? 'اگر داده‌ای برای نمایش نباشد' : 'اگر خواندن داده انجام نشود'}</h1><p class="lede">${empty ? 'در این حالتِ طراحی، رقم و سندی نمایش نمی‌دهیم. نبود داده به معنی فروش یا سود صفر نیست.' : 'این فقط نمونهٔ نمایش خطاست؛ هیچ سرویس یا API فراخوانی نشده است. در محصول واقعی، خطای خواندن به معنی نبود گزارش نیست.'}</p><p class="muted">هویت، منبع، زمان، واحد، دوره و اصلاحیه در یک خواندن ناموفق قابل تأیید نیستند.</p><button class="button primary" id="show-ready">دیدن دوبارهٔ دادهٔ آموزشی</button><small>این کنترل فقط حالت صفحه را عوض می‌کند؛ ثبت یا دریافت واقعی انجام نمی‌دهد.</small></section>`;
}

function revealHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!id) return;
  const target = document.getElementById(id);
  if (target?.tagName === 'DETAILS') target.open = true;
}

function render() {
  document.documentElement.dataset.reduced = String(reduced);
  document.getElementById('app').innerHTML = shell(state === 'ready' ? (variant === 'decision' ? decision() : dossier()) : stateView());
  document.querySelectorAll('[data-variant-link]').forEach(link => {
    const url = new URL(link.getAttribute('href'), location.href);
    url.searchParams.set('state', state);
    link.href = url.href;
  });
  document.getElementById('sample-state').addEventListener('change', event => {
    state = event.target.value;
    const url = new URL(location.href); url.searchParams.set('state', state); url.hash = '';
    history.replaceState(null, '', url);
    render();
    document.getElementById('sample-state').focus({ preventScroll: true });
  });
  document.getElementById('reduce-motion').addEventListener('change', event => {
    reduced = event.target.checked;
    document.documentElement.dataset.reduced = String(reduced);
  });
  document.getElementById('show-ready')?.addEventListener('click', () => {
    state = 'ready'; const url = new URL(location.href); url.searchParams.set('state', state);
    history.replaceState(null, '', url); render(); document.getElementById('main').focus();
  });
  document.getElementById('row-search')?.addEventListener('input', event => {
    const query = event.target.value.trim();
    const rows = DATA.rows.filter(row => row.label.includes(query));
    document.getElementById('figure-rows').innerHTML = tableRows(rows);
    document.getElementById('row-count').textContent = `${fa.format(rows.length)} سطر از ${fa.format(DATA.rows.length)} سطر آموزشی`;
  });
  document.querySelectorAll('a[href^="#"]').forEach(link => link.addEventListener('click', () => {
    const target = document.getElementById(link.getAttribute('href').slice(1));
    if (target?.tagName === 'DETAILS') target.open = true;
  }));
  if (crypto.subtle) crypto.subtle.digest('SHA-256', new TextEncoder().encode(DATA_JSON)).then(buffer => {
    const hash = [...new Uint8Array(buffer)].map(value => value.toString(16).padStart(2, '0')).join('');
    const target = document.querySelector('[data-data-hash]');
    if (target) { target.textContent = hash; target.dataset.hash = hash; }
  }).catch(() => { document.querySelector('[data-data-hash]').textContent = 'در این مرورگر قابل محاسبه نیست؛ شناسهٔ مجموعه ثابت است.'; });
  revealHash();
}
window.addEventListener('hashchange', revealHash);
render();
