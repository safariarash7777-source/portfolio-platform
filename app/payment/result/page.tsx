import Link from "next/link";
import { CheckCircle2, XCircle, Clock } from "lucide-react";
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
  searchParams: Promise<{ status?: string; ref?: string; access?: string }>;
}) {
  const { status, ref, access } = await searchParams;
  const success = status === "success" || status === "pending";
  // پرداخت موفق ولی اعطای دسترسی ناموفق. مشتری **نباید** پیامِ «دسترسی فعال شد»
  // ببیند و بعد در بن‌بست بماند؛ حالتِ سومِ صریح لازم است.
  const accessPending = access === "pending" || status === "pending";

  return (
    <>
      <Navbar />
      <main
        style={{ background: "var(--bg)", minHeight: "calc(100vh - 72px)" }}
        className="flex items-center justify-center px-5 py-16"
      >
        <div
          className="card-elevated p-8 md:p-12 text-center max-w-md w-full"
          style={{
            borderTop: `4px solid ${
              accessPending ? "var(--gold)" : success ? "var(--success)" : "var(--danger)"
            }`,
          }}
        >
          <div
            className="mx-auto mb-6 flex items-center justify-center rounded-2xl"
            style={{
              width: 72,
              height: 72,
              background: accessPending
                ? "var(--gold-tint)"
                : success
                  ? "rgba(21,128,61,0.1)"
                  : "rgba(185,28,28,0.08)",
              color: accessPending ? "var(--gold)" : success ? "var(--success)" : "var(--danger)",
            }}
          >
            {accessPending ? <Clock size={36} /> : success ? <CheckCircle2 size={36} /> : <XCircle size={36} />}
          </div>

          <h1
            className="font-display text-2xl font-bold mb-3"
            style={{ color: "var(--navy-deep)" }}
          >
            {accessPending
              ? "پرداخت موفق بود — دسترسی در حالِ فعال‌سازی"
              : success
                ? "پرداخت موفق بود"
                : "پرداخت ناموفق"}
          </h1>

          <p className="text-sm leading-8 mb-6" style={{ color: "var(--text-2)" }}>
            {!success
              ? "پرداخت شما تکمیل نشد یا لغو شد. در صورت کسر وجه، مبلغ طبق قوانین بانکی طی چند روز کاری بازمی‌گردد. می‌توانید دوباره تلاش کنید."
              : accessPending
                ? "پرداخت شما دریافت و تأیید شد، ولی فعال‌سازیِ دسترسی کامل نشد. این مورد ثبت شده است؛ لطفاً همین کد رهگیری را برای پشتیبانی بفرستید تا دسترسی‌تان فعال شود. پرداخت شما از بین نمی‌رود."
                : "دسترسی شما به دورهٔ وبینار و کانال اختصاصی فعال شد. اگر حساب تلگرام‌تان متصل باشد، لینک دعوت در پیام خصوصی برایتان ارسال شده است؛ در غیر این صورت از داشبورد می‌توانید حساب تلگرام را متصل کنید و لینک دعوت را ببینید."}
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
