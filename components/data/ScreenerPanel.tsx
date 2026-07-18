"use client";

// پنل فیلترهای تابلوخوانی — M7 + پرست‌های T2 شناسنامهٔ تحلیلی.
//
// چیپ‌های فیلتر + «تعریف عمومی شفاف» زیر فیلتر فعال + ذخیره/بازیابی فیلتر برای
// کاربر واردشده (جدول screener_presets) + ستاره‌کردن پرست‌ها (تب «منتخب» —
// جدول screener_starred برای پرست‌های سیستمی و ستون starred برای ذخیره‌شده‌ها).
// صداقت داده: فیلتر بدون دادهٔ لازم برای یک نماد، آن نماد را حذف می‌کند؛
// برچسب پوشش کنار فیلترهای وابسته به تاریخچه/گزارش. هیچ متن تجویزی.

import { useEffect, useMemo, useState } from "react";
import { SlidersHorizontal, Info, Save, Trash2, X, Star } from "lucide-react";
import { SCREENER_FILTERS } from "@/lib/core/screener";
import { FUNDAMENTAL_PRESETS } from "@/lib/core/fundamentalPresets";
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
  starred?: boolean;
}

export default function ScreenerPanel({
  activeFilter,
  onFilterChange,
  matchCount,
  historyCoverage,
  fundamentalCoverage,
  currentConfig,
  onApplyPreset,
}: {
  activeFilter: string | null;
  onFilterChange: (key: string | null) => void;
  /** تعداد نمادهای عبورکرده از فیلتر فعال — null یعنی فیلتری فعال نیست */
  matchCount: number | null;
  /** چند نماد از کل، تاریخچهٔ کافی برای فیلتر حجم دارند */
  historyCoverage: { covered: number; total: number };
  /** پوشش پرست‌های بنیادی: چند نماد گزارش کافی دارند (کلید پرست → تعداد) */
  fundamentalCoverage?: Record<string, number>;
  currentConfig: ScreenerPresetConfig;
  onApplyPreset: (c: ScreenerPresetConfig) => void;
}) {
  const [presets, setPresets] = useState<PresetRow[]>([]);
  const [starredKeys, setStarredKeys] = useState<Set<string>>(new Set());
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
      const [{ data: rows }, { data: stars }] = await Promise.all([
        supabase
          .from("screener_presets")
          .select("id,name,config,starred")
          .order("created_at", { ascending: false })
          .limit(20),
        supabase.from("screener_starred").select("preset_key").limit(50),
      ]);
      if (!alive) return;
      if (rows) setPresets(rows as PresetRow[]);
      if (stars) setStarredKeys(new Set(stars.map((s: { preset_key: string }) => s.preset_key)));
    })();
    return () => {
      alive = false;
    };
  }, []);

  const toggleSystemStar = async (key: string) => {
    if (!loggedIn) return;
    const supabase = createClient();
    if (starredKeys.has(key)) {
      const { error } = await supabase.from("screener_starred").delete().eq("preset_key", key);
      if (!error)
        setStarredKeys((s) => {
          const n = new Set(s);
          n.delete(key);
          return n;
        });
    } else {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { error } = await supabase
        .from("screener_starred")
        .insert({ preset_key: key, user_id: u.user.id });
      if (!error) setStarredKeys((s) => new Set(s).add(key));
    }
  };

  const toggleSavedStar = async (p: PresetRow) => {
    const supabase = createClient();
    const next = !p.starred;
    const { error } = await supabase
      .from("screener_presets")
      .update({ starred: next })
      .eq("id", p.id);
    if (!error)
      setPresets((rows) => rows.map((r) => (r.id === p.id ? { ...r, starred: next } : r)));
  };

  const savePreset = async () => {
    const name = nameDraft.trim();
    if (!name) return;
    setSaving(true);
    setMsg(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("screener_presets")
      .insert({ name, config: currentConfig })
      .select("id,name,config,starred")
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

  // ترتیب چیپ‌ها: ستاره‌دارها اول (تب «منتخب» درون‌خطی)، بعد بقیه
  const orderedFilters = useMemo(() => {
    const starredF = SCREENER_FILTERS.filter((f) => starredKeys.has(f.key));
    const rest = SCREENER_FILTERS.filter((f) => !starredKeys.has(f.key));
    return [...starredF, ...rest];
  }, [starredKeys]);

  const active = SCREENER_FILTERS.find((f) => f.key === activeFilter) ?? null;
  const activeFundamental = FUNDAMENTAL_PRESETS.find((p) => p.key === activeFilter) ?? null;

  const chip = (opts: {
    key: string;
    label: string;
    coverage?: number | null;
    on: boolean;
  }) => (
    <span key={opts.key} className="inline-flex items-center">
      <button
        type="button"
        onClick={() => onFilterChange(opts.on ? null : opts.key)}
        className="rounded-full border px-3 py-1 text-xs font-semibold transition-colors"
        style={
          opts.on
            ? { background: "var(--navy)", color: "var(--text-on-navy)", borderColor: "var(--navy)" }
            : { borderColor: "var(--line)", color: "var(--text-2)" }
        }
      >
        {starredKeys.has(opts.key) ? "★ " : ""}
        {opts.label}
        {opts.coverage != null ? (
          <span className="mr-1 opacity-70">({toPersianDigits(opts.coverage)} نماد پوشش)</span>
        ) : null}
      </button>
      {loggedIn ? (
        <button
          type="button"
          onClick={() => toggleSystemStar(opts.key)}
          aria-label={starredKeys.has(opts.key) ? "حذف از منتخب" : "افزودن به منتخب"}
          className="mr-0.5 p-0.5"
        >
          <Star
            size={12}
            style={{
              color: starredKeys.has(opts.key) ? "var(--gold)" : "var(--text-3)",
              fill: starredKeys.has(opts.key) ? "var(--gold)" : "none",
            }}
          />
        </button>
      ) : null}
    </span>
  );

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
        {orderedFilters.map((f) =>
          chip({
            key: f.key,
            label: f.label,
            coverage: f.needsHistory ? historyCoverage.covered : null,
            on: activeFilter === f.key,
          })
        )}
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

      {fundamentalCoverage ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 text-xs font-semibold"
            style={{ color: "var(--text-3)" }}
          >
            <SlidersHorizontal size={14} />
            پرست‌های بنیادی:
          </span>
          {FUNDAMENTAL_PRESETS.map((p) =>
            chip({
              key: p.key,
              label: p.label,
              coverage: fundamentalCoverage[p.key] ?? 0,
              on: activeFilter === p.key,
            })
          )}
        </div>
      ) : null}

      {active || activeFundamental ? (
        <div
          className="mt-3 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs leading-6"
          style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text-2)" }}
        >
          <Info size={14} className="mt-1 shrink-0" style={{ color: "var(--navy)" }} />
          <div>
            <p>
              <strong style={{ color: "var(--navy-deep)" }}>
                {(active ?? activeFundamental)!.label}:
              </strong>{" "}
              {(active ?? activeFundamental)!.definition}
            </p>
            <p className="mt-1" style={{ color: "var(--text-3)" }}>
              {matchCount != null ? (
                <>نتیجه: {toPersianDigits(matchCount)} نماد. </>
              ) : null}
              نماد بدون دادهٔ لازم از نتیجه حذف می‌شود — هیچ عدد ساختگی. این فهرست توصیف داده است، نه ارزیابی.
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
            {[...presets]
              .sort((a, b) => Number(b.starred ?? false) - Number(a.starred ?? false))
              .map((p) => (
                <span
                  key={p.id}
                  className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs"
                  style={{ borderColor: "var(--line)", color: "var(--text-2)" }}
                >
                  <button
                    type="button"
                    onClick={() => toggleSavedStar(p)}
                    aria-label={p.starred ? "حذف از منتخب" : "افزودن به منتخب"}
                  >
                    <Star
                      size={11}
                      style={{
                        color: p.starred ? "var(--gold)" : "var(--text-3)",
                        fill: p.starred ? "var(--gold)" : "none",
                      }}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => onApplyPreset(p.config)}
                    className="font-semibold hover:underline"
                  >
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
            برای ذخیره و ستاره‌کردن فیلترها، وارد حساب شوید.
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
