import Link from "next/link";
import { CheckCircle2, XCircle, Info } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { formatJalali, formatToman, toPersianDigits } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { readFinancialReceipt, type FinancialReceipt } from "@/lib/payments/webinar-binding";

export const metadata = {
  title: "نتیجهٔ پرداخت",
  robots: { index: false, follow: false },
};

export default async function PaymentResultPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; ref?: string; authority?: string }>;
}) {
  const { authority } = await searchParams;
  let financial: FinancialReceipt | null = null;
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (!error && user && typeof authority === "string") financial = await readFinancialReceipt(supabase, authority, user.id);
  } catch { /* Query flags, a role or an unavailable session never establish a receipt. */ }
  const success = financial?.status === "paid";
  const unknown = !success && financial?.status !== "failed";
  const ref = success ? financial?.refId : null;
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
              ? "پرداخت این درخواست در سوابق مالی شما ثبت شده است. این رسید، فعال‌شدن خدمت یا دسترسی به کانال را تأیید نمی‌کند؛ وضعیت خدمت را از حساب خود پیگیری کنید."
              : unknown
              ? "نتیجهٔ این پرداخت قابل تأیید نبود. این وضعیت به معنی لغو پرداخت یا بازگشت وجه نیست. پیش از پرداخت جدید، همین درخواست را دوباره بررسی کنید یا با پشتیبانی پیگیری کنید."
              : "این درخواست در سوابق مالی شما ناموفق ثبت شده است. در صورت کسر وجه، برای بررسی همان پرداخت با پشتیبانی پیگیری کنید."}
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
          {financial && (
            <p className="text-xs leading-7 mb-4" style={{ color: "var(--text-3)" }}>
              مبلغ ثبت‌شده: {formatToman(financial.amountToman)}
              <br />
              زمان ثبت: <time dateTime={financial.verifiedAt ?? financial.createdAt}>{formatJalali(financial.verifiedAt ?? financial.createdAt)}</time>
            </p>
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
