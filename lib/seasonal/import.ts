import { createHash } from "node:crypto";
import { toLatinDigits } from "../format";
export const CSV_HEADER = "source,external_registration_id,external_cohort_ref,status,occurred_at,source_revision,contact_type,contact_value";
export interface ImportRow { source: string; externalId: string; cohortRef: string; status: "accepted" | "cancelled"; occurredAt: string; revision: number; contactType: "email" | "phone"; contactValue: string }
export function parseImport(csv: string, cohortRef: string) {
  if (csv.length > 500000) throw new Error("فایل بیش از حد بزرگ است.");
  const lines: string[][] = []; let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (c === '"') { if (quoted && csv[i+1] === '"') { field += '"'; i++; } else quoted = !quoted; }
    else if (c === "," && !quoted) { row.push(field); field = ""; }
    else if (c === "\n" && !quoted) { row.push(field.replace(/\r$/, "")); if (row.some(Boolean)) lines.push(row); row = []; field = ""; }
    else field += c;
  }
  if (quoted) throw new Error("نقل‌قول CSV بسته نشده است.");
  row.push(field.replace(/\r$/, "")); if (row.some(Boolean)) lines.push(row);
  if (lines.shift()?.join(",").replace(/^\uFEFF/, "") !== CSV_HEADER) throw new Error("ستون‌های CSV مطابق قرارداد نیست.");
  if (!lines.length || lines.length > 500) throw new Error("هر دسته باید بین ۱ تا ۵۰۰ ردیف باشد.");
  const rows: ImportRow[] = []; const errors: { line: number; reason: string }[] = []; const seen = new Set<string>();
  lines.forEach((cells, i) => {
    const [source,id,ref,status,at,rev,type,raw] = cells.map(x => x.trim());
    const contact = toLatinDigits(raw ?? "").toLowerCase();
    let reason = "";
    if (cells.length !== 8 || !source || !id || source.length > 80 || id.length > 160) reason = "شناسه یا ستون نامعتبر";
    else if (ref !== cohortRef) reason = "دوره با نگاشت انتخاب‌شده برابر نیست";
    else if (!["accepted", "cancelled"].includes(status)) reason = "وضعیت ناشناخته";
    else if (!/(Z|[+-]\d{2}:\d{2})$/.test(at) || !Number.isFinite(Date.parse(at))) reason = "زمان باید منطقهٔ زمانی داشته باشد";
    else if (!/^\d+$/.test(rev) || Number(rev) < 1) reason = "نسخهٔ منبع نامعتبر";
    else if (!(type === "email" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) && !(type === "phone" && /^\+[1-9]\d{7,14}$/.test(contact))) reason = "تماس نرمال‌شده نامعتبر";
    const key = JSON.stringify([source,id]); if (seen.has(key)) reason = "شناسهٔ تکراری در فایل"; seen.add(key);
    if (reason) errors.push({line:i+2,reason});
    else rows.push({source,externalId:id,cohortRef:ref,status:status as ImportRow["status"],occurredAt:new Date(at).toISOString(),revision:Number(rev),contactType:type as ImportRow["contactType"],contactValue:contact});
  });
  return { rows, errors, total: lines.length, hash: createHash("sha256").update(JSON.stringify(rows)).digest("hex") };
}
export function maskContact(value: string) { return value.includes("@") ? value.slice(0,1) + "***@" + value.split("@")[1] : "***" + value.slice(-3); }
export function safeCsvCell(value: string) { return '"' + (/^[=+\-@]/.test(value) ? "'" : "") + value.replaceAll('"','""') + '"'; }
