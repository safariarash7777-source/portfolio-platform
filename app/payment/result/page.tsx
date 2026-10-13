import Link from "next/link";
import { CheckCircle2, XCircle, Info } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { toPersianDigits } from "@/lib/format";

export const metadata = {
  title: "نتیجهٔ پرداخت",
  robots: { index: false, follow: false },
};

export default async function PaymentResultPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; ref?: string; authority?: string }>;
}) {
  const { status, ref, authority } = await searchParams;
  const success = status === "success";
  const unknown = status !== "success" && status !== "failed";
  const color = success ? "var(--success)" : unknown ? "var(--info)" : "var(--danger)";
  const recheck = authority ? `/api/payment/callback?${new URLSearchParams({ Authority: authority, Status: "OK" })}` : null;

  return (
    <>
      <Navbar />
      <main
        style={{ background: "var(--bg)", minHeight: "calc(100vh - 72px)" }}
        className="flex items-center justify-center px-5 py-16"
      >
        <div
          className="card-elevated p-8 md:p-12 text-center max-w-md w-full"
          style={{ borderTop: `4px solid ${color}` }}
        >
          <div
            className="mx-auto mb-6 flex items-center justify-center rounded-2xl"
            style={{
              width: 72,
              height: 72,
              background: `color-mix(in srgb, ${color} 10%, transparent)`,
              color,
            }}
          >
            {success ? <CheckCircle2 size={36} /> : unknown ? <Info size={36} /> : <XCircle size={36} />}
          </div>

          <h1
            className="font-display text-2xl font-bold mb-3"
            style={{ color: "var(--navy-deep)" }}
          >
            {success ? "پرداخت موفق بود" : unknown ? "نتیجهٔ پرداخت هنوز مشخص نیست" : "پرداخت ناموفق"}
          </h1>

          <p role="status" className="text-sm leading-8 mb-6" style={{ color: "var(--text-2)" }}>
            {success
              ? "دسترسی شما به دورهٔ وبینار و کانال اختصاصی فعال شد. اگر حساب تلگرام‌تان متصل باشد، لینک دعوت در پیام خصوصی برایتان ارسال شده است؛ در غیر این صورت از داشبورد می‌توانید حساب تلگرام را متصل کنید و لینک دعوت را ببینید."
              : unknown
              ? "نتیجهٔ این پرداخت قابل تأیید نبود. این وضعیت به معنی لغو پرداخت یا بازگشت وجه نیست. پیش از پرداخت جدید، همین درخواست را دوباره بررسی کنید یا با پشتیبانی پیگیری کنید."
              : "درگاه، این پرداخت را ناموفق اعلام کرده است. در صورت کسر وجه، برای بررسی همان پرداخت با پشتیبانی پیگیری کنید."}
          </p>

          {success && ref && (
            <div
              className="rounded-xl px-4 py-3 mb-6 text-sm"
              style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}
            >
              <span style={{ color: "var(--text-3)" }}>کد رهگیری: </span>
              <span dir="ltr" className="font-bold" style={{ color: "var(--navy-deep)" }}>
                {toPersianDigits(ref)}
              </span>
            </div>
          )}

          {unknown && authority && (
            <p className="text-xs break-all mb-4" style={{ color: "var(--text-3)" }}>
              شماره درخواست: <span dir="ltr">{authority}</span>
            </p>
          )}
          {unknown && recheck && (
            <a href={recheck} className="btn w-full mb-3" style={{ color: "var(--info)" }}>
              بررسی دوبارهٔ همین پرداخت
            </a>
          )}
          <Link href="/dashboard" className="btn btn-gold w-full">
            بازگشت به داشبورد
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
