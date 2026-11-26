import React from "react";
import { ArrowDownLeft, CalendarDays, ClipboardList, FileText } from "lucide-react";
import type { ConsultationRead } from "@/lib/consultation/contracts";
import { formatJalali, toPersianDigits } from "@/lib/format";
import { latestVersions, nextMemberAction, sameBasis, visiblePublication } from "./overview";

const stateLabel = { draft: "پیش‌نویس", submitted: "در انتظار تأیید", approved: "در انتظار انتشار", published: "منتشرشده", withdrawn: "پس‌گرفته‌شده" };
export default function CaseOverview({ data, today, openSession }: { data: ConsultationRead; today: string; openSession: (id: string) => void }) {
  const { selected, dossier, actor } = data;
  if (!selected || !dossier) return null;
  const advisor = selected.advisorId === actor.id;
  const publication = visiblePublication(data);
  const priority = { submitted: actor.isOwner ? 0 : 3, approved: 1, draft: 2, published: 4, withdrawn: 5 };
  const candidate = advisor ? latestVersions(data.sessions).filter(s => s.state !== "withdrawn")
    .sort((a, b) => priority[a.state] - priority[b.state] || Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] ?? null : publication;
  const outdated = candidate && (!sameBasis(candidate.body.basis, dossier.basis) || candidate.body.reviewOn < today);
  const action = !advisor && publication && !selected.revoked && !outdated ? nextMemberAction(publication, data) : null;
  const nextText = selected.revoked ? "فقط مشاهدهٔ سابقه" : !candidate
    ? "مرور پروندهٔ مالی"
    : outdated ? "بازبینی جمع‌بندی" : advisor ? { draft: "تکمیل پیش‌نویس", submitted: actor.isOwner ? "بررسی و تأیید نسخه" : "منتظر تأیید آرش", approved: "بررسی نهایی و انتشار", published: "مرور بازخورد عضو", withdrawn: "مشاهدهٔ سابقه" }[candidate.state]
    : action?.title ?? "در این نسخه اقدام باز برای شما ثبت نشده";
  const nextHint = selected.revoked ? "دسترسی مشاور لغو شده؛ ثبت تازه بسته است."
    : !candidate ? advisor ? "نسخه‌های دارایی، جریان نقد و هدف‌ها را بررسی کنید." : "فقط نسخه‌ای که تأیید و منتشر شده باشد اینجا دیده می‌شود."
    : outdated ? "موعد بازبینی گذشته یا مبنای مالی تغییر کرده است. این نسخه مبنای اقدام تازه نیست."
    : action ? `موعد اقدام شما: ${formatJalali(action.dueOn)}` : advisor ? "ثبت، تأیید شخصی و انتشار سه مرحلهٔ جدا هستند." : "متن کامل و سابقهٔ پیگیری را در همان نسخه ببینید.";
  return <section className="consult-overview" aria-label={advisor ? "خلاصهٔ میز مشاور" : "خلاصهٔ پروندهٔ من"}>
    <div className="consult-main">
      <div className="consult-headline"><span><FileText size={17} aria-hidden/>{selected.revoked ? "بایگانی پرونده" : advisor ? "پروندهٔ در دست بررسی" : "جمع‌بندی منتشرشده"}</span><small>{candidate ? stateLabel[candidate.state] : "بدون نسخهٔ فعال"}</small></div>
      <h2>{candidate?.body.topic ?? (advisor ? "نسخهٔ فعالی برای بررسی نیست" : "جمع‌بندی منتشرشدهٔ فعالی در دسترس نیست")}</h2>
      {candidate && <p className="consult-excerpt">{candidate.body.clientSummary}</p>}
      <dl className="consult-facts"><div><dt>پرونده</dt><dd>{selected.clientLabel}</dd></div><div><dt>موعد بازبینی این نسخه</dt><dd>{candidate ? <time dateTime={candidate.body.reviewOn}>{formatJalali(candidate.body.reviewOn)}</time> : "تعیین نشده"}</dd></div></dl>
    </div>
    <div className="consult-next"><span className="consult-label"><i><CalendarDays size={18} aria-hidden/></i>قدم بعدی {advisor ? "مشاور" : "شما"}</span><h2>{nextText}</h2><p>{nextHint}</p>
      {candidate ? <button type="button" className="consult-cta" onClick={() => openSession(candidate.id)}>جزئیات نسخهٔ {toPersianDigits(candidate.version)}<ArrowDownLeft size={16} aria-hidden/></button> : <a href="#consult-finances" onClick={() => { const section = document.getElementById("consult-finances"); if (section instanceof HTMLDetailsElement) section.open = true; }} className="consult-cta">مشاهدهٔ پروندهٔ مالی<ClipboardList size={16} aria-hidden/></a>}
    </div>
  </section>;
}
