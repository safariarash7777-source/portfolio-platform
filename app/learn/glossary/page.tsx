// /learn/glossary — واژه‌نامهٔ کامل (WP-G) از lib/glossary.ts
import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import GlossarySearch from "@/components/learn/GlossarySearch";

export const metadata: Metadata = {
  title: "واژه‌نامهٔ بازار سرمایه | قطب‌نمای بازار",
  description:
    "اصطلاحات بازار سرمایهٔ ایران به زبان ساده: قیمت پایانی، حجم مبنا، NAV، حباب صندوق، P/E و بیشتر.",
};

export default function GlossaryPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <Navbar />
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <p className="text-[11px] font-bold" style={{ color: "var(--text-3)" }}>
          ناحیهٔ یادگیری ·{" "}
          <Link href="/learn" className="hover:underline">
            بازگشت به هاب یادگیری
          </Link>
        </p>
        <h1 className="font-display mt-1 text-2xl font-extrabold" style={{ color: "var(--navy-deep)" }}>
          واژه‌نامهٔ اصطلاحات بازار
        </h1>
        <p className="mt-2 text-[13px] leading-7" style={{ color: "var(--text-2)" }}>
          توضیح ساده و مفهومی هر اصطلاح — محتوای آموزشی است و توصیهٔ خرید یا فروش هیچ نمادی نیست.
        </p>
        <div className="mt-6">
          <GlossarySearch full />
        </div>
      </main>
      <Footer />
    </div>
  );
}
