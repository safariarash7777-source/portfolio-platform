import Link from "next/link";
export default function CustomerJourney() {
  return <section className="card p-5 space-y-3 my-5" aria-label="مسیر اطلاعات و دارایی شخصی">
    <h2 className="font-bold">از اطلاعات بازار تا پروندهٔ شخصی</h2>
    <p className="text-sm leading-7">پیش از استفاده از عدد، منبع، تاریخ و واحد آن را بررسی کنید. «—» یعنی داده در دسترس نیست. قیمت ثبت‌شدهٔ یک روز، قیمت لحظه‌ای فرض نمی‌شود.</p>
    <nav className="flex flex-wrap gap-3" aria-label="ادامهٔ مسیر مشتری">
      <Link href="/dashboard/holdings" className="btn btn-outline min-h-11">دارایی‌های من</Link>
      <Link href="/dashboard/consultation" className="btn btn-outline min-h-11">خلاصهٔ مشاوره و اقدام بعدی</Link>
      <Link href="/learn/glossary" className="btn btn-outline min-h-11">معنی اصطلاحات</Link>
    </nav>
    <p className="text-xs leading-7">ثبت مقدار دارایی با سبد هدف تفاوت دارد: مقدار، موجودی ثبت‌شدهٔ شماست؛ هدف، ترکیب مورد بررسی با مشاور است. نبود هدف، ثبت و مشاهدهٔ دارایی را متوقف نمی‌کند.</p>
  </section>;
}
