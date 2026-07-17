"use client";

// پنل فیلترهای تابلوخوانی — M7 رصد بازار.
//
// چیپ‌های فیلتر + «تعریف عمومی شفاف» زیر فیلتر فعال + ذخیره/بازیابی فیلتر برای
// کاربر واردشده (جدول screener_presets، RLS ردیف‌های خود کاربر).
// صداقت داده: فیلتر بدون دادهٔ لازم برای یک نماد، آن نماد را حذف می‌کند؛
// فیلتر حجم فقط روی نمادهای دارای تاریخچه کار می‌کند و برچسب پوشش دارد.
// هیچ متن تجویزی — فقط توصیف محاسبه.

import { useEffect, useState } from "react";
import { SlidersHorizontal, Info, Save, Trash2, X } from "lucide-react";
import { SCREENER_FILTERS } from "@/lib/core/screener";
import { toPersianDigits } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

export interface ScreenerPresetConfig {
  filterKey: string | null;
  q?: string;
  sortKey?: string;
  sortDesc?: boolean;
}

interface PresetRow {
  id: string;
  name: string;
  config: ScreenerPresetConfig;
}

export default function ScreenerPanel({
  activeFilter,
  onFilterChange,
  matchCount,
  historyCoverage,
  currentConfig,
  onApplyPreset,
}: {
  activeFilter: string | null;
  onFilterChange: (key: string | null) => void;
  /** تعداد نمادهای عبورکرده از فیلتر فعال — null یعنی فیلتری فعال نیست */
  matchCount: number | null;
  /** چند نماد از کل، تاریخچهٔ کافی برای فیلتر حجم دارند */
  historyCoverage: { covered: number; total: number };
  currentConfig: ScreenerPresetConfig;
  onApplyPreset: (c: ScreenerPresetConfig) => void;
}) {
  const [presets, setPresets] = useState<PresetRow[]>([]);
  const [loggedIn, setLoggedIn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [showSave, setShowSave] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      if (!data.user) return;
      setLoggedIn(true);
      const { data: rows } = await supabase
        .from("screener_presets")
        .select("id,name,config")
        .order("created_at", { ascending: false })
        .limit(20);
      if (alive && rows) setPresets(rows as PresetRow[]);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const savePreset = async () => {
    const name = nameDraft.trim();
    if (!name) return;
    setSaving(true);
    setMsg(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("screener_presets")
      .insert({ name, config: currentConfig })
      .select("id,name,config")
      .single();
    setSaving(false);
    if (error || !data) {
      setMsg("ذخیرهٔ فیلتر ناموفق بود.");
      return;
    }
    setPresets((p) => [data as PresetRow, ...p]);
    setNameDraft("");
    setShowSave(false);
    setMsg("فیلتر ذخیره شد.");
  };

  const deletePreset = async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase.from("screener_presets").delete().eq("id", id);
    if (!error) setPresets((p) => p.filter((x) => x.id !== id));
  };

  const active = SCREENER_FILTERS.find((f) => f.key === activeFilter) ?? null;

  return (
    <div
      className="mt-4 rounded-2xl border p-4"
      style={{ borderColor: "var(--line)", background: "var(--surface)" }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 text-xs font-semibold"
          style={{ color: "var(--text-3)" }}
        >
          <SlidersHorizontal size={14} />
          فیلترهای تابلوخوانی:
        </span>
        {SCREENER_FILTERS.map((f) => {
          const on = activeFilter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => onFilterChange(on ? null : f.key)}
              className="rounded-full border px-3 py-1 text-xs font-semibold transition-colors"
              style={
                on
                  ? { background: "var(--navy)", color: "var(--text-on-navy)", borderColor: "var(--navy)" }
                  : { borderColor: "var(--line)", color: "var(--text-2)" }
              }
            >
              {f.label}
              {f.needsHistory ? (
                <span className="mr-1 opacity-70">
                  ({toPersianDigits(historyCoverage.covered)} نماد پوشش)
                </span>
              ) : null}
            </button>
          );
        })}
        {activeFilter ? (
          <button
            type="button"
            onClick={() => onFilterChange(null)}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs"
            style={{ color: "var(--text-3)" }}
          >
            <X size={12} />
            حذف فیلتر
          </button>
        ) : null}
      </div>

      {active ? (
        <div
          className="mt-3 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs leading-6"
          style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text-2)" }}
        >
          <Info size={14} className="mt-1 shrink-0" style={{ color: "var(--navy)" }} />
          <div>
            <p>
              <strong style={{ color: "var(--navy-deep)" }}>{active.label}:</strong> {active.definition}
            </p>
            <p className="mt-1" style={{ color: "var(--text-3)" }}>
              {matchCount != null ? (
                <>نتیجه: {toPersianDigits(matchCount)} نماد از دادهٔ لحظهٔ اسنپ‌شات. </>
              ) : null}
              نماد بدون دادهٔ لازم از نتیجه حذف می‌شود — هیچ عدد ساختگی. این فهرست توصیف دادهٔ امروز است، نه ارزیابی.
            </p>
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {loggedIn ? (
          <>
            {!showSave ? (
              <button
                type="button"
                onClick={() => setShowSave(true)}
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold"
                style={{ borderColor: "var(--line)", color: "var(--navy)" }}
              >
                <Save size={13} />
                ذخیرهٔ این فیلتر
              </button>
            ) : (
              <span className="inline-flex items-center gap-2">
                <input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  placeholder="نام فیلتر…"
                  className="rounded-full border px-3 py-1 text-xs outline-none"
                  style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--navy-deep)" }}
                />
                <button
                  type="button"
                  disabled={saving || !nameDraft.trim()}
                  onClick={savePreset}
                  className="rounded-full px-3 py-1 text-xs font-semibold disabled:opacity-50"
                  style={{ background: "var(--navy)", color: "var(--text-on-navy)" }}
                >
                  {saving ? "در حال ذخیره…" : "ذخیره"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowSave(false)}
                  className="text-xs"
                  style={{ color: "var(--text-3)" }}
                >
                  انصراف
                </button>
              </span>
            )}
            {presets.map((p) => (
              <span
                key={p.id}
                className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs"
                style={{ borderColor: "var(--line)", color: "var(--text-2)" }}
              >
                <button type="button" onClick={() => onApplyPreset(p.config)} className="font-semibold hover:underline">
                  {p.name}
                </button>
                <button type="button" onClick={() => deletePreset(p.id)} aria-label="حذف">
                  <Trash2 size={11} style={{ color: "var(--text-3)" }} />
                </button>
              </span>
            ))}
          </>
        ) : (
          <p className="text-xs" style={{ color: "var(--text-3)" }}>
            برای ذخیرهٔ فیلترهای ترکیبی، وارد حساب شوید.
          </p>
        )}
        {msg ? (
          <span className="text-xs" style={{ color: "var(--text-3)" }}>
            {msg}
          </span>
        ) : null}
      </div>
    </div>
  );
}
