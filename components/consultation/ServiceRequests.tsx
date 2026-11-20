"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatJalali, toPersianDigits } from "@/lib/format";

type Offer = { id: string; title: string; starts: string; ends: string; remaining: number };
export type UnsentServiceDraft = { actor: string; offer: Offer; subject: string; consent: boolean };
type DraftMemory = { current: UnsentServiceDraft | null };
const sameOffer = (a: Offer, b: Offer) => a.id === b.id && a.starts === b.starts && a.ends === b.ends && a.remaining === b.remaining && b.remaining > 0;

type FileRow = { relation: string; subject: string; title: string; created: string; basisId: string; basisVersion: number; active: boolean; token: string | null };
type Ledger = { actor: string; offers: Offer[]; requests: FileRow[] };

export default function ServiceRequests({ actor, advisor, locked, selected, draftMemory, onSelect }: {
  actor: string; advisor: boolean; locked: boolean; selected?: string; draftMemory?: DraftMemory; onSelect: (id: string) => void;
}) {
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState("");
  const [subject, setSubject] = useState("");
  const [consent, setConsent] = useState(false);
  const [right, setRight] = useState("");
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const key = "consultation.request." + actor;

  useEffect(() => {
    const controller = new AbortController();
    setLedger(null);
    async function load() {
      const result = await createClient().rpc("read_consultation_services", { p_actor: actor }).abortSignal(controller.signal);
      if (controller.signal.aborted) return;
      if (result.error || result.data?.actor !== actor || !Array.isArray(result.data.offers) || !Array.isArray(result.data.requests)) {
        if (result.error?.code === "42501" || result.error?.code === "PGRST301" || (!result.error && result.data?.actor !== actor)) {
          if (draftMemory) draftMemory.current = null;
          setSubject(""); setConsent(false); setRight("");
        }
        setMessage("خواندن خدمات مشاوره ممکن نشد."); return;
      }
      const data: Ledger = result.data;
      const saved = draftMemory?.current;
      if (saved) {
        if (!advisor && saved.actor === actor && data.offers.some(offer => sameOffer(saved.offer, offer))) {
          setRight(saved.offer.id); setSubject(saved.subject); setConsent(saved.consent);
        } else {
          if (draftMemory) draftMemory.current = null;
          setRight(""); setSubject(""); setConsent(false);
        }
      }
      setLedger(data); setMessage(value => value === "خواندن خدمات مشاوره ممکن نشد." ? "" : value);
      try {
        const attempt = JSON.parse(sessionStorage.getItem(key) ?? "null");
        if (attempt && data.requests.some(file => file.token === attempt.token)) {
          sessionStorage.removeItem(key);
          setMessage("درخواست ثبت‌شده در فهرست شما بازخوانی شد.");
        }
      } catch { /* Existing requests remain readable when storage is disabled. */ }
    }
    void load().catch(() => { if (!controller.signal.aborted) setMessage("خواندن خدمات مشاوره ممکن نشد."); });
    return () => controller.abort();
  }, [actor, advisor, draftMemory, key, revision]);

  const eligible = ledger?.offers.filter(item => item.remaining > 0) ?? [];
  const chosen = eligible.some(item => item.id === right) ? right : eligible[0]?.id;
  const remember = (offerId: string | undefined, nextSubject: string, nextConsent: boolean) => {
    if (!draftMemory || locked || sending.current || advisor) return;
    const offer = eligible.find(item => item.id === offerId);
    draftMemory.current = offer && (nextSubject || nextConsent) ? { actor, offer, subject: nextSubject, consent: nextConsent } : null;
  };
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!consent || !subject.trim() || !chosen || sending.current || locked) return;
    sending.current = true; setBusy(true);
    if (draftMemory) draftMemory.current = null; // An attempted write belongs solely to the existing retry/receipt lane.
    try {
      const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(chosen + ":" + subject.trim())))).join("-");
      const stored = sessionStorage.getItem(key);
      const attempt = stored ? JSON.parse(stored) : { fingerprint, token: crypto.randomUUID() };
      if (attempt.fingerprint !== fingerprint) {
        setMessage("نتیجهٔ تلاش قبلی روشن نیست. فهرست را بازخوانی کنید یا همان موضوع و خدمت را دوباره بررسی کنید."); return;
      }
      sessionStorage.setItem(key, JSON.stringify(attempt));
      const { data, error } = await createClient().rpc("open_consultation_service_request", {
        p_actor: actor, p_entitlement: chosen, p_token: attempt.token, p_subject: subject.trim(), p_consent: true,
      });
      if (error || typeof data !== "string") {
        if (!stored && error && ["42501","22023","PT409"].includes(error.code)) {
          sessionStorage.removeItem(key);
          setMessage(error.code === "22023" ? "ابتدا دارایی خود را در پرونده مالی ثبت کنید." : "حق خدمت یا سهمیه برای این درخواست در دسترس نیست.");
        } else setMessage("نتیجهٔ ثبت روشن نیست. فهرست یا همین درخواست را بازخوانی کنید.");
      } else { setSubject(""); setConsent(false); setMessage("درخواست ثبت شد."); }
      setRevision(v => v + 1);
    } catch { setMessage("ذخیره یا دریافت رسید ممکن نشد. فهرست را بازخوانی کنید."); }
    finally { sending.current = false; setBusy(false); }
  }

  return <section className="card arash-request-panel space-y-4 p-4 sm:p-6" aria-label="درخواست‌های خدمت مشاوره">
    <h2 className="font-display text-xl font-bold">{advisor ? "درخواست‌های اعضا" : "درخواست از پرونده مالی"}</h2>
    {message && <p role="status">{message}</p>}
    {!advisor && ledger && (eligible.length ? <form className="arash-request-form" onSubmit={submit}>
      <label>خدمت<select className="input w-full" disabled={busy || locked} value={chosen} onChange={e=>{setRight(e.target.value); remember(e.target.value, subject, consent);}}>
        {eligible.map(o=><option key={o.id} value={o.id}>{o.title} · تا {formatJalali(o.ends)} · {toPersianDigits(o.remaining)} درخواست باقی‌مانده</option>)}</select></label>
      <label>موضوع درخواست<input required maxLength={120} className="input w-full" disabled={busy || locked} value={subject} onChange={e=>{setSubject(e.target.value); remember(chosen, e.target.value, consent);}} /></label>
      <label className="arash-consent"><input required type="checkbox" disabled={busy || locked} checked={consent} onChange={e=>{setConsent(e.target.checked); remember(chosen, subject, e.target.checked);}} /> اجازه می‌دهم آرش صفری برای پاسخ به این درخواست پروندهٔ مالی من را بررسی کند.</label>
      <button className="btn btn-gold" disabled={busy || locked || !consent || !subject.trim()}>ثبت درخواست مشاوره</button>
      {draftMemory?.current && <button type="button" className="btn btn-outline" disabled={busy || locked} onClick={() => {
        if (sending.current || locked || !draftMemory.current) return;
        draftMemory.current = null; setSubject(""); setConsent(false); setRight("");
      }}>کنارگذاشتن درخواست ثبت‌نشده</button>}
    </form> : <p>خدمت مشاوره با سهمیهٔ قابل استفاده در پروندهٔ شما ثبت نشده است.</p>)}
    {ledger?.requests.map(row=><article key={row.relation} className="arash-case-row">
      <div><h3 className="font-bold">{row.subject}</h3><p className="text-sm">{row.title} · {formatJalali(row.created)}</p><p className="text-sm">نسخهٔ مالی هنگام درخواست {toPersianDigits(row.basisVersion)}</p></div><span className="arash-case-status">{row.active ? "فعال" : "پایان دسترسی"}</span>
      {selected !== row.relation && <button type="button" className="btn btn-outline" disabled={busy || locked} onClick={()=>onSelect(row.relation)}>بازکردن پرونده</button>}
    </article>)}
    <button type="button" disabled={busy || locked || Boolean(subject.trim())} className="btn btn-outline" onClick={async () => {
      if (sending.current) return;
      sending.current = true; setBusy(true);
      try {
        const { error } = await createClient().auth.signOut({ scope: "local" });
        if (error) { setMessage("خروج انجام نشد. دوباره تلاش کنید."); return; }
        const path = advisor ? "/admin/consultation" : "/dashboard/consultation";
        window.location.assign("/login?next=" + encodeURIComponent(selected ? path + "?relation=" + selected : path));
      } catch { setMessage("خروج انجام نشد. دوباره تلاش کنید."); }
      finally { sending.current = false; setBusy(false); }
    }}>خروج از حساب</button>
    <button type="button" disabled={busy || locked} className="btn btn-outline" onClick={()=>setRevision(v=>v+1)}>بازخوانی درخواست‌ها</button>
  </section>;
}
