"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchPublicCourses, type PublicCourse } from "./course-catalog";
import type { ReadState } from "@/lib/read-state";
import PublicNotice from "./PublicNotice";
const tehranDate = new Intl.DateTimeFormat("fa-IR", {
  timeZone: "Asia/Tehran",
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
export default function CourseCatalog({
  compact = false,
}: {
  compact?: boolean;
}) {
  const [state, setState] = useState<ReadState<PublicCourse[]>>({
    status: "empty",
    data: null,
  });
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    void fetchPublicCourses().then((result) => {
      if (active) {
        setState(result);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [attempt]);
  return (
    <div
      aria-labelledby={
        compact ? "home-course-catalog-title" : "course-catalog-title"
      }
    >
      <div className="public-section-heading">
        <div>
          <p className="public-eyebrow">دورهٔ پیش‌رو</p>
          <h2
            id={compact ? "home-course-catalog-title" : "course-catalog-title"}
          >
            نوبت‌های اعلام‌شدهٔ مسیر راه
          </h2>
        </div>
        {compact ? (
          <Link href="/webinars" className="btn btn-outline">
            اطلاعات دوره و وبینار
          </Link>
        ) : null}
      </div>
      {loading ? (
        <p className="public-notice" role="status">
          در حال دریافت اطلاعات دوره…
        </p>
      ) : state.status === "error" ? (
        <PublicNotice
          title="اطلاعات دوره دریافت نشد"
          tone="error"
          action={
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setAttempt((value) => value + 1)}
            >
              دریافت دوبارهٔ دوره‌ها
            </button>
          }
        >
          <p>
            وضعیت نوبت بعد اکنون قابل بررسی نیست. تاریخ یا ثبت‌نام فعال فرض
            نمی‌شود.
          </p>
        </PublicNotice>
      ) : state.status === "empty" ? (
        <PublicNotice title="نوبت بعدی هنوز منتشر نشده است">
          <p>
            تاریخ، هزینه، موضوع و شرایط دسترسی دوره پس از تأیید و انتشار در این
            صفحه دیده می‌شود. ثبت‌نام دوره اکنون فعال نیست.
          </p>
        </PublicNotice>
      ) : (
        <div className="public-two-grid">
          {state.data.map((course) => (
            <article className="public-webinar-card" key={course.id}>
              <h3>{course.title}</h3>
              {course.summary ? <p>{course.summary}</p> : null}
              {course.cohorts.length === 0 ? (
                <p>برای این دوره هنوز نوبتی منتشر نشده است.</p>
              ) : (
                course.cohorts.map((cohort) => (
                  <section
                    id={compact ? undefined : `cohort-${cohort.id}`}
                    className="public-cohort"
                    key={cohort.id}
                    aria-label={cohort.title}
                  >
                    <h4>{cohort.title}</h4>
                    <dl className="public-webinar-details">
                      <div>
                        <dt>شروع · تهران</dt>
                        <dd>
                          {cohort.startsAt
                            ? tehranDate.format(new Date(cohort.startsAt))
                            : "اعلام نشده"}
                        </dd>
                      </div>
                      <div>
                        <dt>پایان دسترسی · تهران</dt>
                        <dd>
                          {cohort.endsAtExclusive
                            ? tehranDate.format(
                                new Date(cohort.endsAtExclusive),
                              )
                            : "اعلام نشده"}
                        </dd>
                      </div>
                    </dl>
                    {cohort.endsAtExclusive ? (
                      <p className="public-caption">
                        از زمان پایان درج‌شده، دسترسی این نوبت پایان می‌یابد.
                      </p>
                    ) : null}
                    <p className="public-caption">
                      هزینه، موضوع وبینار و شرایط ضبط و منابع باید جداگانه در
                      جزئیات نوبت اعلام شود.
                    </p>
                    <button
                      className="btn btn-outline"
                      type="button"
                      disabled
                      aria-describedby={`registration-${compact ? "home-" : ""}${cohort.id}`}
                    >
                      ثبت‌نام دوره فعال نیست
                    </button>
                    <p
                      id={`registration-${compact ? "home-" : ""}${cohort.id}`}
                      className="public-caption"
                    >
                      مسیر ثبت‌نام این نوبت هنوز فعال نشده است.
                    </p>
                    {compact ? (
                      <Link
                        className="public-text-link"
                        href={`/webinars#cohort-${encodeURIComponent(cohort.id)}`}
                      >
                        بررسی جزئیات نوبت
                      </Link>
                    ) : null}
                  </section>
                ))
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
