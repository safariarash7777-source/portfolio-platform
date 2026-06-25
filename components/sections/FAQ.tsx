"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import Container from "../ui/Container";
import SectionHeader from "../ui/SectionHeader";

const ITEMS = [
  {
    q: "آیا تحلیل‌های این پلتفرم تضمینی برای کسب سود دارد؟",
    a: "خیر. هیچ پلتفرمی در دنیا نمی‌تواند سود سرمایه‌گذاری را تضمین کند. این پلتفرم ابزاری برای تصمیم‌گیری علمی و کاهش ریسک‌های شناختی است، اما مسئولیت نهایی تصمیم با خود سرمایه‌گذار است.",
  },
  {
    q: "داده‌های شخصی من چگونه محافظت می‌شود؟",
    a: "تمامی داده‌ها روی سرورهای امن با رمزنگاری end-to-end ذخیره می‌شود. هیچ‌گاه اطلاعات شما به شخص ثالث فروخته یا واگذار نمی‌شود. در هر زمان می‌توانید درخواست حذف کامل داده‌های خود را ارسال کنید.",
  },
  {
    q: "این پلتفرم برای چه نوع سرمایه‌گذارانی مناسب است؟",
    a: "از سرمایه‌گذار مبتدی که تازه وارد بازار شده تا حرفه‌ای‌هایی که سال‌ها سابقه دارند. الگوریتم بر اساس پروفایل ریسک هر فرد، توصیه‌های متناسب با سطح دانش و افق زمانی او ارائه می‌دهد.",
  },
  {
    q: "آیا روش‌شناسی تحلیل‌ها شفاف است؟",
    a: "بله. هر توصیه‌ای که از سوی پلتفرم ارائه می‌شود، با ذکر منطق علمی و داده‌های پشتوانه آن همراه است. ما به اصول نظریه مدرن پرتفوی (MPT) و بهینه‌سازی Mean-Variance پایبند هستیم.",
  },
  {
    q: "چطور می‌توانم شروع کنم؟",
    a: "ابتدا ثبت‌نام کنید و آزمون پروفایل ریسک ۲۲سؤالی را تکمیل کنید. سپس بر اساس پروفایل شما، سبدی متناسب با اهداف و افق زمانی‌تان طراحی و در داشبورد کاربری ارائه می‌شود.",
  },
];

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="section">
      <Container>
        <SectionHeader
          eyebrow="۰۳ · سؤالات متداول"
          title="پرسش‌هایی که زیاد از ما پرسیده می‌شود"
        />

        <div className="max-w-3xl mx-auto flex flex-col gap-3">
          {ITEMS.map((it, i) => {
            const isOpen = open === i;
            return (
              <div
                key={it.q}
                className="card overflow-hidden transition-all"
                style={{
                  borderColor: isOpen ? "var(--navy)" : "var(--line)",
                }}
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
      </Container>
    </section>
  );
}
