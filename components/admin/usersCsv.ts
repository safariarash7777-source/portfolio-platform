import { faDateLabel } from "./adminFormat";

export type AdminUserRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  national_id: string | null;
  joined_at: string | null;
  last_risk_category: string | null;
  last_score: number | null;
  last_assessed_at: string | null;
  has_portfolio: boolean;
  total_count: number;
};

/** فرارِ استانداردِ CSV (RFC 4180): کوتیشن/کاما/خط‌جدید داخلِ فیلد امن می‌شود. */
function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * ساخت محتوای CSV از ردیف‌ها — «همان چیزی که می‌بینی».
 * ابتدای فایل BOM (﻿) دارد تا اکسل UTF-8 فارسی را درست بخواند.
 * نمره با ارقام لاتین می‌آید تا در اکسل عددِ قابل‌استفاده بماند؛ تاریخ عضویت شمسی است.
 */
export function buildUsersCsv(rows: AdminUserRow[]): string {
  const header = [
    "نام",
    "ایمیل",
    "تلفن",
    "کد ملی",
    "تاریخ عضویت",
    "دستهٔ ریسک",
    "نمره",
    "وضعیت پرتفوی",
  ];

  const lines: string[] = [header.map(csvEscape).join(",")];

  for (const r of rows) {
    const cells = [
      r.full_name ?? "",
      r.email ?? "",
      r.phone ?? "",
      r.national_id ?? "",
      faDateLabel(r.joined_at),
      r.last_risk_category ?? "ارزیابی‌نشده",
      r.last_score != null ? String(r.last_score) : "",
      r.has_portfolio ? "دارد" : "ندارد",
    ];
    lines.push(cells.map((c) => csvEscape(String(c))).join(","));
  }

  // BOM + CRLF — سازگارترین حالت برای اکسل با متن فارسی
  return "﻿" + lines.join("\r\n");
}

/** دانلودِ مستقیمِ CSV؛ دادهٔ حساس فقط از همین‌جا خارج می‌شود — نه URL، نه لاگ. */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function csvFilename(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `users-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.csv`;
}
