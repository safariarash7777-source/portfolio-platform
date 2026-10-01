"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MODULE_KEYS, type ModuleDecision } from "@/lib/seasonal/contracts";
import { MARKET_MODULES, MARKET_MODULE_DESTINATIONS } from "@/lib/market-module-contract";
import { formatJalali, formatTehranClock } from "@/lib/format";
import { cohortStanding, groupCohorts, isCohort, isDecision, isGrants, isResources, standingLabels, webinarPhase, type CohortDetail, type MemberGrant, type MemberResource, type Result } from "@/lib/member/home";
import { memberData, memberErrorStatus, type MemberRequest } from "@/lib/member/http";
import { memberFixtureRequest } from "@/lib/member/fixture";
import { accountEntryHref } from "@/components/account/returnPath";
import NeedsAssessmentPanel from "./NeedsAssessmentPanel";
import AuthorizedLink from "./AuthorizedLink";
import ProfileStatus from "./ProfileStatus";
import PublicationFeed from "./PublicationFeed";

type SelectedData = { cohortId: string; metadata: Result<CohortDetail>; resources: Result<MemberResource[]>; decisions: Partial<Record<typeof MODULE_KEYS[number], Result<ModuleDecision>>> };
const deniedLabels: Record<string, string> = { expired: "پایان دسترسی", revoked: "دسترسی لغوشده", cohort_cancelled: "دوره لغوشده", scheduled: "دسترسی هنوز شروع نشده", module_not_granted: "این بخش در دسترسی دورهٔ شما نیست", sign_in_required: "ورود دوباره لازم است" };
const dateText = (value: string) => `${formatJalali(value)}، ${formatTehranClock(value)}`;
export default function MemberHome({ userId, selectedCohortId, now, fixtureScenario }: { userId: string; selectedCohortId?: string; now: string; fixtureScenario?: string }) {
  const request: MemberRequest | undefined = useMemo(() => fixtureScenario ? memberFixtureRequest(fixtureScenario) : undefined, [fixtureScenario]);
  const [grants, setGrants] = useState<Result<MemberGrant[]>>({ state: "loading" });
  const [selectedResult, setSelected] = useState<SelectedData | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let current = true; setGrants({ state: "loading" }); setSelected(null);
    memberData("/api/me/cohorts", isGrants, request).then(data => { if (current) setGrants({ state: "ready", data }); }).catch(e => { if (current) setGrants({ state: "error", status: memberErrorStatus(e) }); });
    return () => { current = false; };
  }, [refresh, request]);
  const cohorts = grants.state === "ready" ? groupCohorts(grants.data) : [];
  const cohort = cohorts.find(c => c.id === (selectedCohortId ?? cohorts[0]?.id));
  const cohortId = cohort?.id;
  const selected = selectedResult?.cohortId === cohortId ? selectedResult : null;
  useEffect(() => {
    let current = true; setSelected(null);
    if (!cohortId) return;
    const state = async <T,>(path: string, guard: (v: unknown) => v is T): Promise<Result<T>> => { try { return { state: "ready", data: await memberData(path, guard, request) }; } catch (e) { return { state: "error", status: memberErrorStatus(e) }; } };
    const metadata = state(`/api/cohorts/${cohortId}`, (v): v is CohortDetail => isCohort(v) && v.id === cohortId);
    const resources = state(`/api/cohorts/${cohortId}/resources`, (v): v is MemberResource[] => isResources(v) && v.every(r => r.resourcePath === `/api/cohorts/${cohortId}/resources/${r.resourceRef}`));
    const decisions = Promise.all(MODULE_KEYS.map(async module => [module, await state(`/api/me/module-access?module=${module}&cohort=${cohortId}`, (v): v is ModuleDecision => isDecision(v) && (!v.allowed || v.authorizedByCohortIds.includes(cohortId)))] as const));
    Promise.all([metadata, resources, decisions]).then(([m, r, d]) => { if (current) setSelected({ cohortId, metadata: m, resources: r, decisions: Object.fromEntries(d) }); });
    return () => { current = false; };
  }, [cohortId, refresh, request]);
  function retry() { setRefresh(n => n + 1); }
  const allowed = (module: typeof MODULE_KEYS[number]) => selected?.decisions[module]?.state === "ready" && (selected.decisions[module] as {state:"ready";data:ModuleDecision}).data.allowed;
  const decisions = Object.values(selected?.decisions ?? {}).flatMap(d => d?.state === "ready" ? [d.data] : []);
  const standing = cohort ? cohortStanding(cohort, decisions) : "never";
  const prefix = fixtureScenario ? `/member-home-preview?scenario=${encodeURIComponent(fixtureScenario)}&cohort=` : "/dashboard?cohort=";
  return <div className="space-y-6" dir="rtl">
    {fixtureScenario ? <aside className="card border-2 border-amber-700 p-4" role="status"><strong>نمونهٔ ساختگی برای بازبینی رابط</strong><p>داده، نشست و پاسخ ذخیره در این نما fixture هستند؛ این صفحه شاهد پذیرش Auth، Storage یا انتشار واقعی نیست.</p></aside> : null}
    <section className="card space-y-4 p-5" aria-labelledby="member-courses-title">
      <h2 id="member-courses-title" className="font-display text-xl font-bold">دوره‌های من</h2>
      {grants.state === "loading" ? <p role="status">در حال دریافت دوره‌ها…</p> : null}
      {grants.state === "error" ? <div role="alert"><p>وضعیت دوره‌های شما قابل دریافت نیست؛ خطای سرویس به معنی نداشتن عضویت نیست.</p><button className="btn btn-outline min-h-12" onClick={retry}>دریافت دوبارهٔ دوره‌ها</button>{grants.status === 401 ? <Link className="inline-flex min-h-12 items-center underline" href={accountEntryHref("/login", selectedCohortId ? `/dashboard?cohort=${selectedCohortId}` : "/dashboard")}>ورود و بازگشت به خانهٔ من</Link> : null}</div> : null}
      {grants.state === "ready" && cohorts.length === 0 ? <div><p>عضویت دوره‌ای برای این حساب ثبت نشده است. حساب، دارایی‌ها و سوابق شخصی شما مستقل باقی می‌مانند.</p><Link className="inline-flex min-h-12 items-center underline" href="/webinars">دیدن دوره‌ها و وبینارها</Link></div> : null}
      {cohorts.length > 1 ? <p className="text-sm">بیش از یک دوره دارید؛ انتخاب دوره، برنامه و منابع همان دوره را نشان می‌دهد. دسترسی یک دوره، منابع دورهٔ دیگر را باز نمی‌کند.</p> : null}
      <nav aria-label="انتخاب دوره" className="flex flex-wrap gap-3">{cohorts.map(c => <a key={c.id} aria-current={cohort?.id === c.id ? "page" : undefined} href={prefix + c.id} className={`btn min-h-12 max-w-full break-words ${cohort?.id === c.id ? "btn-primary" : "btn-outline"}`}>{c.title}</a>)}</nav>
      {grants.state === "ready" && selectedCohortId && !cohort ? <p role="alert">دورهٔ انتخاب‌شده در عضویت این حساب نیست. یکی از دوره‌های خودتان را انتخاب کنید.</p> : null}
      {cohort ? <div className="space-y-3"><h3 className="text-lg font-bold break-words">{cohort.title}</h3><p role="status">{standingLabels[standing]}</p><details><summary className="min-h-12 cursor-pointer py-3">زمان دسترسی‌های ثبت‌شدهٔ این دوره</summary><ul className="space-y-2">{cohort.grants.map(g => <li key={String(g.grantRef)}>{standingLabels[g.standing]} · از {dateText(g.startsAt)} تا {dateText(g.endsAtExclusive)}؛ در لحظهٔ پایان، دسترسی آن ثبت تمام می‌شود.</li>)}</ul></details><p className="text-sm">زمان‌ها به وقت تهران‌اند. مجوز هر بخش هنگام بازکردن دوباره بررسی می‌شود؛ پایان دوره اطلاعات مالی و پروندهٔ خصوصی را حذف نمی‌کند.</p></div> : null}
    </section>
    {cohort ? <>
      <section className="card space-y-3 p-5" aria-labelledby="member-next-title"><h2 id="member-next-title" className="font-display text-xl font-bold">اقدام بعدی</h2><p>{standing === "active" ? "برنامهٔ وبینار و منابع دوره را بررسی کنید؛ نیازسنجی را هم می‌توانید کوتاه پاسخ دهید یا بعداً ادامه دهید." : standing === "scheduled" ? "زمان شروع دسترسی را بررسی کنید. در این فاصله می‌توانید نیازسنجی کوتاه را ذخیره کنید." : "دسترسی‌های دوره را بررسی کنید؛ پاسخ نیازسنجی و سوابق شخصی شما همچنان باقی‌اند."}</p><div className="flex flex-wrap gap-3"><a href="#member-webinars" className="btn btn-outline min-h-12">برنامهٔ وبینار</a><a href="#member-needs-title" className="btn btn-outline min-h-12">نیازسنجی کوتاه</a></div></section>
      {!selected ? <p role="status">در حال بررسی برنامه و دسترسی‌های همین دوره…</p> : <>
        <section id="member-webinars" className="card space-y-4 p-5" aria-labelledby="member-webinars-title"><h2 id="member-webinars-title" className="font-display text-xl font-bold">وبینار من</h2>
          {selected.metadata.state === "error" ? <div role="alert"><p>{selected.metadata.status === 404 ? "برنامهٔ منتشرشدهٔ این دوره در دسترس نیست." : "برنامهٔ وبینار قابل دریافت نیست؛ نبود برنامه را از این خطا نتیجه نگیرید."}</p><button className="btn btn-outline min-h-12" onClick={retry}>دریافت دوبارهٔ برنامه</button></div> : null}
          {selected.metadata.state === "ready" && selected.metadata.data.webinars.length === 0 ? <p>هنوز وبیناری برای این دوره منتشر نشده است.</p> : null}
          {selected.metadata.state === "ready" ? selected.metadata.data.webinars.map(w => { const phase = webinarPhase(w, now); return <article key={w.id} className="space-y-2 border-t pt-4"><h3 className="font-bold break-words">{w.title}</h3><p>{dateText(w.starts_at)}{w.ends_at ? ` تا ${dateText(w.ends_at)}` : "؛ زمان پایان اعلام نشده"}</p><p>{phase === "before" ? "هنوز آغاز نشده" : phase === "after" ? "وبینار پایان یافته؛ منابع منتشرشده را پایین ببینید" : phase === "during" ? "در بازهٔ برنامه‌ریزی‌شدهٔ برگزاری؛ وضعیت ورود از سرویس بررسی می‌شود" : "زمان برگزاری نامعلوم"}</p>{allowed("webinar") && phase !== "after" ? <AuthorizedLink key={w.id} cohortId={cohort.id} path={`/api/cohorts/${cohort.id}/webinars/${w.id}/join`} label="بررسی دسترسی و دریافت راه ورود" request={request} /> : null}</article>; }) : null}
          {selected.decisions.webinar?.state === "error" ? <p role="alert">مجوز وبینار قابل بررسی نیست؛ دوباره دوره را دریافت کنید.</p> : selected.decisions.webinar?.state === "ready" && !selected.decisions.webinar.data.allowed ? <p>{deniedLabels[selected.decisions.webinar.data.reason] ?? "ورود به وبینار در دسترسی این حساب تأیید نشده است."}</p> : null}
        </section>
        <section className="card space-y-4 p-5" aria-labelledby="member-resources-title"><h2 id="member-resources-title" className="font-display text-xl font-bold">منابع تازهٔ دوره و ضبط‌های منتشرشده</h2><p className="text-sm">فقط منابع منتشرشده و مجاز همین دوره نمایش داده می‌شوند؛ وجود ضبط، تا انتشار آن تضمین نشده است.</p>
          {selected.resources.state === "error" ? <div role="alert"><p>فهرست منابع قابل دریافت نیست؛ این به معنی نبود محتوا نیست.</p><button className="btn btn-outline min-h-12" onClick={retry}>دریافت دوبارهٔ منابع</button></div> : null}
          {selected.resources.state === "ready" && selected.resources.data.length === 0 ? <p>{allowed("resources") ? "هنوز منبع مجازی برای این دوره منتشر نشده است." : "در این درخواست منبعی در دسترس حساب شما نیست؛ وضعیت دسترسی دوره را بررسی کنید."}</p> : null}
          {selected.resources.state === "ready" ? <ul className="space-y-4">{selected.resources.data.map(r => <li key={r.resourceRef} className="space-y-2 border-t pt-4"><h3 className="font-bold break-words">{r.title}</h3><p className="text-sm">ثبت منبع: {dateText(r.createdAt)}</p><AuthorizedLink cohortId={cohort.id} path={`/api/cohorts/${cohort.id}/resources/${r.resourceRef}`} label={`دریافت لینک ${r.title}`} request={request} /></li>)}</ul> : null}
        </section>
        <section className="card space-y-4 p-5" aria-labelledby="member-modules-title"><h2 id="member-modules-title" className="font-display text-xl font-bold">داشبوردهای دوره</h2><p className="text-sm">منبع، واحد و زمان معتبر هر داده را داخل داشبورد بخوانید. نبود داده یا تحلیل به معنی آرام‌بودن بازار نیست.</p><ul className="grid gap-3 sm:grid-cols-2">{MARKET_MODULES.map(module => { const d = selected.decisions[module]; const title = MARKET_MODULE_DESTINATIONS[module].title; return <li key={module} className="space-y-2 border rounded-lg p-4"><h3 className="font-bold">{title}</h3>{d?.state === "ready" && d.data.allowed ? <><p className="text-sm">{d.data.until ? `دسترسی این بخش تا ${dateText(d.data.until)}` : "زمان پایان از سرویس دریافت نشده است."}</p><Link className="inline-flex min-h-12 items-center underline" href={`/dashboard/market/${module}?cohort=${cohort.id}`}>بازکردن {title}</Link></> : <p>{d?.state === "error" ? "وضعیت دسترسی قابل بررسی نیست" : d?.state === "ready" ? deniedLabels[d.data.reason] ?? "این بخش برای حساب شما فعال نیست" : "در حال بررسی دسترسی…"}</p>}</li>; })}</ul><button className="btn btn-outline min-h-12" onClick={retry}>تازه‌کردن وضعیت دوره</button></section>
      </>}
      <NeedsAssessmentPanel key={cohort.id} cohortId={cohort.id} userId={userId} request={request} preview={!!fixtureScenario} />
      <PublicationFeed key={cohort.id} cohortId={cohort.id} request={request} preview={!!fixtureScenario} />
    </> : null}
    <ProfileStatus cohortId={selectedCohortId} request={request} />
  </div>;
}
