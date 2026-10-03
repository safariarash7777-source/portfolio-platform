import { normalisePosition, moneyInput, text } from "./financialInput";
import type { HoldingPosition } from "./contracts";
import { toLatinDigits } from "./../format";

export const IMPORT_FIELDS = ["position_key", "symbol", "manual_label", "asset_class", "qty", "unit", "as_of", "ownership_pct", "valuation_mode", "declared_value", "currency", "valuation_source", "valuation_as_of", "valuation_status", "cost_basis", "cost_basis_currency", "title"] as const;
export type ImportMapping = Partial<Record<(typeof IMPORT_FIELDS)[number], string>>;
const aliases: Partial<Record<(typeof IMPORT_FIELDS)[number], Record<string, string>>> = {
  asset_class: { "طلا": "gold", "نقد": "cash", "سهام ایران": "equity_ir", "درآمد ثابت": "fixed_income", "ارز": "fx" },
  valuation_mode: { "قیمت بازار": "market", "ارزش اظهارشده": "declared", "بدون قیمت": "unpriced" },
  currency: { "ریال": "IRR", "تومان": "IRT" }, cost_basis_currency: { "ریال": "IRR", "تومان": "IRT" },
  valuation_status: { "معتبر": "valid", "تخمینی": "estimated" },
};
export interface ImportTable { headers: string[]; rows: Record<string, string>[] }
function exactQuantity(raw: string): boolean {
  const input = toLatinDigits(raw.trim());
  if (!/^\d+(?:\.\d+)?$/.test(input)) return false;
  const number = Number(input); if (!Number.isFinite(number)) return false;
  const canonical = (s: string) => { const [whole, fraction = ""] = s.split("."); const w = whole.replace(/^0+(?=\d)/, ""), f = fraction.replace(/0+$/, ""); return w + (f ? `.${f}` : ""); };
  let rendered = String(number);
  if (rendered.includes("e")) {
    const [mantissa, exponent] = rendered.split("e"), digits = mantissa.replace(".", ""), point = (mantissa.indexOf(".") < 0 ? mantissa.length : mantissa.indexOf(".")) + Number(exponent);
    rendered = point <= 0 ? `0.${"0".repeat(-point)}${digits}` : point >= digits.length ? digits + "0".repeat(point - digits.length) : digits.slice(0, point) + "." + digits.slice(point);
  }
  return canonical(input) === canonical(rendered);
}
/** Bounded CSV, quoted commas/newlines and escaped quotes; no formula execution. */
export function parseHoldingsCsv(csv: string): ImportTable {
  if (csv.length > 1_000_000) throw new Error("فایل حداکثر یک میلیون نویسه باشد.");
  const matrix: string[][] = []; let row: string[] = [], field = "", quoted = false, closed = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (quoted) { if (c === '"') { if (csv[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } } else field += c; continue; }
    if (c === '"') { if (field || closed) throw new Error("نقل‌قول فایل معتبر نیست."); quoted = true; continue; }
    if (closed && c !== "," && c !== "\r" && c !== "\n") throw new Error("پس از نقل‌قول جداکننده لازم است.");
    if (c === "," || c === "\n" || c === "\r") {
      row.push(field); field = ""; closed = false;
      if (c !== ",") { if (c === "\r" && csv[i + 1] === "\n") i++; if (row.some(v => v.trim())) matrix.push(row); row = []; }
    } else field += c;
  }
  if (quoted) throw new Error("نقل‌قول فایل بسته نشده است.");
  row.push(field); if (row.some(v => v.trim())) matrix.push(row);
  if (matrix.length < 2 || matrix.length > 501) throw new Error("فایل باید عنوان ستون و ۱ تا ۵۰۰ ردیف داشته باشد.");
  const headers = matrix[0].map(h => h.replace(/^\uFEFF/, "").trim());
  if (headers.some(h => !h) || new Set(headers).size !== headers.length) throw new Error("عنوان ستون‌ها خالی یا تکراری است.");
  const rows = matrix.slice(1).map(r => { if (r.length !== headers.length) throw new Error("تعداد ستون‌های ردیف‌ها با عنوان فایل برابر نیست."); return Object.fromEntries(headers.map((h, i) => [h, r[i]])); });
  return { headers, rows };
}
export function positionWriteInput(p: HoldingPosition): Record<string, unknown> {
  return { position_key: p.positionKey, symbol: p.symbol, manual_label: p.manualLabel, asset_class: p.assetClass, qty: p.qty, unit: p.unit,
    cost_basis: p.costBasis, as_of: p.asOf, title: p.title ?? null, ownership_pct: p.ownershipPct ?? 100,
    valuation_mode: p.valuationMode ?? "market", declared_value: p.declaredValue ?? null, currency: "IRT",
    valuation_source: p.valuationSource ?? null, valuation_as_of: p.valuationAsOf ?? null, valuation_status: p.valuationStatus ?? "valid" };
}
export function canonicalPayload(positions: readonly Record<string, unknown>[]): string {
  return JSON.stringify(positions.map(p => {
    const n = normalisePosition(p);
    return Object.fromEntries(["position_key", "symbol", "manual_label", "asset_class", "qty", "unit", "cost_basis", "as_of", "title", "ownership_pct", "valuation_mode", "declared_value", "valuation_source", "valuation_as_of", "valuation_status"].map(k => [k, n[k] ?? null]));
  }).sort((a, b) => String(a.position_key).localeCompare(String(b.position_key))));
}
export function previewHoldingsImport(table: ImportTable, mapping: ImportMapping, current: readonly HoldingPosition[], allowUpdates: boolean) {
  const seen = new Set<string>();
  const entries = table.rows.map((source, index) => {
    const input: Record<string, unknown> = Object.fromEntries(IMPORT_FIELDS.map(k => [k, mapping[k] ? source[mapping[k]!] : ""]));
    for (const k of IMPORT_FIELDS) input[k] = aliases[k]?.[text(input[k])] ?? input[k];
    const errors: string[] = [];
    let normalized: Record<string, unknown> | null = null;
    try {
      if (!text(input.ownership_pct)) throw new Error("سهم مالکیت باید صریح در فایل وارد شود.");
      if (!text(input.valuation_mode)) throw new Error("روش ارزش‌گذاری باید صریح باشد.");
      if (text(input.qty) && !exactQuantity(text(input.qty))) throw new Error("دقت مقدار در تبدیل عدد حفظ نمی‌شود؛ مقدار را اصلاح کنید.");
      if (text(input.cost_basis)) input.cost_basis = moneyInput(input.cost_basis, input.cost_basis_currency);
      normalized = normalisePosition(input);
      const key = String(normalized.position_key);
      if (seen.has(key)) throw new Error("شناسه قلم در فایل تکراری است.");
      seen.add(key);
      if (current.some(p => p.positionKey === key) && !allowUpdates) throw new Error("این قلم موجود است؛ اصلاح اقلام موجود را صریح تأیید کنید.");
    } catch (e) { errors.push(e instanceof Error ? e.message : "ردیف نامعتبر است."); normalized = null; }
    return { row: index + 2, input, normalized, errors };
  });
  const merged = current.map(positionWriteInput);
  for (const e of entries) if (e.normalized) { const index = merged.findIndex(p => p.position_key === e.normalized!.position_key); if (index < 0) merged.push(e.normalized); else merged[index] = e.normalized; }
  const errors = entries.flatMap(e => e.errors);
  if (merged.length > 500) errors.push("مجموع اقلام موجود و فایل بیش از ۵۰۰ است.");
  const valid = !errors.length && entries.length > 0;
  return { entries, errors, valid, positions: valid ? merged : null, retainedCount: current.filter(p => !seen.has(p.positionKey)).length };
}
