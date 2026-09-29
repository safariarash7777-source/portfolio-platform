"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Save, AlertCircle, CheckCircle2, History, Info } from "lucide-react";
import { toPersianDigits, toLatinDigits, formatToman, formatJalali } from "@/lib/format";
import type { AssetClassRow, CoverageGap, HoldingPosition } from "@/lib/portfolio/contracts";

/**
 * یک ردیفِ فرم.
 *
 * ⚠️ `positionKey` جدا از `label` نگه داشته می‌شود و `costBasis` هم حمل
 * می‌شود. نسخهٔ قبل فقط `positionKey` را نگه می‌داشت و هنگامِ ارسال همان را
 * جای `symbol`/`manual_label` می‌نوشت؛ یعنی قلمی که کلیدش با برچسبش فرق
 * داشت، یا بهای تمام‌شده داشت، با یک اصلاحِ سادهٔ مقدار آن اطلاعات را از
 * دست می‌داد. اصلاحِ یک عدد نباید بقیهٔ قلم را پاک کند.
 */
interface Row {
  /** کلیدِ پایدارِ قلم — با تغییرِ برچسب هم عوض نمی‌شود. */
  positionKey: string;
  /** نماد یا برچسبِ دستی، هرکدام که هست. */
  label: string;
  kind: "symbol" | "manual";
  assetClass: string;
  qty: string;
  unit: string;
  /** بهای تمام‌شده — رشتهٔ خالی یعنی ثبت‌نشده، نه صفر. */
  costBasis: string;
  asOf: string;
}

export interface HistoryItem {
  id: string;
  version: number;
  note: string | null;
  createdAt: string;
}

const ASSET_CLASSES = ["gold", "fixed_income", "equity_ir", "fx", "cash"] as const;
/**
 * برچسبِ فارسیِ دستهٔ دارایی.
 *
 * ⚠️ `asset_class` در دیتابیس متنِ آزاد است (`CHECK (btrim(...) <> '')`)، پس
 * دسته‌ای خارج از این فهرست هم می‌تواند ذخیره شده باشد. چاپِ خامِ آن اسلاگ
 * کنارِ برچسب‌های فارسی، آن را مثلِ یک دستهٔ عادی نشان می‌داد — در حالی که
 * هیچ‌جای محاسبه آن را نمی‌شناسد. `assetLabel` صریح علامتش می‌زند؛ برچسبِ
 * تازه هم برایش اختراع نمی‌شود، چون حدس‌زدنِ دسته ممنوع است.
 */
const ASSET_LABEL: Record<string, string> = {
  gold: "طلا",
  fixed_income: "درآمد ثابت",
  equity_ir: "سهام ایران",
  fx: "ارز",
  cash: "نقد",
};

function assetLabel(assetClass: string): string {
  return ASSET_LABEL[assetClass] ?? `«${assetClass}» (دستهٔ ناشناخته)`;
}

const blank = (): Row => ({
  positionKey: "",
  label: "",
  kind: "symbol",
  assetClass: "gold",
  qty: "",
  unit: "عدد",
  costBasis: "",
  asOf: new Date().toISOString().slice(0, 10),
});

export default function HoldingsWorkbench({
  ready,
  history,
  activeVersion,
  activePositions,
  rows: comparison,
  gaps,
  definitive,
  notes,
  totalValue,
}: {
  ready: boolean;
  history: readonly HistoryItem[];
  activeVersion: number | null;
  /** ریزِ اقلامِ نسخهٔ انتخابی — مستقل از قیمت و هدف نمایش داده می‌شود. */
  activePositions: readonly HoldingPosition[];
  rows: readonly AssetClassRow[];
  gaps: readonly CoverageGap[];
  definitive: boolean;
  notes: readonly string[];
  totalValue: number | null;
}) {
  const router = useRouter();

  const fromPositions = (ps: readonly HoldingPosition[]): Row[] =>
    ps.length === 0
      ? [blank()]
      : ps.map((p) => ({
          positionKey: p.positionKey,
          label: p.symbol ?? p.manualLabel ?? p.positionKey,
          kind: p.symbol ? ("symbol" as const) : ("manual" as const),
          assetClass: p.assetClass,
          qty: String(p.qty),
          unit: p.unit,
          costBasis: p.costBasis === null ? "" : String(p.costBasis),
          asOf: p.asOf,
        }));

  // ⚠️ فرم از ریزِ همان نسخه‌ای پر می‌شود که باز شده. نسخهٔ قبلی فرم همیشه
  // خالی بود، پس «اصلاح» یعنی تایپِ دوبارهٔ همه‌چیز از صفر — و ریزِ اقلامِ
  // ذخیره‌شده اصلاً هیچ‌جا دیده نمی‌شد.
  const [rows, setRows] = useState<Row[]>(() => fromPositions(activePositions));
  const [seededFrom, setSeededFrom] = useState<number | null>(activeVersion);

  // با تعویضِ نسخه (کلیک روی تاریخچه) فرم دوباره از همان نسخه پر می‌شود.
  if (seededFrom !== activeVersion) {
    setSeededFrom(activeVersion);
    setRows(fromPositions(activePositions));
  }

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  // توکن در همان نشستِ فرم ثابت می‌ماند: دوبار کلیک یا retry نسخهٔ تکراری
  // نمی‌سازد. پس از ثبتِ موفق، توکنِ تازه برای ثبتِ بعدی ساخته می‌شود.
  const [token, setToken] = useState(() => crypto.randomUUID());

  const patch = (i: number, p: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));

  const submit = async () => {
    setError("");
    setSaved(null);
    // ⚠️ رفت‌وبرگشتِ بی‌اتلاف: کلید، برچسب و بهای تمام‌شده هرکدام جدا حمل
    // می‌شوند. برای قلمِ تازه (کلیدِ خالی) از برچسب کلید ساخته می‌شود، ولی
    // برای قلمِ موجود کلیدِ اصلی دست نمی‌خورد.
    const positions = rows.map((r) => {
      const label = r.label.trim();
      const key = r.positionKey.trim() || label;
      const costBasis = toLatinDigits(r.costBasis).trim();
      return {
        position_key: key,
        ...(r.kind === "symbol" ? { symbol: label } : { manual_label: label }),
        asset_class: r.assetClass,
        qty: Number(toLatinDigits(r.qty)),
        unit: r.unit.trim(),
        ...(costBasis === "" ? {} : { cost_basis: costBasis }),
        as_of: r.asOf,
      };
    });

    if (positions.some((p) => !p.position_key)) {
      setError("نام یا نماد هر قلم را وارد کنید.");
      return;
    }
    if (positions.some((p) => !Number.isFinite(p.qty) || p.qty <= 0)) {
      setError("مقدار هر قلم باید عددی بزرگ‌تر از صفر باشد.");
      return;
    }
    if (new Set(positions.map((p) => p.position_key)).size !== positions.length) {
      setError("یک قلم دوبار وارد شده است.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/portfolio/holdings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positions, client_token: token }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "ثبت دارایی انجام نشد.");
      setSaved(
        json.reused
          ? `همین ثبت قبلاً انجام شده بود — نسخهٔ ${toPersianDigits(json.version)} دوباره ساخته نشد.`
          : `نسخهٔ ${toPersianDigits(json.version)} با ${toPersianDigits(json.position_count)} قلم ذخیره شد.`
      );
      setToken(crypto.randomUUID());
      // ⚠️ فقط `router.refresh()` کافی نیست: اگر کاربر روی `?v=نسخهٔ قدیمی`
      // بود، پس از ذخیرهٔ موفق همان نسخهٔ قدیمی انتخاب می‌ماند و نسخهٔ تازه‌ای
      // که همین الان ساخت را نمی‌بیند. پس صریح به نسخهٔ برگشتی می‌رویم.
      router.push(`?v=${json.version_id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ثبت دارایی انجام نشد.");
    } finally {
      setSaving(false);
    }
  };

  if (!ready) {
    return (
      <div
        className="flex items-start gap-2 rounded-xl px-4 py-3 text-sm"
        style={{ background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--text-2)" }}
      >
        <AlertCircle size={15} className="mt-0.5 shrink-0" />
        <span>
          ثبت دارایی روی این محیط هنوز فعال نیست — مهاجرت پایگاه‌داده اجرا نشده است. فرم غیرفعال
          می‌ماند تا به‌جای خطای بی‌توضیح، دلیلش روشن باشد.
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ثبت */}
      <div className="card-elevated p-6 space-y-4">
        <h3 className="font-display font-bold text-lg" style={{ color: "var(--navy-deep)" }}>
          ثبت دارایی واقعی
        </h3>

        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
              <div className="md:col-span-2 space-y-1">
                <label className="block text-xs font-bold" style={{ color: "var(--text-2)" }}>
                  {r.kind === "symbol" ? "نماد" : "برچسب دستی"}
                </label>
                <input
                  className="input"
                  value={r.label}
                  onChange={(e) => patch(i, { label: e.target.value })}
                  disabled={saving}
                  dir="rtl"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-bold" style={{ color: "var(--text-2)" }}>نوع</label>
                <select className="input" value={r.kind} disabled={saving}
                  onChange={(e) => patch(i, { kind: e.target.value as Row["kind"] })}>
                  <option value="symbol">نماد واقعی</option>
                  <option value="manual">دارایی دستی</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-bold" style={{ color: "var(--text-2)" }}>دسته</label>
                <select className="input" value={r.assetClass} disabled={saving}
                  onChange={(e) => patch(i, { assetClass: e.target.value })}>
                  {ASSET_CLASSES.map((c) => (
                    <option key={c} value={c}>{ASSET_LABEL[c]}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-bold" style={{ color: "var(--text-2)" }}>مقدار</label>
                <input className="input" value={r.qty} inputMode="decimal" disabled={saving}
                  onChange={(e) => patch(i, { qty: e.target.value })} />
              </div>
              <div className="flex gap-2">
                <input className="input" value={r.unit} disabled={saving}
                  aria-label="واحد"
                  onChange={(e) => patch(i, { unit: e.target.value })} />
                <button type="button" aria-label="حذف قلم" disabled={saving || rows.length === 1}
                  onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                  className="px-2 rounded-lg disabled:opacity-40"
                  style={{ border: "1px solid var(--line)", color: "var(--danger)" }}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <button type="button" onClick={() => setRows((rs) => [...rs, blank()])} disabled={saving}
          className="flex items-center gap-1.5 text-xs font-bold" style={{ color: "var(--navy)" }}>
          <Plus size={13} /> افزودن قلم
        </button>

        {error && (
          <div className="flex items-center gap-2 text-sm" style={{ color: "var(--danger)" }}>
            <AlertCircle size={15} /> {error}
          </div>
        )}
        {saved && (
          <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm"
            style={{ background: "rgba(21,128,61,0.08)", border: "1px solid rgba(21,128,61,0.25)", color: "var(--success)" }}>
            <CheckCircle2 size={15} /> {saved}
          </div>
        )}

        <button type="button" onClick={submit} disabled={saving} className="btn btn-gold">
          <Save size={16} />
          {saving ? "در حال ذخیره..." : "ذخیرهٔ نسخهٔ تازه"}
        </button>
      </div>

      {/* بازکردن دوباره */}
      {history.length > 0 && (
        <div className="card-elevated p-6">
          <h3 className="flex items-center gap-2 font-display font-bold text-lg mb-3" style={{ color: "var(--navy-deep)" }}>
            <History size={16} /> نسخه‌های ثبت‌شده
          </h3>
          <div className="space-y-2">
            {history.map((h) => (
              <a key={h.id} href={`?v=${h.id}`}
                className="flex items-center justify-between rounded-xl px-4 py-2.5 text-sm"
                style={{
                  background: h.version === activeVersion ? "var(--surface-3, var(--surface-2))" : "var(--surface-2)",
                  border: `1px solid ${h.version === activeVersion ? "var(--gold)" : "var(--line)"}`,
                }}>
                <span style={{ color: "var(--navy-deep)" }}>
                  نسخهٔ {toPersianDigits(h.version)}
                  {h.version === activeVersion ? " — در حال نمایش" : ""}
                </span>
                <span style={{ color: "var(--text-3)" }}>{formatJalali(h.createdAt)}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* ریزِ داراییِ نسخهٔ انتخابی — مستقل از قیمت و هدف */}
      {activePositions.length > 0 && (
        <div className="card-elevated p-6">
          <h3 className="font-display font-bold text-lg mb-1" style={{ color: "var(--navy-deep)" }}>
            ریز دارایی نسخهٔ {activeVersion === null ? "—" : toPersianDigits(activeVersion)}
          </h3>
          <p className="text-xs mb-4" style={{ color: "var(--text-3)" }}>
            این فهرست بدون نیاز به قیمت یا سبد هدف نمایش داده می‌شود؛ فرم بالا هم از همین
            اقلام پر شده تا بتوانید نسخهٔ اصلاحی بسازید.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: "var(--text-2)" }}>
                  <th className="text-right py-2 font-bold">قلم</th>
                  <th className="text-right py-2 font-bold">نوع</th>
                  <th className="text-right py-2 font-bold">دسته</th>
                  <th className="text-right py-2 font-bold">مقدار</th>
                  <th className="text-right py-2 font-bold">تاریخ</th>
                </tr>
              </thead>
              <tbody>
                {activePositions.map((p) => (
                  <tr key={p.positionKey} style={{ borderTop: "1px solid var(--line)" }}>
                    <td className="py-2" style={{ color: "var(--navy-deep)" }}>
                      {p.symbol ?? p.manualLabel ?? p.positionKey}
                    </td>
                    <td className="py-2" style={{ color: "var(--text-3)" }}>
                      {p.symbol ? "نماد" : "دستی"}
                    </td>
                    <td className="py-2" style={{ color: "var(--text-2)" }}>
                      {assetLabel(p.assetClass)}
                    </td>
                    <td className="py-2" style={{ color: "var(--text-2)" }}>
                      {toPersianDigits(p.qty)} {p.unit}
                    </td>
                    <td className="py-2" style={{ color: "var(--text-3)" }}>
                      {formatJalali(p.asOf)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* مقایسه */}
      <div className="card-elevated p-6">
        <h3 className="font-display font-bold text-lg mb-3" style={{ color: "var(--navy-deep)" }}>
          مقایسه با سبد هدف
        </h3>

        {notes.map((n, i) => (
          <p key={i} className="flex items-start gap-2 text-xs mb-3" style={{ color: "var(--text-3)" }}>
            <Info size={13} className="mt-0.5 shrink-0" />
            <span>{n}</span>
          </p>
        ))}

        {!definitive && gaps.length > 0 && (
          <div className="rounded-xl px-4 py-3 text-sm mb-4"
            style={{ background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--text-2)" }}>
            <div className="font-bold mb-1">پوشش قیمت ناقص است</div>
            <ul className="space-y-1 text-xs">
              {gaps.map((g) => (
                <li key={g.positionKey}>«{g.positionKey}» — {g.detail}</li>
              ))}
            </ul>
            <div className="mt-2 text-xs">
              تا کامل‌شدن پوشش، مقدار قطعی بازتوازن محاسبه نمی‌شود.
            </div>
          </div>
        )}

        {comparison.length === 0 ? (
          <p className="py-6 text-center text-sm" style={{ color: "var(--text-3)" }}>
            هنوز سبد هدفی برای مقایسه ثبت نشده است.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: "var(--text-2)" }}>
                  <th className="text-right py-2 font-bold">دسته</th>
                  <th className="text-right py-2 font-bold">وزن فعلی</th>
                  <th className="text-right py-2 font-bold">وزن هدف</th>
                  <th className="text-right py-2 font-bold">اختلاف</th>
                  <th className="text-right py-2 font-bold">تغییر لازم</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((r) => (
                  <tr key={r.assetClass} style={{ borderTop: "1px solid var(--line)" }}>
                    <td className="py-2" style={{ color: "var(--navy-deep)" }}>
                      {assetLabel(r.assetClass)}
                    </td>
                    <td className="py-2" style={{ color: "var(--text-2)" }}>
                      {r.currentWeightPct === null ? "—" : `${toPersianDigits(r.currentWeightPct.toFixed(1))}٪`}
                    </td>
                    <td className="py-2" style={{ color: "var(--text-2)" }}>
                      {toPersianDigits(r.targetWeightPct)}٪
                    </td>
                    <td className="py-2" style={{ color: "var(--text-2)" }}>
                      {r.deltaPercentagePoints === null
                        ? "—"
                        : `${toPersianDigits(r.deltaPercentagePoints.toFixed(1))} واحد`}
                    </td>
                    <td className="py-2" style={{ color: "var(--text-2)" }}>
                      {r.valueDelta === null ? "—" : formatToman(r.valueDelta)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totalValue !== null && (
              <p className="text-xs mt-3" style={{ color: "var(--text-3)" }}>
                ارزش پوشش‌داده‌شده: {formatToman(totalValue)}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
