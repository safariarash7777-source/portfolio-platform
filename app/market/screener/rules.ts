export const fields = {
  change: { label: "تغییر قیمت (%)", example: "۳" },
  volume: { label: "حجم معاملات (تعداد سهم)", example: "۱۰۰۰۰۰۰" },
  pe: { label: "نسبت قیمت به سود (P/E)", example: "۱۰" },
} as const;

export type Field = keyof typeof fields;
export type Filter = { field: Field; operator: "gte" | "lte"; value: string };
export type Row = {
  id: string; name: string; industry: string | null; price: number | null;
  change: number | null; volume: number | null; pe: number | null;
};

export const emptyFilter = (): Filter => ({ field: "change", operator: "gte", value: "" });
export const fieldsList = Object.keys(fields) as Field[];
export const normalize = (input: string) => input.trim().replace(/[۰-۹٠-٩]/g, (digit) =>
  String(digit.charCodeAt(0) - (digit.charCodeAt(0) >= 1776 ? 1776 : 1632)))
  .replace(/[يكـ]/g, (c) => c === "ي" ? "ی" : c === "ك" ? "ک" : "");
export function readThreshold(raw: string): number | null {
  const v = normalize(raw).replace(/[٬,]/g, "").replace(/٫/g, ".").replace(/−/g, "-");
  return /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(v) && Number.isFinite(Number(v)) ? Number(v) : null;
}
export function validFilters(value: unknown): value is Filter[] {
  return Array.isArray(value) && value.length <= 4 && value.every((f) =>
    !!f && typeof f === "object" && Object.hasOwn(fields, f.field) &&
    (f.operator === "gte" || f.operator === "lte") && typeof f.value === "string" &&
    f.value.length <= 32 && (f.value.trim() === "" || readThreshold(f.value) !== null));
}
export function screen(rows: Row[], query: string, industry: string, filters: Filter[]) {
  const term = normalize(query);
  const tested = filters.flatMap((filter) => {
    const threshold = readThreshold(filter.value);
    return threshold === null ? [] : [{ ...filter, threshold }];
  });
  const result = { eligible: 0, missing: 0, excluded: 0, matched: [] as Row[] };
  for (const row of rows) {
    if (industry && row.industry !== industry) continue;
    if (term && !normalize(row.name).includes(term) && !normalize(row.id).includes(term)) continue;
    result.eligible++;
    if (tested.some((f) => row[f.field] === null)) { result.missing++; continue; }
    if (tested.some((f) => f.operator === "gte" ? row[f.field]! < f.threshold : row[f.field]! > f.threshold)) {
      result.excluded++;
      continue;
    }
    result.matched.push(row);
  }
  return result;
}
