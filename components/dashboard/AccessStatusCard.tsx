import Link from "next/link";
import type { AccessInfo } from "@/lib/access";
import { formatJalali } from "@/lib/format";
import ReadError from "./ReadError";

const VIA_LABEL: Record<string, string> = {
  admin: "مدیر سامانه", consulting: "مشتری مشاوره", webinar: "شرکت‌کنندهٔ وبینار", manual: "اعطای ویژه",
};
const INACTIVE = {
  expired: "اعتبار دسترسی تحلیلی پایان یافته است",
  revoked: "دسترسی تحلیلی لغو شده است",
  scheduled: "دسترسی تحلیلی هنوز شروع نشده است",
};

export default function AccessStatusCard({ access }: { access: AccessInfo }) {
  const unknown = access.standing === null;
  const inactive = access.standing && access.standing in INACTIVE
    ? INACTIVE[access.standing as keyof typeof INACTIVE] : null;
  const full = access.level === "full" && access.standing === "active";
  return (
    <section className="card p-5 space-y-4" aria-label="وضعیت دسترسی">
      <div>
        <p className="text-xs" style={{ color: "var(--text-3)" }}>وضعیت دسترسی تحلیلی</p>
        <p className="mt-1 font-display text-lg font-bold" style={{ color: "var(--navy-deep)" }}>
          {unknown ? "وضعیت دسترسی نامشخص است" : inactive ?? (full
            ? `دسترسی کامل${access.via ? ` — ${VIA_LABEL[access.via] ?? access.via}` : ""}`
            : "کاربر ثبت‌نام‌شده")}
        </p>
        {full && access.expiresAt ? <p className="mt-1 text-xs" style={{ color: "var(--text-2)" }}>اعتبار تا {formatJalali(access.expiresAt)}</p> : null}
        {inactive && access.standingSince ? <p className="mt-1 text-xs" style={{ color: "var(--text-2)" }}>زمان ثبت وضعیت: {formatJalali(access.standingSince)}</p> : null}
      </div>
      {unknown ? <ReadError label="وضعیت دسترسی تحلیلی" code="ACCESS_UNKNOWN" /> : null}
      {inactive ? <p className="text-sm leading-7">برای بررسی این وضعیت، جزئیات حساب را با پشتیبانی تطبیق دهید. پروندهٔ مالی پایه از اعتبار ابزارهای تحلیلی مستقل است.</p> : null}
      <div className="flex flex-wrap gap-3">
        <Link href="/dashboard/holdings" className="btn btn-outline">پروندهٔ دارایی و بدهی من</Link>
        {full ? <><Link href="/terminal" className="btn btn-outline">ترمینال تحلیلگر</Link><Link href="/data" className="btn btn-outline">بانک دادهٔ بازار</Link></> : null}
        {!unknown && !inactive && !full ? <Link href="/#features" className="btn btn-outline">آشنایی با خدمات</Link> : null}
      </div>
      <p className="text-sm leading-7" style={{ color: "var(--text-2)" }}>
        حق دریافت خدمت مشاوره هنوز به خرید متصل نشده است. سطح دسترسی تحلیلی، دریافت مشاوره یا رضایت اشتراک پرونده را تأیید نمی‌کند. رابطهٔ مشاور و رضایت دسترسی در پروندهٔ مشاوره جداگانه بررسی می‌شوند.
        {" "}<Link href="/dashboard/consultation" className="underline">بررسی رضایت و پروندهٔ مشاوره</Link>
      </p>
    </section>
  );
}
