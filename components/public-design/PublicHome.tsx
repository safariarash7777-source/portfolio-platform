import Link from "next/link";
import { ArrowLeft, ArrowUpLeft, BookOpen, Files, Wallet, Layers3, MessagesSquare, Compass } from "lucide-react";

const START = [
  { href: "/codal", title: "گزارش شرکت‌ها", context: "اطلاعیه‌های کدال", Icon: Files },
  { href: "/dashboard/holdings", title: "دارایی و سبد من", context: "ثبت دارایی و بدهی", Icon: Layers3 },
  { href: "/dashboard/cashflow", title: "دفتر مالی من", context: "درآمد، هزینه و بودجه", Icon: Wallet },
  { href: "#waitlist", title: "مشاوره با آرش", context: "فهرست انتظار مشاوره", Icon: MessagesSquare },
] as const;

export default function PublicHome() {
  return (
    <section className="dos dos-home" aria-labelledby="public-home-title">
      <header className="dos-heading">
        <div>
          <div className="dos-kicker"><span />اقتصاد سیاسی و سرمایه‌گذاری</div>
          <h1 id="public-home-title">آرش صفری</h1>
          <p>تحلیلگر و مشاور سرمایه‌گذاری</p>
        </div>
        <Link href="/about" className="dos-link">دربارهٔ من و روش کارم <ArrowUpLeft size={16} aria-hidden /></Link>
      </header>
      <div className="dos-top">
        <div className="dos-main">
          <div className="dos-headline"><span><BookOpen size={17} aria-hidden /> از دفتر آرش</span></div>
          <h2>بازار ایران از نگاه من</h2>
          <p>از اثر سیاست بر قیمت‌ها می‌نویسم و از اینکه این تغییرها برای سبد سرمایه‌گذاری ما چه معنایی دارند.</p>
          <a href="#home-media">خواندن رسانهٔ آرش <ArrowLeft size={17} aria-hidden /></a>
        </div>
        <div className="dos-action">
          <div className="dos-label"><span className="dos-sign"><Compass size={17} aria-hidden /></span> فضای خصوصی عضو</div>
          <h2>پروندهٔ مالی من</h2><p>دارایی‌ها، تعهدها و اقدام بعدی‌تان را یک‌جا ببینید.</p>
          <Link prefetch={false} className="dos-cta" href="/dashboard">ورود به پرونده <ArrowLeft size={16} aria-hidden /></Link>
        </div>
      </div>
      <div className="dos-ledgers">
        <h2>از کجا شروع کنم؟</h2>
        <nav aria-label="از کجا شروع کنم؟">
          {START.map(({href, title, context, Icon}) => <Link key={href} prefetch={false} href={href}>
            <Icon aria-hidden size={19} /><span><b>{title}</b><small>{context}</small></span><ArrowUpLeft size={14} aria-hidden />
          </Link>)}
        </nav>
      </div>
    </section>
  );
}
