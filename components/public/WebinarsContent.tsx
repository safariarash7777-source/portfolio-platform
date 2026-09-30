"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { fetchWebinars, type Webinar } from "@/lib/webinars-list";
import type { ReadState } from "@/lib/read-state";
import { formatToman, formatCount } from "@/lib/format";
import { accountEntryHref } from "@/components/account/returnPath";
import PublicNotice from "./PublicNotice";

const tehranDate = new Intl.DateTimeFormat("fa-IR", {
  timeZone: "Asia/Tehran",
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const platformLabels: Record<string, string> = {
  link: "آنلاین",
  skyroom: "اسکای‌روم",
  zoom: "زوم",
  google_meet: "گوگل میت",
};
export default function WebinarsContent() {
  const query = useSearchParams();
  const callback = query.get("status");
  const [state, setState] = useState<ReadState<Webinar[]>>({
    status: "empty",
    data: null,
  });
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [registering, setRegistering] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    setLoading(true);
    void fetchWebinars().then((result) => {
      if (current) {
        setState(result);
        setLoading(false);
      }
    });
    return () => {
      current = false;
    };
  }, [attempt]);
  async function register(webinar: Webinar) {
    if (registering) return;
    setRegistering(webinar.id);
    setMessage(null);
    try {
      const response = await fetch("/api/webinars/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webinar_id: webinar.id }),
      });
      if (response.status === 401) {
        window.location.assign(accountEntryHref("/login", "/webinars"));
        return;
      }
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.registration) {
        setMessage(
          "ثبت‌نام تأیید نشد. وضعیت را در حساب خود بررسی کنید و دوباره تلاش کنید.",
        );
        return;
      }
      if (webinar.price_toman > 0 && data.registration.id) {
        const payment = await fetch("/api/webinars/payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ registration_id: data.registration.id }),
        });
        const result = await payment.json().catch(() => null);
        if (
          !payment.ok ||
          typeof result?.payment_url !== "string" ||
          !result.payment_url.startsWith("https://")
        ) {
          setMessage(
            "انتقال به پرداخت انجام نشد. وضعیت ثبت‌نام را در حساب خود بررسی کنید.",
          );
          return;
        }
        window.location.assign(result.payment_url);
        return;
      }
      setMessage(
        "درخواست ثبت‌نام رویداد دریافت شد. تأیید نهایی و دسترسی را در حساب خود بررسی کنید؛ این پیام عضویت سه‌ماههٔ دوره را تأیید نمی‌کند.",
      );
    } catch {
      setMessage(
        "اتصال برقرار نشد. وضعیت ثبت‌نام را در حساب خود بررسی کنید و دوباره تلاش کنید.",
      );
    } finally {
      setRegistering(null);
    }
  }
  return (
    <>
      {callback ? (
        <div className="public-notice mb-6" role="status">
          <h3>بازگشت از پرداخت</h3>
          <p>
            وضعیت پرداخت و ثبت‌نام باید در حساب بررسی شود. بازگشت به این صفحه،
            تأیید پرداخت یا عضویت دوره نیست.
          </p>
          <Link
            className="public-text-link"
            href={accountEntryHref("/login", "/dashboard")}
          >
            بررسی در حساب کاربری
          </Link>
        </div>
      ) : null}
      <div className="public-section-heading">
        <div>
          <p className="public-eyebrow">برنامهٔ اعلام‌شده</p>
          <h2>وبینارهای منتشرشده</h2>
        </div>
        <p>ثبت‌نام هر رویداد، به تنهایی مجوز دورهٔ سه‌ماهه نیست.</p>
      </div>
      {message ? (
        <p className="public-notice mb-6" role="status">
          {message}
        </p>
      ) : null}
      {loading ? (
        <p className="public-notice" role="status">
          در حال دریافت فهرست وبینارها…
        </p>
      ) : state.status === "error" ? (
        <PublicNotice
          tone="error"
          title="فهرست وبینارها دریافت نشد"
          action={
            <button
              className="btn btn-outline"
              onClick={() => setAttempt((value) => value + 1)}
            >
              تلاش دوباره
            </button>
          }
        >
          <p>خطای دریافت، به معنی نبود رویداد نیست. دوباره تلاش کنید.</p>
        </PublicNotice>
      ) : state.status === "empty" ? (
        <PublicNotice title="وبینار دورهٔ پیش‌رو هنوز اعلام نشده است">
          <p>
            اکنون رویدادی در فهرست منتشرشده وجود ندارد. تاریخ، موضوع، هزینه و
            مسیر ثبت‌نام نوبت بعد در این صفحه اعلام می‌شود.
          </p>
          <p>ثبت‌نام دوره در این مرحله فعال نیست.</p>
        </PublicNotice>
      ) : (
        <div className="public-webinar-list">
          {state.data.map((webinar) => {
            const full =
              webinar.max_capacity !== null &&
              webinar.registered_count !== null &&
              webinar.registered_count >= webinar.max_capacity;
            const canRegister =
              webinar.status === "published" &&
              webinar.registration_open &&
              !full;
            const standing =
              webinar.status === "live"
                ? "در حال برگزاری"
                : webinar.status === "ended"
                  ? "پایان‌یافته"
                  : canRegister
                    ? "ثبت‌نام رویداد باز است"
                    : full
                      ? "ظرفیت تکمیل است"
                      : "ثبت‌نام رویداد بسته است";
            return (
              <article className="public-webinar-card" key={webinar.id}>
                <span className="public-badge">{standing}</span>
                <h3 className="mt-4">{webinar.title}</h3>
                {webinar.description ? (
                  <p>{webinar.description}</p>
                ) : (
                  <p>توضیحات این رویداد هنوز تکمیل نشده است.</p>
                )}
                <dl className="public-webinar-details">
                  <div>
                    <dt>زمان شروع · تهران</dt>
                    <dd>
                      <time dateTime={webinar.starts_at}>
                        {tehranDate.format(new Date(webinar.starts_at))}
                      </time>
                    </dd>
                  </div>
                  <div>
                    <dt>هزینهٔ رویداد</dt>
                    <dd>
                      {webinar.price_toman === 0
                        ? "رایگان"
                        : formatToman(webinar.price_toman)}
                    </dd>
                  </div>
                  <div>
                    <dt>شیوهٔ برگزاری</dt>
                    <dd>{platformLabels[webinar.platform] ?? "آنلاین"}</dd>
                  </div>
                  {webinar.max_capacity !== null ? (
                    <div>
                      <dt>ظرفیت اعلام‌شده</dt>
                      <dd>{formatCount(webinar.max_capacity)} نفر</dd>
                    </div>
                  ) : null}
                </dl>
                <div className="public-actions">
                  {canRegister ? (
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={registering !== null}
                      onClick={() => void register(webinar)}
                    >
                      {registering === webinar.id
                        ? "در حال ثبت درخواست…"
                        : "ثبت‌نام همین رویداد"}
                    </button>
                  ) : (
                    <Link
                      href={accountEntryHref("/login", "/dashboard")}
                      className="btn btn-outline"
                    >
                      بررسی دسترسی در حساب
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
