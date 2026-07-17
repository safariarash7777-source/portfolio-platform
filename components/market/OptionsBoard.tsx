"use client";

// تابلوی اختیار معامله — M8-ب رصد بازار.
//
// جدول قراردادها با فیلتر نماد پایه و نوع (اختیار خرید/فروش)، مرتب‌سازی،
// ارقام فقط از lib/format. حالت خالی صادقانه (خارج از ساعت بازار یا نبود داده).
// هیچ متن تجویزی — نام ابزار («اختیار خرید/فروش») مجاز است.

import { useMemo, useState } from "react";
import { Search, ArrowUpDown, Clock, FileQuestion } from "lucide-react";
import {
  toPersianDigits,
  formatToman,
  formatTomanShort,
  formatJalali,
} from "@/lib/format";
import type { IrOptionRow } from "@/lib/market-ir";

type TypeFilter = "all" | "call" | "put";
type SortKey = "value" | "volume" | "openInterest" | "dayRemain" | "strike" | "trades";

function num(x: unknown): number | null {
  return typeof x === "number" && isFinite(x) ? x : null;
}

export default function OptionsBoard({
  options,
  fetchedAt,
}: {
  options: IrOptionRow[];
  fetchedAt: number | null;
}) {
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [baseFilter, setBaseFilter] = useState<string>("همه");
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [sortDesc, setSortDesc] = useState(true);
  const [limit, setLimit] = useState(100);

  const bases = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of options) {
      if (o.baseId) counts.set(o.baseId, (counts.get(o.baseId) || 0) + 1);
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    return ["همه", ...sorted];
  }, [options]);

  const rows = useMemo(() => {
    let base = options;
    if (typeFilter !== "all") base = base.filter((o) => o.type === typeFilter);
    if (baseFilter !== "همه") base = base.filter((o) => o.baseId === baseFilter);
    const qq = q.trim();
    if (qq) {
      base = base.filter(
        (o) => o.id.includes(qq) || o.faName.includes(qq) || o.baseId.includes(qq)
      );
    }
    const val = (o: IrOptionRow): number => num(o[sortKey]) ?? -Infinity;
    return [...base].sort((a, b) => (val(b) - val(a)) * (sortDesc ? 1 : -1));
  }, [options, typeFilter, baseFilter, q, sortKey, sortDesc]);

  const header = (label: string, key: SortKey) => (
    <button
      type="button"
      onClick={() => {
        if (sortKey === key) setSortDesc((d) => !d);
        else {
          setSortKey(key);
          setSortDesc(true);
        }
      }}
      className="inline-flex items-center gap-1 whitespace-nowrap hover:text-[var(--navy)]"
    >
      {label}
      <ArrowUpDown size={12} className={sortKey === key ? "opacity-100" : "opacity-30"} />
    </button>
  );

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold" style={{ color: "var(--navy-deep)" }}>
            تابلوی اختیار معامله
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-7" style={{ color: "var(--text-3)" }}>
            همهٔ قراردادهای اختیار خرید و اختیار فروش بازار — قیمت اعمال، سررسید، موقعیت‌های باز و
            ارزش معاملات، با فیلتر نماد پایه و نوع قرارداد. دادهٔ ناموجود با «—» نمایش داده می‌شود.
          </p>
        </div>
        {fetchedAt ? (
          <p className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-3)" }}>
            <Clock size={13} />
            به‌روزرسانی: {formatJalali(fetchedAt)}
          </p>
        ) : null}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="flex rounded-full border p-1" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
          {(
            [
              { key: "all", label: "همه" },
              { key: "call", label: "اختیار خرید" },
              { key: "put", label: "اختیار فروش" },
            ] as { key: TypeFilter; label: string }[]
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setTypeFilter(t.key);
                setLimit(100);
              }}
              className="rounded-full px-4 py-1.5 text-sm font-semibold transition-colors"
              style={
                typeFilter === t.key
                  ? { background: "var(--navy)", color: "var(--text-on-navy)" }
                  : { color: "var(--text-3)" }
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        <select
          value={baseFilter}
          onChange={(e) => {
            setBaseFilter(e.target.value);
            setLimit(100);
          }}
          className="rounded-full border px-4 py-2 text-sm"
          style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--navy-deep)" }}
        >
          {bases.slice(0, 80).map((b) => (
            <option key={b} value={b}>
              {b === "همه" ? "همهٔ نمادهای پایه" : b}
            </option>
          ))}
        </select>

        <div
          className="flex min-w-56 flex-1 items-center gap-2 rounded-full border px-4 py-2"
          style={{ borderColor: "var(--line)", background: "var(--surface)" }}
        >
          <Search size={15} style={{ color: "var(--text-3)" }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="جستجوی قرارداد یا نماد پایه…"
            className="w-full bg-transparent text-sm outline-none"
            style={{ color: "var(--navy-deep)" }}
          />
        </div>
      </div>

      {options.length === 0 ? (
        <div
          className="mt-6 flex flex-col items-center gap-3 rounded-2xl border px-6 py-14 text-center"
          style={{ borderColor: "var(--line)", background: "var(--surface)" }}
        >
          <FileQuestion size={32} style={{ color: "var(--text-3)" }} />
          <p className="text-sm font-semibold" style={{ color: "var(--navy-deep)" }}>
            دادهٔ اختیار معامله در اسنپ‌شات فعلی موجود نیست.
          </p>
          <p className="max-w-md text-xs leading-6" style={{ color: "var(--text-3)" }}>
            دادهٔ این تابلو در چرخهٔ ۵دقیقه‌ای ساعات بازار به‌روز می‌شود. اگر خارج از ساعت معاملات هستید
            یا منبع داده موقتاً در دسترس نیست، این صفحه به‌جای عدد ساختگی، همین پیام را نشان می‌دهد.
          </p>
        </div>
      ) : (
        <div
          className="mt-5 overflow-x-auto rounded-2xl border"
          style={{ borderColor: "var(--line)", background: "var(--surface)" }}
        >
          <table className="w-full min-w-[1000px] text-sm">
            <thead>
              <tr
                className="border-b text-right text-xs"
                style={{ borderColor: "var(--line)", color: "var(--text-3)" }}
              >
                <th className="px-4 py-3 font-medium">قرارداد</th>
                <th className="px-3 py-3 font-medium">نماد پایه</th>
                <th className="px-3 py-3 font-medium">نوع</th>
                <th className="px-3 py-3 font-medium">{header("قیمت اعمال", "strike")}</th>
                <th className="px-3 py-3 font-medium">{header("روز تا سررسید", "dayRemain")}</th>
                <th className="px-3 py-3 font-medium">سررسید</th>
                <th className="px-3 py-3 font-medium">{header("موقعیت باز", "openInterest")}</th>
                <th className="px-3 py-3 font-medium">آخرین قیمت</th>
                <th className="px-3 py-3 font-medium">{header("حجم", "volume")}</th>
                <th className="px-3 py-3 font-medium">{header("ارزش معاملات", "value")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map((o) => (
                <tr
                  key={o.id}
                  className="border-b last:border-b-0 hover:bg-black/[.02]"
                  style={{ borderColor: "var(--line)" }}
                >
                  <td className="px-4 py-2.5">
                    <span className="font-bold" style={{ color: "var(--navy-deep)" }}>
                      {o.id}
                    </span>
                    <span className="mr-2 hidden max-w-56 truncate text-xs lg:inline" style={{ color: "var(--text-3)" }}>
                      {o.faName}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5" style={{ color: "var(--navy-deep)" }}>
                    {o.baseId || "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-semibold"
                      style={
                        o.type === "call"
                          ? { background: "var(--green-bg, #e8f5ee)", color: "var(--green, #157347)" }
                          : { background: "var(--red-bg, #fdecec)", color: "var(--red, #b02a37)" }
                      }
                    >
                      {o.type === "call" ? "اختیار خرید" : "اختیار فروش"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5" style={{ color: "var(--navy-deep)" }}>
                    {num(o.strike) != null ? formatToman(o.strike as number) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5" style={{ color: "var(--navy-deep)" }}>
                    {num(o.dayRemain) != null ? toPersianDigits(o.dayRemain as number) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs" style={{ color: "var(--text-2)" }}>
                    {o.dateEnd ? toPersianDigits(o.dateEnd) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5" style={{ color: "var(--navy-deep)" }}>
                    {num(o.openInterest) != null ? toPersianDigits(Math.round(o.openInterest as number).toLocaleString("en-US")) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5" style={{ color: "var(--navy-deep)" }}>
                    {num(o.price) != null && (o.price as number) > 0 ? formatToman(o.price as number) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5" style={{ color: "var(--navy-deep)" }}>
                    {num(o.volume) != null && (o.volume as number) > 0
                      ? toPersianDigits(Math.round(o.volume as number).toLocaleString("en-US"))
                      : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5" style={{ color: "var(--navy-deep)" }}>
                    {num(o.value) != null && (o.value as number) > 0 ? formatTomanShort(o.value as number) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-3)" }}>
              هیچ قراردادی با این فیلترها پیدا نشد.
            </p>
          ) : null}
          {rows.length > limit ? (
            <div className="border-t p-3 text-center" style={{ borderColor: "var(--line)" }}>
              <button
                type="button"
                onClick={() => setLimit((l) => l + 200)}
                className="rounded-full border px-5 py-1.5 text-sm font-semibold"
                style={{ borderColor: "var(--line)", color: "var(--navy)" }}
              >
                نمایش بیشتر ({toPersianDigits(rows.length - limit)} قرارداد دیگر)
              </button>
            </div>
          ) : null}
        </div>
      )}

      <p className="mt-4 text-xs leading-6" style={{ color: "var(--text-3)" }}>
        منبع داده: اسنپ‌شات رسمی بازار (رلهٔ داخلی، چرخهٔ ~۵دقیقه‌ای). قیمت‌ها به تومان.
        این صفحه صرفاً دادهٔ قراردادهای اختیار معامله را نمایش می‌دهد و هیچ ارزیابی یا توصیه‌ای ارائه نمی‌کند.
      </p>
    </section>
  );
}
