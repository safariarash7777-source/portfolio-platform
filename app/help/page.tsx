import Link from 'next/link';
export const metadata = { title: 'راهنمای استفاده از سایت | آرش سفری' };
const topics = [
  { title: 'داده‌های بازار را از کجا ببینم؟', answer: 'نمای کلان، طلا و ارز و قیمت کالاها در میز بازار قرار دارند. تابلوهای سهام، صندوق‌ها و اختیار معامله از همان صفحه قابل دسترسی‌اند.', href:'/market', label:'باز کردن میز بازار' },
  { title: 'دادهٔ قدیمی یا نامشخص یعنی چه؟', answer:'زمان دریافت فید با زمان ثبت قیمت فرق دارد. بازار بسته یا نماد متوقف ممکن است قیمت قدیمی داشته باشد. نبود تاریخ معتبر به معنی نامشخص بودن تازگی است؛ از آن نتیجهٔ مالی نگیرید.', href:'/market', label:'مشاهدهٔ زمان‌های داده' },
  { title: 'تاریخچه و گزارش شرکت‌ها کجاست؟', answer:'برای تاریخچه از بانک داده و برای اطلاعیه‌ها از صفحهٔ کدال استفاده کنید. پوشش هر نماد ممکن است متفاوت باشد؛ نبود گزارش به معنی صفر بودن عملکرد شرکت نیست.', href:'/codal', label:'مشاهدهٔ کدال' },
  { title: 'دربارهٔ حساب، پرداخت یا تصمیم مالی سؤال دارم', answer:'این راهنما به حساب یا پرداخت شما دسترسی ندارد و تصمیم مالی ارائه نمی‌کند. از مسیر تماس، موضوع را برای بررسی انسانی مطرح کنید. در این صفحه درخواست یا پیامی برای مدیر ثبت نشده است؛ رمز، کد ورود و کلید API نفرستید.', href:'/#waitlist', label:'رفتن به مسیر تماس انسانی' },
  { title: 'پاسخ سؤال من در این فهرست نیست', answer:'پاسخ نامطمئن تولید نمی‌کنیم. از مسیر تماس انسانی استفاده کنید؛ ارسال درخواست فقط با تکمیل همان مسیر توسط شما انجام می‌شود.', href:'/#waitlist', label:'تماس انسانی' },
];
export default function HelpPage() {
  return <main className="mx-auto max-w-3xl space-y-5 px-5 py-12" dir="rtl">
    <h1 className="font-display text-2xl font-bold">راهنمای استفاده از سایت</h1>
    <p className="text-sm leading-8">موضوع را انتخاب کنید تا پاسخ تأییدشده نمایش داده شود. این راهنما قواعدمحور است، مدل زبانی ندارد و متن یا اطلاعات حساب شما را جمع‌آوری نمی‌کند.</p>
    {topics.map(topic => <details key={topic.title} className="card p-5"><summary className="cursor-pointer font-bold leading-8">{topic.title}</summary><p className="mt-3 text-sm leading-8">{topic.answer}</p><Link href={topic.href} className="mt-3 inline-block min-h-11 underline underline-offset-4">{topic.label}</Link></details>)}
  </main>;
}
