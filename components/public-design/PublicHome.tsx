import Link from "next/link";
import {
  ArrowUpLeft,
  BookOpen,
  Layers,
  LineChart,
  ShieldCheck,
} from "lucide-react";
import s from "./PublicDesign.module.css";

export default function PublicHome() {
  return (
    <>
      <section className={s.homeHero} aria-labelledby="public-home-title">
        <div className={s.heroCopy}>
          <p className={s.eyebrow}>آرش صفری · تحلیل و راهبری سرمایه‌گذاری</p>
          <h1 id="public-home-title">
            دید روشن‌تر،
            <br />
            تصمیم سنجیده‌تر.
          </h1>
          <p>بازار، پژوهش و سبد را در یک مسیر مستند دنبال کنید.</p>
          <div className={s.actions}>
            <Link href="/market" className={s.primary}>
              ورود به نمای بازار <ArrowUpLeft size={18} aria-hidden />
            </Link>
            <Link href="/dashboard">میز شخصی من</Link>
          </div>
        </div>
        <section
          className={`${s.panel} ${s.journey}`}
          aria-labelledby="home-journey-title"
        >
          <header>
            <ShieldCheck size={22} aria-hidden />
            <h2 id="home-journey-title">امروز را از کجا شروع کنیم؟</h2>
          </header>
          <ol>
            <li>
              <strong>مشاهدهٔ بازار</strong>
              <p>روندها، تاریخ و کیفیت منابع</p>
            </li>
            <li>
              <strong>بررسی شواهد</strong>
              <p>دوره، واحد و مفروضات مشترک</p>
            </li>
            <li>
              <strong>مرور سبد</strong>
              <p>افق زمانی و شرایط شخصی</p>
            </li>
          </ol>
        </section>
      </section>
      <div className={s.routeCards}>
        {[
          {
            title: "بازار",
            href: "/market",
            Icon: LineChart,
            text: "مشاهدهٔ شاخص‌ها، سهام و صندوق‌ها با منبع و زمان داده",
          },
          {
            title: "پژوهش",
            href: "/analyses",
            Icon: BookOpen,
            text: "مرور تحلیل‌های منتشرشده و شواهد آن‌ها",
          },
          {
            title: "یادگیری",
            href: "/learn",
            Icon: Layers,
            text: "خواندن مفاهیم بازار، ریسک و سبد در مسیر یادگیری",
          },
        ].map(({ title, href, Icon, text }) => (
          <article className={s.panel} key={href}>
            <header>
              <Icon size={22} aria-hidden />
              <h2>{title}</h2>
            </header>
            <p>{text}</p>
            <Link href={href}>
              مشاهده <ArrowUpLeft size={16} aria-hidden />
            </Link>
          </article>
        ))}
      </div>
    </>
  );
}
