import { toPersianDigits } from '@/lib/format';
import { RESEARCH_POLICY } from '@/lib/intelligence/research-policy';

const roles = [
  { name: 'پژوهش بازار', method: `${RESEARCH_POLICY.model} · ${RESEARCH_POLICY.effort}`, where: 'Hermes روی رایانهٔ مالک؛ اجرای پس‌زمینه', output: 'پیش‌نویس خصوصی با شاهد، سناریو و شرط ابطال', limit: 'پوشش فعلی محدود به صورت‌های مالی منتخب است؛ تکنیکال، جریان نقد، طلا، ارز و بورس کالا هنوز پژوهش جامع ندارند.' },
  { name: 'کیفیت داده', method: 'قواعد قطعی؛ بدون مدل و بدون توکن', where: 'سرور؛ هر ده دقیقه', output: 'تفکیک دریافت، زمان قیمت و دادهٔ نامشخص', limit: 'قدیمی بودن قیمت، به‌تنهایی خرابی API نیست؛ این نقش داده را تعمیر نمی‌کند.' },
  { name: 'پایش فنی', method: 'قواعد قطعی؛ بدون مدل و بدون توکن', where: 'سرور؛ هر ده دقیقه', output: 'بررسی سرویس‌ها و صفحهٔ عمومی', limit: 'سالم بودن سرویس، صحت همهٔ نمودارها یا ورود کاربران را ثابت نمی‌کند.' },
  { name: 'هماهنگی', method: 'قواعد قطعی؛ بدون مدل و بدون توکن', where: 'همراه پایش سرور', output: 'اولویت‌بندی مشکلات مشاهده‌شده', limit: 'فرمان دلخواه، تغییر سایت، انتشار یا تعمیر خودکار ندارد.' },
  { name: 'راهنمای کاربر', method: 'پاسخ‌های تأییدشده؛ بدون مدل و بدون توکن', where: 'صفحهٔ راهنما؛ هنگام انتخاب موضوع توسط کاربر', output: 'راهنمای صفحات و مسیر تماس انسانی', limit: 'به حساب، سبد، پرداخت یا دادهٔ کاربران دسترسی ندارد؛ ارسال خودکار پیام به مدیر انجام نمی‌دهد.' },
];
export default function AgentTeamGuide() {
  return <section className="space-y-4" aria-labelledby="agent-team-guide">
    <h2 id="agent-team-guide" className="text-lg font-bold">هر نقش چگونه کار می‌کند؟</h2>
    <p className="text-sm leading-7">این بخش قرارداد اجرای کد را توضیح می‌دهد، نه سلامت لحظه‌ای سرویس‌ها. گزارش‌های زمان‌دار پایین صفحه شاهد اجرای واقعی‌اند. باز کردن Hermes دسکتاپ، اجرای پس‌زمینه را به گفت‌وگوی باز آن تبدیل نمی‌کند.</p>
    <div className="grid gap-4 md:grid-cols-2">{roles.map(role => <article key={role.name} className="card space-y-2 p-4">
      <h3 className="font-bold">{role.name}</h3><p className="text-sm"><bdi>{role.method}</bdi></p>
      <p className="text-sm leading-7">محل اجرا: {role.where}</p><p className="text-sm leading-7">خروجی: {role.output}</p>
      <p className="text-sm leading-7" style={{color:'var(--text-2)'}}>{role.limit}</p>
    </article>)}</div>
    <details className="card p-4 text-sm leading-8"><summary className="cursor-pointer font-bold">مصرف، آموزش و ریسک‌ها</summary>
      <p>پژوهش عمیق در هر ساعت حداکثر یک تلاش و در هر بازهٔ شبانه‌روزی حداکثر {toPersianDigits(RESEARCH_POLICY.maxAttemptsRollingDay)} تلاش دارد. ورودی ثابت در ساعت بعد هم بازبینی می‌شود؛ این به معنی رسیدن دادهٔ تازه نیست.</p>
      <p>تلاش مدل: زیاد؛ حداکثر {toPersianDigits(RESEARCH_POLICY.maxTurns)} نوبت و مهلت اجرا {toPersianDigits(RESEARCH_POLICY.runSeconds)} ثانیه. این‌ها سقف تعداد و زمان‌اند، نه سقف قطعی توکن. مصرف دقیق توکن و ظرفیت باقی‌ماندهٔ اشتراک در این پنل اندازه‌گیری نشده است.</p>
      <p>آموزش فعلی یعنی دستور نسخه‌دار، نمونه‌های واقعیِ بازبینی‌شده و آزمون کیفیت؛ یادگیری خودکار یا تغییر خودکار دستورها فعال نیست. درست بودن ساختار پاسخ، صحت تحلیل را تضمین نمی‌کند.</p>
      <p>فقط باندهای کیفی و شناسهٔ شاهد به مدل می‌روند. ابزار اجرایی مدل بسته است. مدل اجازهٔ انتشار، معامله، تغییر حساب یا اصلاح دیتابیس ندارد. گزارشِ بی‌پشتوانه یا نامعتبر پذیرفته نمی‌شود؛ پژوهش معتبر هم نیازمند بازبینی انسان است.</p>
      <p>اجرای پژوهش به روشن بودن رایانه، نشست ویندوز و اینترنت وابسته است. قطع کامل سرور یا دیتابیس به پایش بیرونی مستقل نیاز دارد؛ پایش داخلی به‌تنهایی آن را پوشش نمی‌دهد.</p>
    </details>
  </section>;
}
