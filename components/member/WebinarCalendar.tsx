import { formatJalali, formatTehranClock } from "@/lib/format";
import { webinarPhase, type Webinar } from "@/lib/member/home";
import { webinarCalendar } from "@/lib/member/start";
import type { MemberRequest } from "@/lib/member/http";
import AuthorizedLink from "./AuthorizedLink";

const dateText = (value: string) => `${formatJalali(value)}، ${formatTehranClock(value)}`;
export default function WebinarCalendar({ webinars, now, cohortId, allowed, request }: { webinars: Webinar[]; now: string; cohortId: string; allowed: boolean; request?: MemberRequest }) {
  const calendar = webinarCalendar(webinars, now);
  return <div className="space-y-5">
    <p className="text-sm">همهٔ زمان‌ها به وقت تهران‌اند. برنامهٔ جلسه به معنی بازبودن ورود یا تضمین وجود ضبط نیست.</p>
    {webinars.length === 0 ? <p>هنوز وبیناری برای این دوره منتشر نشده است.</p> : null}
    {webinars.length > 0 ? <section className="space-y-3" aria-labelledby="member-upcoming-title"><h3 id="member-upcoming-title" className="font-bold">در حال برگزاری و پیش رو</h3>
      {calendar.upcoming.length === 0 ? <p>در برنامهٔ دریافت‌شده، جلسهٔ پیش رویی ثبت نشده است.</p> : null}
      <ol className="space-y-4">{calendar.upcoming.map(w => <li key={w.id} className="space-y-2 rounded-lg border p-4"><h4 className="font-bold break-words">{w.title}</h4><p><time dateTime={w.starts_at}>{dateText(w.starts_at)}</time>{w.ends_at ? <> تا <time dateTime={w.ends_at}>{dateText(w.ends_at)}</time></> : "؛ زمان پایان اعلام نشده"}</p><p>{webinarPhase(w, now) === "before" ? "هنوز آغاز نشده" : "در بازهٔ برنامه‌ریزی‌شدهٔ برگزاری؛ وضعیت ورود از سرویس بررسی می‌شود"}</p>{allowed ? <AuthorizedLink cohortId={cohortId} path={`/api/cohorts/${cohortId}/webinars/${w.id}/join`} label="بررسی دسترسی و دریافت راه ورود" request={request} /> : null}</li>)}</ol>
    </section> : null}
    {calendar.ended.length > 0 ? <details className="space-y-3"><summary className="min-h-12 cursor-pointer py-3 font-bold">جلسه‌های پایان‌یافته ({calendar.ended.length.toLocaleString("fa-IR")})</summary><ul className="space-y-3">{calendar.ended.map(w => <li key={w.id} className="space-y-2 border-t pt-3"><h4 className="font-bold break-words">{w.title}</h4><p><time dateTime={w.starts_at}>{dateText(w.starts_at)}</time></p><a href="#member-resources" className="inline-flex min-h-12 items-center underline">بررسی منابع و آرشیو منتشرشدهٔ همین دوره</a></li>)}</ul><p className="text-sm">پایان جلسه به‌تنهایی به معنی انتشار ضبط آن نیست.</p></details> : null}
    {calendar.unknown.length > 0 ? <p role="alert">زمان بعضی جلسه‌ها قابل بررسی نیست؛ برنامه را دوباره دریافت کنید.</p> : null}
  </div>;
}
