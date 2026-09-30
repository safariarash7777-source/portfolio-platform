import {emptyWorkbook,SCENARIO_KEYS} from './research-workbook';
/** Synthetic teaching scenario, no market number or claim of a live observation. */
export function publicationResearchFixture(version:1|2){
 const w=emptyWorkbook();w.title='نمونه برچسب‌دار: فاصله قیمت صندوق و NAV';w.question='چگونه تاریخ معتبر قیمت و NAV را با هم مقایسه کنیم؟';w.horizon='جلسه آموزشی نمونه؛ بدون تصمیم معامله';
 w.evidence=[{id:'e1',statement:'شاهد مصنوعی برای تمرین ثبت منبع؛ فاقد عدد بازار',sourceUrl:'https://example.invalid/synthetic-fund',observedOn:'2026-09-30',publishedOn:'2026-09-30'}];
 w.interpretation=version===1?'PRIVATE یادداشت داخلی نمونه: اختلاف دو تاریخ می‌تواند مقایسه را نامعتبر کند.':'PRIVATE نسخه دوم: پیش از مقایسه تاریخ معتبر هر دو داده جدا ثبت شود؛ دریافت امروز، اعتبار امروز را تضمین نمی‌کند.';
 w.counterEvidence='نمونه هیچ مشاهده زنده یا اصلاحیه واقعی ندارد؛ نتیجه مالی از آن قابل استنتاج نیست.';
 for(const key of SCENARIO_KEYS)w.scenarios[key]={assumptions:`فرض آموزشی ${key}: وجود دو داده هم‌تاریخ باید بررسی شود.`,mechanism:'تفاوت زمان محاسبه و زمان معامله ممکن است مقایسه را تغییر دهد؛ این مثال نرخ یا بازده ندارد.',invalidation:'اگر تاریخ یا واحد مبهم باشد، مقایسه متوقف شود.'};
 w.portfolioImpact='این تمرین برای آموزش کیفیت داده است؛ وزن سبد یا اقدام معامله پیشنهاد نمی‌شود.';w.reviewOn='2026-10-01';return w;
}
