"use client";

// پنل ادمین کارنامه — انتشار و بستن «تحلیل آرش» + چشم‌انداز هفتگی.
// اصل انسان در حلقه: هیچ چیزی بدون متن/تأیید آرش منتشر نمی‌شود.
// جدول‌ها append-only هستند — بعد از انتشار، ویرایش/حذفی در کار نیست.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Send, CheckCircle2, AlertCircle, Lock, CalendarRange } from "lucide-react";
import { toPersianDigits, formatJalaliShort } from "@/lib/format";

export interface AdminAnalysis {
  id: string;
  seq: number;
  symbol: string;
  direction: "buy" | "sell";
  entry_price: number | null;
  entry_date: string;
  horizon: string | null;
  reasons: { band?: { low: number | null; high: number | null } | null; assumptions?: string[]; text?: string };
  published_at: string;
  record_hash: string;
  closed: boolean;
}

export interface AdminWeekly {
  id: string;
  seq: number;
  week_start: string;
  label: string;
  score: number | null;
  note_md: string | null;
  published_at: string;
  record_hash: string;
  closed: boolean;
}

export interface RegimePrefill {
  ok: boolean;
  label: string | null;
  score: number | null;
  drivers: Array<{ label: string; value: string; effect: string }>;
  assumptions: string[];
}

interface Props {
  analyses: AdminAnalysis[];
  weekly: AdminWeekly[];
  weeklyTableMissing: boolean;
  regime: RegimePrefill;
  nextWeekStart: string; // YYYY-MM-DD شنبهٔ آینده
}

const OUTCOME_OPTIONS = [
  { value: "target", label: "رسیدن به بازهٔ اعلام‌شده" },
  { value: "stop", label: "خروج با حد زیان" },
  { value: "manual_close", label: "بستهٔ دستی" },
  { value: "expired", label: "پایان افق زمانی" },
];

const LABELS = ["سازنده", "خنثی", "فرسایشی"];

function pd(x: number | string | null | undefined): string {
  if (x == null) return "—";
  return toPersianDigits(String(x));
}

export default function AnalysesManager({ analyses, weekly, weeklyTableMissing, regime, nextWeekStart }: Props) {
  const router = useRouter();

  // ── فرم انتشار تحلیل ──
  const [symbol, setSymbol] = useState("");
  const [direction, setDirection] = useState<"buy" | "sell">("buy");
  const [entryPrice, setEntryPrice] = useState("");
  const [horizon, setHorizon] = useState("");
  const [bandLow, setBandLow] = useState("");
  const [bandHigh, setBandHigh] = useState("");
  const [assumptionsText, setAssumptionsText] = useState("");
  const [text, setText] = useState("");
  const [confirmPublish, setConfirmPublish] = useState(false);

  // ── فرم چشم‌انداز هفتگی ──
  const [weekStart, setWeekStart] = useState(nextWeekStart);
  const [wLabel, setWLabel] = useState(regime.label && LABELS.includes(regime.label) ? regime.label : "خنثی");
  const [wScore, setWScore] = useState(regime.score != null ? String(regime.score) : "");
  const [wNote, setWNote] = useState("");
  const [confirmWeekly, setConfirmWeekly] = useState(false);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState("");

  async function post(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await fetch("/api/admin/analyses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "خطا.");
    return json;
  }

  const publishAnalysis = async () => {
    setErr("");
    setMsg(null);
    if (!symbol.trim() || !entryPrice.trim() || !text.trim()) {
      setErr("نماد، قیمت مرجع و متن تحلیل الزامی است.");
      return;
    }
    if (!confirmPublish) {
      setErr("تأیید نهایی را بزنید — بعد از انتشار، ویرایش یا حذف ممکن نیست.");
      return;
    }
    setBusy(true);
    try {
      const json = await post({
        action: "publish",
        symbol: symbol.trim(),
        direction,
        entry_price: Number(entryPrice),
        horizon: horizon.trim(),
        band_low: bandLow.trim() === "" ? null : Number(bandLow),
        band_high: bandHigh.trim() === "" ? null : Number(bandHigh),
        assumptions: assumptionsText
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        text: text.trim(),
      });
      const pub = json.published as { record_hash?: string } | undefined;
      setMsg(`تحلیل منتشر و برای همیشه ثبت شد. هش: ${pub?.record_hash?.slice(0, 16)}…`);
      setSymbol(""); setEntryPrice(""); setHorizon(""); setBandLow(""); setBandHigh("");
      setAssumptionsText(""); setText(""); setConfirmPublish(false);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "خطا در انتشار.");
    } finally {
      setBusy(false);
    }
  };

  const closeAnalysis = async (id: string) => {
    setErr("");
    setMsg(null);
    const exit = window.prompt("قیمت بستن (ریال):");
    if (exit == null || exit.trim() === "") return;
    const kind = window.prompt(
      "نوع نتیجه؟ یکی را بنویسید: target / stop / manual_close / expired",
      "manual_close"
    );
    if (kind == null) return;
    const note = window.prompt("یادداشت بستن (اختیاری):") ?? "";
    setBusy(true);
    try {
      await post({ action: "close", signal_id: id, exit_price: Number(exit), outcome: kind.trim(), note });
      setMsg("نتیجه ثبت شد — این رکورد هم دیگر قابل تغییر نیست.");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "خطا در بستن.");
    } finally {
      setBusy(false);
    }
  };

  const publishWeekly = async () => {
    setErr("");
    setMsg(null);
    if (!confirmWeekly) {
      setErr("تأیید نهایی چشم‌انداز را بزنید — بعد از انتشار قابل تغییر نیست.");
      return;
    }
    setBusy(true);
    try {
      const json = await post({
        action: "publish_weekly",
        week_start: weekStart,
        label: wLabel,
        score: wScore.trim() === "" ? null : Number(wScore),
        note_md: wNote.trim(),
        drivers: regime.drivers,
        assumptions: regime.assumptions,
        engine_snapshot: regime,
      });
      const pub = json.published as { record_hash?: string } | undefined;
      setMsg(`چشم‌انداز هفتگی منتشر شد. هش: ${pub?.record_hash?.slice(0, 16)}…`);
      setWNote(""); setConfirmWeekly(false);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "خطا در انتشار چشم‌انداز.");
    } finally {
      setBusy(false);
    }
  };

  const closeWeekly = async (id: string) => {
    setErr("");
    setMsg(null);
    const lbl = window.prompt("برچسب محقق‌شده؟ سازنده / خنثی / فرسایشی", "خنثی");
    if (lbl == null) return;
    const sc = window.prompt("امتیاز محقق‌شدهٔ موتور (۰–۱۰۰، خالی = ندارد):") ?? "";
    const note = window.prompt("یادداشت (اختیاری):") ?? "";
    setBusy(true);
    try {
      await post({
        action: "close_weekly",
        outlook_id: id,
        realized_label: lbl.trim(),
        realized_score: sc.trim() === "" ? null : Number(sc),
        note,
      });
      setMsg("نتیجهٔ هفته ثبت شد.");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "خطا در بستن هفته.");
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    "w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--navy)]";
  const inputStyle = { borderColor: "var(--line, #e5e0d5)", background: "var(--card, #fff)", color: "var(--ink, #1c2733)" };

  return (
    <div className="space-y-8">
      <header>
        <span className="eyebrow">پنل مدیریت</span>
        <h1 className="font-display text-2xl md:text-3xl font-bold mt-1" style={{ color: "var(--navy-deep)" }}>
          کارنامهٔ قابل راستی‌آزمایی
        </h1>
        <p className="text-sm mt-2 leading-7" style={{ color: "var(--text-2)" }}>
          انتشار «تحلیل آرش» و «چشم‌انداز هفتگی» در کارنامهٔ عمومی <span dir="ltr">/analyses</span>.
          هر رکورد در لحظهٔ انتشار هش زنجیره‌ای می‌گیرد و دیتابیس ویرایش/حذف را بلاک می‌کند —
          پیش از انتشار خوب بازبینی کنید.
        </p>
      </header>

      {msg ? (
        <div className="card p-3 flex items-center gap-2 text-sm" style={{ color: "var(--green, #1a7f4b)" }}>
          <CheckCircle2 size={16} /> {msg}
        </div>
      ) : null}
      {err ? (
        <div className="card p-3 flex items-center gap-2 text-sm" style={{ color: "var(--red, #b3363b)" }}>
          <AlertCircle size={16} /> {err}
        </div>
      ) : null}

      {/* ── انتشار تحلیل جدید ── */}
      <section className="card p-5">
        <h2 className="flex items-center gap-2 text-base font-extrabold" style={{ color: "var(--navy-deep)" }}>
          <ClipboardCheck size={18} /> انتشار تحلیل جدید
        </h2>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-[12px] font-semibold" style={{ color: "var(--text-3)" }}>نماد *</label>
            <input className={inputCls} style={inputStyle} value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="مثلاً فولاد" />
          </div>
          <div>
            <label className="text-[12px] font-semibold" style={{ color: "var(--text-3)" }}>جهت چشم‌انداز *</label>
            <select className={inputCls} style={inputStyle} value={direction} onChange={(e) => setDirection(e.target.value as "buy" | "sell")}>
              <option value="buy">صعودی</option>
              <option value="sell">نزولی</option>
            </select>
          </div>
          <div>
            <label className="text-[12px] font-semibold" style={{ color: "var(--text-3)" }}>قیمت مرجع انتشار (ریال) *</label>
            <input className={inputCls} style={inputStyle} dir="ltr" value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)} placeholder="7100" />
          </div>
          <div>
            <label className="text-[12px] font-semibold" style={{ color: "var(--text-3)" }}>افق زمانی</label>
            <input className={inputCls} style={inputStyle} value={horizon} onChange={(e) => setHorizon(e.target.value)} placeholder="مثلاً ۳ تا ۶ ماه" />
          </div>
          <div>
            <label className="text-[12px] font-semibold" style={{ color: "var(--text-3)" }}>کف بازهٔ ارزش</label>
            <input className={inputCls} style={inputStyle} dir="ltr" value={bandLow} onChange={(e) => setBandLow(e.target.value)} placeholder="6800" />
          </div>
          <div>
            <label className="text-[12px] font-semibold" style={{ color: "var(--text-3)" }}>سقف بازهٔ ارزش</label>
            <input className={inputCls} style={inputStyle} dir="ltr" value={bandHigh} onChange={(e) => setBandHigh(e.target.value)} placeholder="8200" />
          </div>
        </div>
        <div className="mt-3">
          <label className="text-[12px] font-semibold" style={{ color: "var(--text-3)" }}>
            فروض (هر خط یک فرض — مثلاً «دلار ثابت در محدودهٔ فعلی»)
          </label>
          <textarea className={inputCls} style={inputStyle} rows={2} value={assumptionsText} onChange={(e) => setAssumptionsText(e.target.value)} />
        </div>
        <div className="mt-3">
          <label className="text-[12px] font-semibold" style={{ color: "var(--text-3)" }}>متن تحلیل آرش *</label>
          <textarea className={inputCls} style={inputStyle} rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="چرا این نماد؟ درایورها، ریسک‌ها و فروض — بدون وعدهٔ سود." />
        </div>
        <label className="mt-3 flex items-center gap-2 text-[13px]" style={{ color: "var(--text-2)" }}>
          <input type="checkbox" checked={confirmPublish} onChange={(e) => setConfirmPublish(e.target.checked)} />
          <Lock size={14} /> می‌دانم بعد از انتشار، این رکورد برای همیشه ثبت می‌شود و قابل ویرایش/حذف نیست.
        </label>
        <button onClick={publishAnalysis} disabled={busy} className="btn btn-gold mt-4 inline-flex items-center gap-2">
          <Send size={16} /> انتشار در کارنامه
        </button>
      </section>

      {/* ── چشم‌انداز هفتگی ── */}
      <section className="card p-5">
        <h2 className="flex items-center gap-2 text-base font-extrabold" style={{ color: "var(--navy-deep)" }}>
          <CalendarRange size={18} /> چشم‌انداز هفتگی بازار
        </h2>
        {weeklyTableMissing ? (
          <p className="mt-3 text-sm leading-7" style={{ color: "var(--red, #b3363b)" }}>
            جدول چشم‌انداز هفتگی هنوز در دیتابیس ساخته نشده است — یک‌بار{" "}
            <code dir="ltr">sql/phase12_weekly_outlook.sql</code> را در Supabase SQL Editor اجرا کنید.
          </p>
        ) : (
          <>
            <p className="mt-2 text-[13px] leading-7" style={{ color: "var(--text-2)" }}>
              پیش‌فرض از موتور رژیم بازار پر شده ({regime.ok ? `برچسب «${regime.label}» با امتیاز ${pd(regime.score)}` : "دادهٔ کافی نیست"})؛
              شما بازبینی و تأیید می‌کنید — انسان در حلقه.
            </p>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[12px] font-semibold" style={{ color: "var(--text-3)" }}>شروع هفته (شنبه)</label>
                <input className={inputCls} style={inputStyle} dir="ltr" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} placeholder="YYYY-MM-DD" />
              </div>
              <div>
                <label className="text-[12px] font-semibold" style={{ color: "var(--text-3)" }}>برچسب چشم‌انداز</label>
                <select className={inputCls} style={inputStyle} value={wLabel} onChange={(e) => setWLabel(e.target.value)}>
                  {LABELS.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[12px] font-semibold" style={{ color: "var(--text-3)" }}>امتیاز موتور (۰–۱۰۰)</label>
                <input className={inputCls} style={inputStyle} dir="ltr" value={wScore} onChange={(e) => setWScore(e.target.value)} />
              </div>
            </div>
            <div className="mt-3">
              <label className="text-[12px] font-semibold" style={{ color: "var(--text-3)" }}>یادداشت کوتاه آرش (اختیاری)</label>
              <textarea className={inputCls} style={inputStyle} rows={2} value={wNote} onChange={(e) => setWNote(e.target.value)} />
            </div>
            <label className="mt-3 flex items-center gap-2 text-[13px]" style={{ color: "var(--text-2)" }}>
              <input type="checkbox" checked={confirmWeekly} onChange={(e) => setConfirmWeekly(e.target.checked)} />
              <Lock size={14} /> تأیید نهایی — بعد از انتشار قابل تغییر نیست.
            </label>
            <button onClick={publishWeekly} disabled={busy} className="btn btn-gold mt-4 inline-flex items-center gap-2">
              <Send size={16} /> انتشار چشم‌انداز هفته
            </button>
          </>
        )}

        {weekly.length > 0 ? (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-[13px]" style={{ color: "var(--text-2)" }}>
              <thead>
                <tr className="text-right" style={{ color: "var(--text-3)" }}>
                  <th className="px-3 py-2 font-semibold">هفته</th>
                  <th className="px-3 py-2 font-semibold">برچسب</th>
                  <th className="px-3 py-2 font-semibold">امتیاز</th>
                  <th className="px-3 py-2 font-semibold">هش</th>
                  <th className="px-3 py-2 font-semibold">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {weekly.map((w) => (
                  <tr key={w.id} style={{ borderTop: "1px solid var(--line, #e5e0d5)" }}>
                    <td className="px-3 py-2 whitespace-nowrap">{formatJalaliShort(w.week_start)}</td>
                    <td className="px-3 py-2 font-bold">{w.label}</td>
                    <td className="px-3 py-2">{pd(w.score)}</td>
                    <td className="px-3 py-2"><span dir="ltr" className="font-mono text-[11px]">{w.record_hash.slice(0, 10)}…</span></td>
                    <td className="px-3 py-2">
                      {w.closed ? (
                        <span style={{ color: "var(--text-3)" }}>بسته</span>
                      ) : (
                        <button onClick={() => closeWeekly(w.id)} disabled={busy} className="text-[12.5px] font-semibold underline underline-offset-4" style={{ color: "var(--navy)" }}>
                          ثبت نتیجهٔ هفته
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {/* ── فهرست تحلیل‌ها ── */}
      <section className="card p-5">
        <h2 className="text-base font-extrabold" style={{ color: "var(--navy-deep)" }}>
          تحلیل‌های منتشرشده ({pd(analyses.length)})
        </h2>
        {analyses.length === 0 ? (
          <p className="mt-3 text-sm" style={{ color: "var(--text-3)" }}>هنوز تحلیلی منتشر نشده است.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-[13px]" style={{ color: "var(--text-2)" }}>
              <thead>
                <tr className="text-right" style={{ color: "var(--text-3)" }}>
                  <th className="px-3 py-2 font-semibold">نماد</th>
                  <th className="px-3 py-2 font-semibold">جهت</th>
                  <th className="px-3 py-2 font-semibold">قیمت مرجع</th>
                  <th className="px-3 py-2 font-semibold">تاریخ</th>
                  <th className="px-3 py-2 font-semibold">هش</th>
                  <th className="px-3 py-2 font-semibold">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {analyses.map((a) => (
                  <tr key={a.id} style={{ borderTop: "1px solid var(--line, #e5e0d5)" }}>
                    <td className="px-3 py-2 font-bold" style={{ color: "var(--navy-deep)" }}>{a.symbol}</td>
                    <td className="px-3 py-2">{a.direction === "buy" ? "صعودی" : "نزولی"}</td>
                    <td className="px-3 py-2">{pd(a.entry_price)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatJalaliShort(a.entry_date)}</td>
                    <td className="px-3 py-2"><span dir="ltr" className="font-mono text-[11px]">{a.record_hash.slice(0, 10)}…</span></td>
                    <td className="px-3 py-2">
                      {a.closed ? (
                        <span style={{ color: "var(--text-3)" }}>بسته</span>
                      ) : (
                        <button onClick={() => closeAnalysis(a.id)} disabled={busy} className="text-[12.5px] font-semibold underline underline-offset-4" style={{ color: "var(--navy)" }}>
                          بستن با نتیجه
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
