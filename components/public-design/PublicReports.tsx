"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowUpLeft, FileText, X } from "lucide-react";
import type { DeskCompanyReport, DeskRead } from "@/lib/desk/workspace-model";
import { formatJalali, formatTehranClock, toPersianDigits } from "@/lib/format";
import s from "./PublicDesign.module.css";

const stamp = (value: string | null) =>
  value && Number.isFinite(Date.parse(value))
    ? `${formatJalali(value)}، ${formatTehranClock(value)}`
    : "ثبت نشده";
export default function PublicReports({
  read,
  readAt,
}: {
  read: DeskRead<DeskCompanyReport[]>;
  readAt: string;
}) {
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("");
  const [selected, setSelected] = useState<DeskCompanyReport | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const restore = useRef<(() => void) | null>(null);
  const categories = [
    ...new Set(
      read.data.map((row) => row.category).filter((v): v is string => !!v),
    ),
  ];
  const rows = read.data.filter(
    (row) =>
      (!category || row.category === category) &&
      `${row.symbol} ${row.title}`.includes(query.trim()),
  );
  function open(row: DeskCompanyReport) {
    const focused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const scroll = [
      document.scrollingElement,
      ...Array.from(document.querySelectorAll("[data-public-scroll]")),
    ]
      .filter((el): el is Element => !!el)
      .map((el) => ({ el, top: el.scrollTop, left: el.scrollLeft }));
    restore.current = () => {
      focused?.focus({ preventScroll: true });
      scroll.forEach(({ el, top, left }) => el.scrollTo(left, top));
    };
    setSelected(row);
    dialog.current?.showModal();
  }
  return (
    <section
      className={`${s.panel} ${s.reports}`}
      aria-labelledby="public-reports-title"
    >
      <header>
        <FileText size={22} aria-hidden />
        <div>
          <h2 id="public-reports-title">گزارش شرکت‌ها</h2>
          <p>آخرین اطلاعیه‌های قابل خواندن · منبع: کدال</p>
        </div>
        <Link href="/codal">
          همهٔ اطلاعیه‌ها <ArrowUpLeft size={15} aria-hidden />
        </Link>
      </header>
      <div className={s.filters}>
        <label>
          <span className={s.sr}>جست‌وجوی گزارش</span>
          <input
            type="search"
            placeholder="نماد یا عنوان گزارش…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label>
          <span className={s.sr}>دستهٔ گزارش</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="">همهٔ دسته‌ها</option>
            {categories.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>
      {read.state === "unavailable" ? (
        <p className={s.notice} role="status">
          {read.reason}
        </p>
      ) : !rows.length ? (
        <p className={s.empty}>
          {read.data.length
            ? "اطلاعیه‌ای مطابق این فیلتر نیست."
            : "اطلاعیه‌ای در دسترس این نشست ثبت نشده است."}
        </p>
      ) : (
        <div className={s.tableScroll} data-public-scroll>
          <table>
            <thead>
              <tr>
                <th>نماد</th>
                <th>عنوان اطلاعیه</th>
                <th>ارسال منبع</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.symbol}</td>
                  <td>
                    <button onClick={() => open(row)}>
                      {row.title}
                      <ArrowUpLeft size={14} aria-hidden />
                    </button>
                  </td>
                  <td>
                    {row.sourceDate
                      ? toPersianDigits(row.sourceDate)
                      : "ثبت نشده"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className={s.note}>
        فرادادهٔ اطلاعیه؛ استخراج صورت مالی یا تأیید پژوهش از این فهرست نتیجه
        نمی‌شود.
      </p>
      <dialog
        ref={dialog}
        className={s.dialog}
        aria-labelledby="public-report-detail-title"
        onClose={() => {
          restore.current?.();
          restore.current = null;
          setSelected(null);
        }}
      >
        <header>
          <h2 id="public-report-detail-title">{selected?.symbol}</h2>
          <button
            onClick={() => dialog.current?.close()}
            aria-label="بستن جزئیات گزارش"
          >
            <X size={20} aria-hidden />
          </button>
        </header>
        {selected && (
          <div className={s.dialogBody}>
            <h3>{selected.title}</h3>
            <dl>
              <div>
                <dt>دسته</dt>
                <dd>{selected.category ?? "ثبت نشده"}</dd>
              </div>
              <div>
                <dt>ارسال در منبع</dt>
                <dd>
                  {selected.sourceDate
                    ? toPersianDigits(
                        `${selected.sourceDate} ${selected.sourceTime ?? ""}`,
                      )
                    : "ثبت نشده"}
                </dd>
              </div>
              <div>
                <dt>ثبت در سکو</dt>
                <dd>{stamp(selected.recordedAt)}</dd>
              </div>
              <div>
                <dt>خواندن صفحه</dt>
                <dd>{stamp(readAt)}</dd>
              </div>
            </dl>
            {selected.url ? (
              <a href={selected.url} target="_blank" rel="noopener noreferrer">
                مشاهدهٔ اصل اطلاعیه در کدال{" "}
                <ArrowUpLeft size={16} aria-hidden />
              </a>
            ) : (
              <p className={s.notice}>پیوند معتبر منبع در دسترس نیست.</p>
            )}
          </div>
        )}
      </dialog>
    </section>
  );
}
