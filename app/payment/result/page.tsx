import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
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
  searchParams: Promise<{ status?: string; ref?: string }>;
}) {
  const { status, ref } = await searchParams;
  const success = status === "success";

  return (
    <>
      <Navbar />
      <main
        style={{ background: "var(--bg)", minHeight: "calc(100vh - 72px)" }}
        className="flex items-center justify-center px-5 py-16"
      >
        <div
          className="card-elevated p-8 md:p-12 text-center max-w-md w-full"
          style={{ borderTop: `4px solid ${success ? "var(--success)" : "var(--danger)"}` }}
        >
          <div
            className="mx-auto mb-6 flex items-center justify-center rounded-2xl"
            style={{
              width: 72,
              height: 72,
              background: success ? "rgba(21,128,61,0.1)" : "rgba(185,28,28,0.08)",
              color: success ? "var(--success)" : "var(--danger)",
            }}
          >
            {success ? <CheckCircle2 size={36} /> : <XCircle size={36} />}
          </div>

          <h1
            className="font-display text-2xl font-bold mb-3"
            style={{ color: "var(--navy-deep)" }}
          >
            {success ? "پرداخت موفق بود" : "پرداخت ناموفق"}
          </h1>

          <p className="text-sm leading-8 mb-6" style={{ color: "var(--text-2)" }}>
            {success
              ? "دسترسی شما به دورهٔ وبینار و کانال اختصاصی فعال شد. اگر حساب تلگرام‌تان متصل باشد، لینک دعوت در پیام خصوصی برایتان ارسال شده است؛ در غیر این صورت از داشبورد می‌توانید حساب تلگرام را متصل کنید و لینک دعوت را ببینید."
              : "پرداخت شما تکمیل نشد یا لغو شد. در صورت کسر وجه، مبلغ طبق قوانین بانکی طی چند روز کاری بازمی‌گردد. می‌توانید دوباره تلاش کنید."}
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

          <Link href="/dashboard" className="btn btn-gold w-full">
            بازگشت به داشبورد
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
