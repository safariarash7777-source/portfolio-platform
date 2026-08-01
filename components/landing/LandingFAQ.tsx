"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

const ITEMS = [
  {
    q: "آیا تحلیل‌های این پلتفرم تضمینی برای کسب سود دارد؟",
    a: "خیر. هیچ پلتفرمی در دنیا نمی‌تواند سود سرمایه‌گذاری را تضمین کند. این پلتفرم ابزاری برای تصمیم‌گیری علمی و کاهش ریسک‌های شناختی است، اما مسئولیت نهایی تصمیم با خود سرمایه‌گذار است.",
  },
  {
    q: "داده‌های شخصی من چگونه محافظت می‌شود؟",
    a: "داده‌های شما روی زیرساخت ابری نگهداری می‌شود و اطلاعات شما به شخص ثالث فروخته نمی‌شود. برای جزئیات حریم خصوصی و نحوهٔ درخواست حذف داده‌ها، با پشتیبانی تماس بگیرید.",
  },
  {
    q: "این پلتفرم برای چه نوع سرمایه‌گذارانی مناسب است؟",
    a: "از سرمایه‌گذار مبتدی که تازه وارد بازار شده تا حرفه‌ای‌هایی که سال‌ها سابقه دارند. این سامانهٔ پشتیبان تصمیم بر اساس پروفایل ریسک هر فرد، تحلیل‌ها و چارچوب تحلیلی متناسب با سطح دانش و افق زمانی او را در اختیارش می‌گذارد؛ تصمیم نهایی همیشه با خود سرمایه‌گذار است.",
  },
  {
    q: "آیا روش‌شناسی تحلیل‌ها شفاف است؟",
    a: "بله. تحلیل‌های ساختاریافته و تأییدشدهٔ این پلتفرم، با ذکر فروض و داده‌های پشتوانهٔ آن منتشر می‌شوند؛ ارزش‌گذاری‌ها به‌صورت بازه و با سناریوهای مشخص ارائه می‌شوند، نه عدد قطعی. این تحلیل‌ها در «کارنامه» با مهر زمانی ثبت می‌شوند و نتیجهٔ‌شان قابل پیگیری است.",
  },
  {
    q: "چطور می‌توانم شروع کنم؟",
    a: "ابتدا ثبت‌نام کنید و آزمون پروفایل ریسک ۲۲سؤالی را تکمیل کنید؛ نتیجهٔ پروفایل و نمونهٔ ساختار دارایی متناسب با آن را همان‌جا می‌بینید. طراحی سبد اختصاصی، در جلسهٔ مشاوره با آرش صفری و بر اساس شرایط واقعی شما انجام می‌شود.",
  },
];

export default function LandingFAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section
      id="faq"
      className="section border-y"
      style={{ background: "var(--surface)", borderColor: "var(--line)" }}
    >
      <div className="mx-auto w-full max-w-3xl px-5">
        <div className="flex flex-col items-center text-center gap-3 mb-12">
          <span className="eyebrow">سؤالات متداول</span>
          <h2
            className="font-display"
            style={{
              color: "var(--navy-deep)",
              fontSize: "clamp(1.6rem, 3.2vw, 2.4rem)",
              fontWeight: 800,
              lineHeight: 1.25,
            }}
          >
            پرسش‌هایی که زیاد پرسیده می‌شود
          </h2>
          <div className="divider-gold" />
        </div>

        <div className="flex flex-col gap-3">
          {ITEMS.map((it, i) => {
            const isOpen = open === i;
            return (
              <div
                key={it.q}
                className="card overflow-hidden transition-colors"
                style={{ borderColor: isOpen ? "var(--navy)" : "var(--line)" }}
              >
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="w-full flex items-center justify-between gap-4 p-5 text-right"
                  aria-expanded={isOpen}
                >
                  <span
                    className="font-display font-bold text-base"
                    style={{ color: "var(--navy-deep)" }}
                  >
                    {it.q}
                  </span>
                  <ChevronDown
                    size={18}
                    style={{
                      color: "var(--navy)",
                      transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                      transition: "transform 0.2s ease",
                      flexShrink: 0,
                    }}
                  />
                </button>
                {isOpen && (
                  <div
                    className="px-5 pb-5 text-sm leading-7"
                    style={{
                      color: "var(--text-2)",
                      borderTop: "1px solid var(--line)",
                      paddingTop: "1rem",
                    }}
                  >
                    {it.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
